/* sync.js — email-code login + Supabase persistence + realtime for the PMO app.
   Runs after the app script and replaces its localStorage load()/save(). The app keeps working on the in-memory
   object S; this layer fills S from the database (Row Level Security decides what each person gets), and writes
   changed rows back with optimistic version checks. */
(() => {
'use strict';
const CFG = window.PMO_CONFIG || {};
const appEl = document.getElementById('app');
if (!CFG.url || !CFG.anon || !window.supabase) { appEl.innerHTML = '<p style="padding:40px;font:14px sans-serif">Missing config.js (Supabase URL / anon key).</p>'; return; }
const sb = supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------- files: Supabase Storage bucket 'project-files' (private). Paths start with the project id so row-level security can follow the project. ---------- */
window.fileBackend = {
  async put(file, pid) {
    const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
    const path = `${pid || 'misc'}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const { error } = await sb.storage.from('project-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) { const e = new Error(error.message); if (/exceed|too large|size|payload/i.test(error.message)) e.code = 'too_big'; throw e; }
    return { name: file.name, size: file.size, type: file.type, path, at: today(), by: me().name };
  },
  async url(f) {
    const { data, error } = await sb.storage.from('project-files').createSignedUrl(f.path, 300, { download: f.name });
    if (error) throw error;
    return data.signedUrl;
  },
};

/* ---------- mail read state: one row per person and email (table mail_reads) ---------- */
window.mailReadBackend = {
  async mark(ids) {
    const uid = S.user, rows = ids.map(id => ({ user_id: uid, mail_id: id, read_at: new Date().toISOString() }));
    const { error } = await sb.from('mail_reads').upsert(rows);
    if (error) console.error(error);
  },
};

const SETTING_KEYS = ['rules', 'lead', 'cadence', 'tracks', 'departed', 'acctReqs', 'acks', 'sent', 'reviews'];
const ORDER = ['teams', 'projects', 'requests', 'records', 'mail_outbox', 'app_state'];
const UPS = new Set(['teams', 'app_state']);          // upserted, no version column
let LAST = {}, VER = {}, MEM = new Set(), READY = false;
let timer = null, pushing = Promise.resolve(), inflight = 0, epoch = 0, pullTimer = null, pendingRender = false, sig = '';

const key = (t, r) => t + ':' + (r.id ?? r.code ?? r.key);
const esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- object <-> row ---------- */
const pRow = (x, kind) => ({ id: x.id, code: x.code || null, kind, team: x.team, section: x.section || '', status: x.status || 'not_started', name: x.name || '', data: x });
const rRow = x => ({ id: x.id, type: x.type, status: x.status, team: x.team, project_id: x.pid || null, submitted_by: x.by, data: x, decision: x.decision || null });
const teamOfPid = pid => { const p = [...S.projects, ...S.follows, ...(S.alsa || [])].find(p => p.id === pid); return p ? p.team : null; };
const cRow = (kind, x) => ({ id: x.id, kind, team: kind === 'todo' ? null : (x.team || teamOfPid(x.pid)), project_id: x.pid || null, data: x });
const mRow = x => ({ id: x.id, status: x.status, to_emails: (x.to || []).filter(y => y.e).map(y => y.e), cc_emails: (x.cc || []).filter(y => y.e).map(y => y.e),
  subject: x.subject || '', body: x.body || '', rule: x.rule || null, ref: x.ref ? String(x.ref) : null, data: x });
// rows written by database triggers carry no data blob; rebuild the app's shape from the columns
const mFrom = r => (r.data && r.data.subject !== undefined) ? { ...r.data, id: r.id, status: r.status }
  : { id: r.id, status: r.status, at: String(r.created_at || '').slice(0, 16).replace('T', ' '), to: r.to_emails.map(e => ({ n: e, e })), cc: r.cc_emails.map(e => ({ n: e, e })),
      subject: r.subject, body: r.body, rule: r.rule || 'manual', ref: r.ref };
const SPECS = [
  { t: 'projects', arr: 'projects', row: x => pRow(x, 'project'), filter: r => r.kind === 'project' },
  { t: 'projects', arr: 'follows', row: x => pRow(x, 'follow'), filter: r => r.kind === 'follow' },
  { t: 'projects', arr: 'alsa', row: x => pRow(x, 'alsa'), filter: r => r.kind === 'alsa' },
  { t: 'requests', arr: 'requests', row: rRow },
  { t: 'records', arr: 'todos', row: x => cRow('todo', x), filter: r => r.kind === 'todo' },
  { t: 'records', arr: 'issues', row: x => cRow('issue', x), filter: r => r.kind === 'issue' },
  { t: 'records', arr: 'meetings', row: x => cRow('meeting', x), filter: r => r.kind === 'meeting' },
  { t: 'records', arr: 'alsaTopics', row: x => cRow('alsa_topic', x), filter: r => r.kind === 'alsa_topic' },
  { t: 'records', arr: 'alsaRes', row: x => cRow('alsa_res', x), filter: r => r.kind === 'alsa_res' },
  { t: 'mail_outbox', arr: 'mails', row: mRow, from: mFrom, skip: x => !x.status || x.status === 'local' },
];
const teamRow = t => ({ code: t.code, zh: t.zh, en: t.en, grp: t.group, dept: t.dept || null });
const settingsRow = () => ({ key: 'settings', data: Object.fromEntries(SETTING_KEYS.map(k => [k, S[k]])) });

function collect(pmo) {
  const out = [];
  if (pmo) (S.teams || []).forEach(t => out.push(['teams', teamRow(t)]));
  for (const sp of SPECS) (S[sp.arr] || []).forEach(x => { if (!(sp.skip && sp.skip(x))) out.push([sp.t, sp.row(x)]); });
  if (pmo) out.push(['app_state', settingsRow()]);
  return out;
}

/* ---------- saving ---------- */
let failed = false;
function fail(err) {
  failed = true; console.error(err);
  const m = String(err.message || err);
  if (err.code === '40001') toast(T('别人刚改过这条记录，已为你刷新，请重新操作', 'Someone else just changed this record. It was refreshed; please redo your edit.'), 'warn');
  else if (err.code === '23505') toast(T('编号已被占用，已刷新，请重试', 'That code is already taken. Refreshed; please try again.'), 'warn');
  else if (err.code === '42501' || /row-level security/i.test(m) || err.code === 'NOPERM') toast(T('你没有权限做这个修改', 'You do not have permission for that change'), 'err');
  else toast(T('保存失败：', 'Save failed: ') + m.slice(0, 90), 'err');
}

async function push() {
  if (!S || !READY) return;
  inflight++; failed = false;
  try {
    const pmo = isPMO();
    const ch = collect(pmo).filter(([t, r]) => LAST[key(t, r)] !== JSON.stringify(r));
    for (const t of ORDER) {
      const mine = ch.filter(x => x[0] === t);
      if (UPS.has(t)) {
        if (!mine.length) continue;
        const { error } = await sb.from(t).upsert(mine.map(x => x[1]));
        if (error) fail(error); else mine.forEach(([tt, r]) => LAST[key(tt, r)] = JSON.stringify(r));
        continue;
      }
      const news = mine.filter(([tt, r]) => !(key(tt, r) in VER));
      for (let i = 0; i < news.length; i += 100) {
        const part = news.slice(i, i + 100);
        const { error } = await sb.from(t).insert(part.map(x => x[1]));
        if (error) fail(error); else part.forEach(([tt, r]) => { LAST[key(tt, r)] = JSON.stringify(r); VER[key(tt, r)] = 1; });
      }
      for (const [tt, r] of mine.filter(([tt, r]) => key(tt, r) in VER)) {
        const k = key(tt, r);
        const { data, error } = await sb.from(tt).update({ ...r, version: VER[k] }).eq('id', r.id).select('version');
        if (error) fail(error);
        else if (!data.length) fail({ code: 'NOPERM', message: 'no permission' });
        else { VER[k] = data[0].version; LAST[k] = JSON.stringify(r); }
      }
    }
    await syncMembers();
  } finally { inflight--; }
  if (failed) schedulePull(true);
}

// who is on which project (drives "assigned" emails and project-level visibility). PMO only.
const userIdOf = name => { const e = emailOf(name); const u = e && S.users.find(u => u.email === e); return u ? u.id : null; };
async function syncMembers() {
  if (!S || !isPMO()) return;
  const want = new Set();
  for (const p of [...S.projects, ...S.follows, ...(S.alsa || [])]) {
    if (!(('projects:' + p.id) in VER)) continue;                  // row not in the database (yet)
    const add = (n, role) => { const u = n && userIdOf(n); if (u) want.add(`${p.id}|${u}|${role}`); };
    add(p.pic, 'owner'); (p.exec || []).forEach(n => add(n, 'executor'));
  }
  const add = [...want].filter(k => !MEM.has(k)), del = [...MEM].filter(k => !want.has(k));
  const row = k => { const [project_id, user_id, role] = k.split('|'); return { project_id, user_id, role }; };
  for (let i = 0; i < add.length; i += 100) {
    const { error } = await sb.from('project_members').insert(add.slice(i, i + 100).map(row));
    if (error) console.error(error); else add.slice(i, i + 100).forEach(k => MEM.add(k));
  }
  for (const k of del) {
    const r = row(k);
    const { error } = await sb.from('project_members').delete().match(r);
    if (error) console.error(error); else MEM.delete(k);
  }
}

function persistUi() { try { localStorage.setItem(KEY, JSON.stringify({ theme: S.theme, lang: S.lang, bg: S.bg })); } catch (e) {} }
const readUi = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };

window.save = function () {
  for (const p of S.projects || []) if (p.staleClosed && p.status !== 'closed') { p.staleReopened = p.staleClosed; delete p.staleClosed; }
  epoch++; persistUi();
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; pushing = pushing.then(push).catch(console.error); }, 350);
};
async function flush() { if (timer) { clearTimeout(timer); timer = null; pushing = pushing.then(push).catch(console.error); } await pushing; }
window.resetAll = () => toast(T('线上版本没有演示数据可恢复', 'There is no demo data to reset in the live version'), 'info');
window.addEventListener('beforeunload', e => { if (timer || inflight) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- loading ---------- */
async function all(t) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select('*').order(t === 'teams' ? 'code' : t === 'app_state' ? 'key' : t === 'user_scopes' ? 'user_id' : t === 'project_members' ? 'project_id' : t === 'mail_reads' ? 'mail_id' : 'id').range(from, from + 999);
    if (error) throw error;
    out = out.concat(data); if (data.length < 1000) break; from += 1000;
  }
  return out;
}

// returns true when the data changed (so the caller knows to repaint)
async function pull(force) {
  await flush();
  const e0 = epoch;
  const [teams, prof, scopes, projs, reqs, recs, mem, st, mails, reads] = await Promise.all([...['teams', 'profiles', 'user_scopes', 'projects', 'requests', 'records', 'project_members', 'app_state', 'mail_outbox'].map(all), all('mail_reads').catch(() => [])]);
  if (epoch !== e0) return false;                                   // user edited meanwhile; try again later
  const newSig = [...projs, ...reqs, ...recs, ...mails].map(r => r.id + '@' + r.version + r.status).sort().join(',') + '|' + st.map(r => r.key + r.updated_at).join(',') + '|' + prof.map(p => p.id + p.role + p.status + p.alsa + p.risk_all).join(',') + '|' + scopes.length;
  if (!force && newSig === sig && S) return false;
  sig = newSig;
  const ui = readUi();
  const fresh = !S;
  if (fresh) S = { v: 2, lang: ui.lang || 'en', user: null, teamView: null, view: 'dashboard', simToday: null, drawer: null, filters: {}, bg: ui.bg || 'hero-forest', theme: ui.theme === 'dark' ? 'dark' : 'light', mails: [], patches: ['p3','p4','p5','p6','p7','p9','p10','p11','p12','p13','p14','p15','p16','p17'], alsaTopics: [] };

  S.teams = teams.map(t => ({ code: t.code, zh: t.zh, en: t.en, group: t.grp, dept: t.dept }));
  S.users = prof.map(p => {
    const sc = scopes.filter(s => s.user_id === p.id);
    return { id: p.id, name: p.name, role: p.role, teams: sc.filter(s => !s.section).map(s => s.team), secs: sc.filter(s => s.section).map(s => s.team + '|' + s.section),
             lang: p.lang, alsa: !!p.alsa, alsaRole: p.alsa, riskAll: !!p.risk_all, side: '', status: p.status, title: p.title || '', email: p.email };
  });
  ALSA_ROLES.forEach(r => { r.ids.length = 0; prof.filter(p => p.alsa === r.k && p.status === 'active').forEach(p => r.ids.push(p.id)); });
  ALSA_IDS.length = 0; ALSA_IDS.push(...ALSA_ROLES.filter(r => r.vote).flatMap(r => r.ids));

  LAST = {}; VER = {};
  const track = (sp, r) => { const o = sp.from ? sp.from(r) : { ...r.data, id: r.id }; const k = sp.t + ':' + r.id; LAST[k] = JSON.stringify(sp.row(o)); VER[k] = r.version; return o; };
  const src = { projects: projs, requests: reqs, records: recs, mail_outbox: mails };
  const localMails = (S.mails || []).filter(m => !m.status || m.status === 'local');
  for (const sp of SPECS) S[sp.arr] = src[sp.t].filter(sp.filter || (() => true)).map(r => track(sp, r));
  S.mails = [...S.mails, ...localMails].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  teams.forEach(t => LAST['teams:' + t.code] = JSON.stringify(teamRow({ ...t, group: t.grp })));
  MEM = new Set(mem.map(m => `${m.project_id}|${m.user_id}|${m.role}`));
  S.mailRead = {}; reads.forEach(r => { (S.mailRead[r.user_id] = S.mailRead[r.user_id] || {})[r.mail_id] = r.read_at; });

  const s = (st.find(x => x.key === 'settings') || {}).data || {};
  Object.assign(S, { rules: Object.fromEntries(RULES.map(r => [r.k, true])), lead: 15, cadence: { anchor: '2026-10-19', first: 'en', dow: 3, start: '2026-10-21' },
                     tracks: initTracks(), departed: [], acctReqs: [], acks: {}, sent: {}, reviews: {} }, s);
  LAST['app_state:settings'] = JSON.stringify(settingsRow());
  if (typeof pinKeys === 'function') pinKeys();
  return true;
}

function schedulePull(force) {
  clearTimeout(pullTimer);
  pullTimer = setTimeout(async () => {
    try { if (await pull(force)) { if (typing()) pendingRender = true; else render(); } } catch (e) { console.error(e); }
  }, force ? 100 : 800);
}
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || !!document.querySelector('.qa-scrim'); };
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; render(); } }, 300));

/* ---------- which pages are used (PMO reads it; everybody writes their own rows) ---------- */
window.usageBackend = {
  async log(evs) { const { error } = await sb.from('usage_events').insert(evs.map(e => ({ day: e.d, role: e.r, view: e.v }))); if (error) throw error; },
  async fetch(days) {
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const { data, error } = await sb.from('usage_events').select('day,user_id,role,view').gte('day', since).limit(20000);
    if (error) throw error; return (data || []).map(x => ({ d: x.day, u: x.user_id, r: x.role, v: x.view }));
  }
};
/* ---------- sign-in ---------- */
function authScreen(mode, email, msg) {
  mode = mode || 'signin';
  document.documentElement.dataset.theme = 'light';
  appEl.removeAttribute('aria-busy');
  const up = mode === 'signup';
  appEl.innerHTML = `<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
  <form id="authForm" class="card" style="width:min(400px,100%);padding:28px;display:grid;gap:14px">
    <div><span class="pmo-badge">PMO</span></div>
    <h1 style="margin:0;font:600 20px/1.3 var(--f-display)">EMEA After-sales PMO</h1>
    <p class="muted small" style="margin:0">${up ? 'First time here? Create your account with your company email. Only people on the access list can do this.' : 'Sign in with your company email and password.'}</p>
    <div class="f"><label for="aEmail">Email</label><input id="aEmail" type="email" required autocomplete="email" value="${esc2(email || '')}" autofocus></div>
    <div class="f"><label for="aPw">Password</label><input id="aPw" type="password" required minlength="8" autocomplete="${up ? 'new-password' : 'current-password'}">${up ? '<span class="hint">At least 8 characters.</span>' : ''}</div>
    ${up ? '<div class="f"><label for="aPw2">Repeat password</label><input id="aPw2" type="password" required minlength="8" autocomplete="new-password"></div>' : ''}
    ${msg ? '<div class="note bad" role="alert">' + esc2(msg) + '</div>' : ''}
    <button class="btn pri" type="submit">${up ? 'Create account' : 'Sign in'}</button>
    <button class="btn ghost" type="button" id="aSwitch">${up ? 'I already have an account' : 'First time? Create account'}</button>
    ${up ? '' : '<p class="muted small" style="margin:0">Forgot your password? Ask the PMO to reset it.</p>'}
  </form></main>`;
  const f = document.getElementById('authForm');
  document.getElementById('aSwitch').addEventListener('click', () => authScreen(up ? 'signin' : 'signup', f.aEmail.value));
  f.addEventListener('submit', async e => {
    e.preventDefault(); const b = f.querySelector('button[type=submit]'); b.disabled = true;
    const em = f.aEmail.value.trim().toLowerCase(), pw = f.aPw.value;
    if (up) {
      if (pw !== f.aPw2.value) return authScreen('signup', em, 'The two passwords do not match.');
      const { data, error } = await sb.auth.signUp({ email: em, password: pw });
      if (error) return authScreen('signup', em, /database error|not.*roster/i.test(error.message) ? 'This email is not on the access list. Please ask the PMO to add you.' : error.message);
      if (!data.session) return authScreen('signin', em, 'Account created, but the project still requires email confirmation. Ask the PMO to turn that off, then sign in.');
      begin(data.session);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (error) return authScreen('signin', em, 'Wrong email or password.');
      begin(data.session);
    }
  });
}

async function start(session) {
  try {
    await pull(true);
    S.user = session.user.id;
    const u = S.users.find(x => x.id === S.user);
    if (!u || u.status !== 'active') {
      appEl.innerHTML = '<main style="padding:40px;font:14px sans-serif">This account is not active. Please contact the PMO.<br><br><button class="btn" id="so">Sign out</button></main>';
      document.getElementById('so').onclick = signOut; return;
    }
    READY = true;
    if (isPMO()) try { runReminders(); } catch (e) { console.error(e); }
    render();
    try { histBoot(); } catch (e) { console.error(e); }
    sb.channel('pmo').on('postgres_changes', { event: '*', schema: 'public' }, () => schedulePull()).subscribe();
    if (isPMO() && location.hash === '#import' && typeof SEED !== 'undefined' && SEED.projects.length && !S.projects.length) importLegacy();
  } catch (e) {
    console.error(e);
    appEl.innerHTML = '<main style="padding:40px;font:14px sans-serif">Could not load data: ' + esc2(e.message || e) + '<br><br><button class="btn" onclick="location.reload()">Retry</button></main>';
  }
}
async function signOut() { await sb.auth.signOut(); location.reload(); }
document.addEventListener('click', e => { if (e.target.closest('[data-act=signout]')) { e.stopPropagation(); signOut(); } }, true);

/* ---------- one-time import of the legacy tracker (import build only; PMO opens the page with #import) ---------- */
async function importLegacy() {
  if (!confirm('Import the legacy tracker (' + SEED.projects.length + ' projects, ' + SEED.follows.length + ' follow-ups) into the database? Mail is muted during the import.')) return;
  toast('Importing…', 'info');
  const keep = { users: S.users, user: S.user, lang: S.lang, bg: S.bg, theme: S.theme };
  await sb.from('app_state').update({ data: { mute_mail: true } }).eq('key', 'flags');
  initState();                                       // the app's own seed logic, incl. the legacy-closure rule
  Object.assign(S, keep);
  S.requests = []; S.mails = []; S.todos = []; S.meetings = []; S.alsaTopics = []; S.alsaRes = []; S.issues = (S.issues || []).filter(i => !i.example);
  LAST = {}; VER = {}; MEM = new Set(); READY = true;
  await flush(); await push();
  await sb.from('app_state').update({ data: { mute_mail: false } }).eq('key', 'flags');
  await pull(true); render();
  toast('Import finished', 'ok');
}

/* ---------- boot ---------- */
let started = false;
const begin = s => { if (started) return; started = true; if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname); start(s); };
sb.auth.onAuthStateChange((ev, s) => {
  if (ev === 'SIGNED_OUT' && READY) location.reload();
  if (ev === 'SIGNED_IN' && s) begin(s);            // link clicked (this tab, or another tab of the same browser)
});
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) begin(session); else authScreen('signin');
})();
})();
