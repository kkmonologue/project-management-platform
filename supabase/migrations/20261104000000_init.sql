-- BYD EMEA Aftersales PMO — initial schema, row-level security, outbox mail
-- Design: hot columns used for permissions/search are real columns; the flexible
-- part of each record (milestones, forms, updates...) stays in `data jsonb`, so the
-- existing frontend object shapes keep working. History is append-only.

create extension if not exists pgcrypto;

-- ───────────────────────── reference ─────────────────────────
create table public.teams (
  code  text primary key,            -- e.g. GER, FRA, TEC
  zh    text not null,
  en    text not null,
  grp   text not null check (grp in ('R','C')),   -- R = regions, C = back-office
  dept  text
);

-- PMO pre-registers who may enter, with role and scope. First login auto-provisions from this.
create table public.roster (
  email  text primary key check (email = lower(email)),
  name   text not null,
  role   text not null check (role in ('pmo','mgr','member','viewer')),
  lang   text not null default 'en' check (lang in ('zh','en')),
  title  text,
  alsa   text,                        -- null | steer | exec | advisor | pmo | sec
  teams  text[] not null default '{}',   -- 'GER' = whole team, 'SEN|渠道管理' = one section
  active boolean not null default true
);

create table public.profiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  email   text not null unique,
  name    text not null,
  role    text not null check (role in ('pmo','mgr','member','viewer')),
  lang    text not null default 'en',
  title   text,
  alsa    text,
  status  text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

create table public.user_scopes (          -- region/team/section visibility
  user_id uuid not null references public.profiles(id) on delete cascade,
  team    text not null references public.teams(code),
  section text not null default '',        -- '' = whole team
  primary key (user_id, team, section)
);

-- ───────────────────────── core records ─────────────────────────
create table public.projects (
  id         text primary key default gen_random_uuid()::text,   -- text: the app mints its own ids
  code       text unique,                  -- GER-26-001 / GER-26-F01 / GER-26-A01
  kind       text not null default 'project' check (kind in ('project','follow','alsa')),
  team       text not null references public.teams(code),
  section    text not null default '',
  status     text not null default 'not_started',   -- app states (ALSA projects add draft/voting...)
  name       text not null,
  data       jsonb not null default '{}',  -- milestones, updates, pic, exec, dates...
  version    int  not null default 1,      -- optimistic concurrency
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.projects (team, section);
create index on public.projects (status);

create table public.project_members (      -- project-level access + assignment
  project_id text not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('owner','executor','sponsor')),
  primary key (project_id, user_id, role)
);

create table public.requests (              -- new / change / close, with decision
  id         text primary key default gen_random_uuid()::text,
  type       text not null check (type in ('new','change','close','alsa')),
  status     text not null default 'pending'
             check (status in ('pending','approved','rejected','returned','withdrawn')),
  team       text not null references public.teams(code),
  project_id text references public.projects(id),
  submitted_by uuid not null references public.profiles(id),
  data       jsonb not null default '{}',
  decision   jsonb,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.requests (status, team);

-- todos, issues, meetings, ALSA topics: same scoping, one generic table
create table public.records (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('todo','issue','meeting','alsa_topic')),
  team text references public.teams(code),
  project_id text references public.projects(id) on delete cascade,
  data jsonb not null default '{}',
  version int not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- append-only history (project timeline + who changed what)
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  tbl text not null,
  row_id text not null,
  action text not null,
  old_row jsonb,
  new_row jsonb
);

-- code numbering must be atomic; two people approving at once must not get the same number
create table public.code_counters (
  team text not null, yy text not null, kind text not null default '',
  last int not null default 0,
  primary key (team, yy, kind)
);

create or replace function public.next_code(p_team text, p_yy text, p_kind text default '')
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into code_counters as c (team, yy, kind, last) values (p_team, p_yy, p_kind, 1)
  on conflict (team, yy, kind) do update set last = c.last + 1
  returning last into n;
  return p_team || '-' || p_yy || '-' || p_kind ||
         case when p_kind = '' then lpad(n::text, 3, '0') else lpad(n::text, 2, '0') end;
end $$;
revoke all on function public.next_code from public, anon;
grant execute on function public.next_code to authenticated;

-- ───────────────────────── mail outbox ─────────────────────────
create table public.mail_outbox (
  id bigint generated always as identity primary key,
  to_emails text[] not null,
  cc_emails text[] not null default '{}',
  subject text not null,
  body text not null,
  rule text, ref text,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.mail_outbox enable row level security;   -- no policies: only service role

create or replace function public.enqueue_mail(p_to text[], p_cc text[], p_subject text, p_body text, p_rule text, p_ref text)
returns void language sql security definer set search_path = public as $$
  insert into mail_outbox (to_emails, cc_emails, subject, body, rule, ref)
  select p_to, coalesce(p_cc,'{}'), p_subject, p_body, p_rule, p_ref
  where array_length(p_to,1) > 0;
$$;
revoke all on function public.enqueue_mail from public, anon, authenticated;

-- ───────────────────────── auth → profile (invite-only) ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r roster%rowtype; s text;
begin
  select * into r from roster where email = lower(new.email) and active;
  if not found then
    raise exception 'Email % is not on the roster', new.email;   -- blocks uninvited sign-ups
  end if;
  insert into profiles (id, email, name, role, lang, title, alsa)
    values (new.id, r.email, r.name, r.role, r.lang, r.title, r.alsa);
  foreach s in array r.teams loop
    insert into user_scopes (user_id, team, section)
      values (new.id, split_part(s,'|',1), coalesce(nullif(split_part(s,'|',2),''),''))
      on conflict do nothing;
  end loop;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── permission helpers ─────────────────────────
create or replace function public.me_role() returns text language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and status = 'active' $$;
create or replace function public.is_pmo() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(me_role() = 'pmo', false) $$;
create or replace function public.in_alsa() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and status='active' and alsa in ('steer','exec','advisor','pmo','sec')) $$;
create or replace function public.can_see_team(p_team text, p_section text default '')
returns boolean language sql stable security definer set search_path = public as $$
  select is_pmo() or exists (
    select 1 from user_scopes s join profiles p on p.id = s.user_id
    where s.user_id = auth.uid() and p.status = 'active' and s.team = p_team
      and (s.section = '' or s.section = coalesce(p_section,'')));
$$;
create or replace function public.is_member(p_project text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from project_members where project_id = p_project and user_id = auth.uid()) $$;
-- who may edit: PMO, or a manager of that team/section, or the project's owner/executor. Viewers never.
create or replace function public.can_edit_project(p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_pmo() or exists (
    select 1 from projects pr where pr.id = p_id and me_role() in ('mgr','member')
      and (can_see_team(pr.team, pr.section) or is_member(pr.id)))
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.teams           enable row level security;
alter table public.roster          enable row level security;
alter table public.profiles        enable row level security;
alter table public.user_scopes     enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.requests        enable row level security;
alter table public.records         enable row level security;
alter table public.audit_log       enable row level security;
alter table public.code_counters   enable row level security;

create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_pmo  on public.teams for all    to authenticated using (is_pmo()) with check (is_pmo());

create policy roster_pmo on public.roster for all to authenticated using (is_pmo()) with check (is_pmo());

-- directory: everyone signed in can see names (needed to assign people), PMO manages
create policy prof_read  on public.profiles for select to authenticated using (true);
create policy prof_pmo   on public.profiles for all    to authenticated using (is_pmo()) with check (is_pmo());
create policy prof_self  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy scope_read on public.user_scopes for select to authenticated using (true);   -- directory: who manages which team
create policy scope_pmo  on public.user_scopes for all    to authenticated using (is_pmo()) with check (is_pmo());

create policy proj_read on public.projects for select to authenticated using (
  can_see_team(team, section) or is_member(id) or (kind = 'alsa' and in_alsa()));
create policy proj_ins  on public.projects for insert to authenticated with check (
  is_pmo() or (kind = 'follow' and me_role() in ('mgr','member') and can_see_team(team, section)));   -- projects are created by PMO on approval
create policy proj_upd  on public.projects for update to authenticated using (can_edit_project(id)) with check (can_edit_project(id));
create policy proj_del  on public.projects for delete to authenticated using (false);          -- never delete; close/cancel

create policy pm_read on public.project_members for select to authenticated using (
  user_id = auth.uid() or is_pmo() or exists (select 1 from projects p where p.id = project_id and can_see_team(p.team, p.section)));
create policy pm_pmo  on public.project_members for all to authenticated using (is_pmo()) with check (is_pmo());

create policy req_read on public.requests for select to authenticated using (
  submitted_by = auth.uid() or can_see_team(team));
create policy req_ins  on public.requests for insert to authenticated with check (
  submitted_by = auth.uid() and me_role() in ('pmo','mgr','member') and can_see_team(team));
create policy req_upd  on public.requests for update to authenticated using (
  is_pmo() or (submitted_by = auth.uid() and status in ('pending','returned')))
  with check (is_pmo() or submitted_by = auth.uid());   -- submitter may withdraw or resubmit
-- NOTE: Phase 2 replaces direct decision updates with a decide_request() RPC that also checks ALSA voting rules.

create policy rec_read on public.records for select to authenticated using (
  is_pmo() or (team is not null and can_see_team(team)) or (kind in ('meeting','alsa_topic') and in_alsa()));
create policy rec_write on public.records for all to authenticated
  using (is_pmo() or (team is not null and can_see_team(team) and me_role() in ('mgr','member')))
  with check (is_pmo() or (team is not null and can_see_team(team) and me_role() in ('mgr','member')));

create policy audit_read on public.audit_log for select to authenticated using (is_pmo());
-- code_counters: no policies, only next_code() (security definer) touches it

-- members cannot promote themselves
create or replace function public.guard_profile() returns trigger language plpgsql as $$
begin
  if not is_pmo() and (new.role is distinct from old.role or new.email is distinct from old.email
      or new.status is distinct from old.status or new.alsa is distinct from old.alsa) then
    raise exception 'Only PMO can change role, email, status or ALSA membership';
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- ───────────────────────── versioning + audit ─────────────────────────
create or replace function public.bump_version() returns trigger language plpgsql as $$
begin
  if new.version <> old.version then      -- client sends the version it read; stale write is refused
    raise exception 'Conflict: record changed by someone else (have %, db %)', new.version, old.version using errcode = '40001';
  end if;
  new.version := old.version + 1; new.updated_at := now(); return new;
end $$;
create trigger v_projects before update on public.projects for each row execute function public.bump_version();
create trigger v_requests before update on public.requests for each row execute function public.bump_version();
create trigger v_records  before update on public.records  for each row execute function public.bump_version();

create or replace function public.audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, tbl, row_id, action, old_row, new_row)
  values (auth.uid(), tg_table_name, coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger a_projects after insert or update or delete on public.projects for each row execute function public.audit();
create trigger a_requests after insert or update or delete on public.requests for each row execute function public.audit();
create trigger a_profiles after update or delete on public.profiles for each row execute function public.audit();
create trigger a_members  after insert or delete on public.project_members for each row execute function public.audit();

-- ───────────────────────── key-node notifications ─────────────────────────
-- 1) new request → PMO
create or replace function public.n_request_new() returns trigger language plpgsql security definer set search_path = public as $$
declare who text[]; s text;
begin
  select array_agg(email) into who from profiles where role = 'pmo' and status = 'active';
  select name into s from profiles where id = new.submitted_by;
  perform enqueue_mail(who, '{}', '[New request] ' || coalesce(new.data->>'name', new.type) || ' (' || new.team || ')',
    s || ' submitted a ' || new.type || ' request for ' || new.team || E'.\n\nPlease review it in the PMO platform.', 'request_new', new.id::text);
  return new;
end $$;
create trigger t_request_new after insert on public.requests for each row execute function public.n_request_new();

-- 2) decision → submitter
create or replace function public.n_request_decided() returns trigger language plpgsql security definer set search_path = public as $$
declare e text;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','returned') then
    select email into e from profiles where id = new.submitted_by;
    perform enqueue_mail(array[e], '{}', '[Request ' || new.status || '] ' || coalesce(new.data->>'name', new.type),
      'Your ' || new.type || E' request was ' || new.status || E'.\n\nComment: ' || coalesce(new.decision->>'comment','—'), 'request_decided', new.id::text);
  end if;
  return new;
end $$;
create trigger t_request_decided after update on public.requests for each row execute function public.n_request_decided();

-- 3) project created / person assigned → that person
create or replace function public.n_member_assigned() returns trigger language plpgsql security definer set search_path = public as $$
declare e text; p projects%rowtype;
begin
  select * into p from projects where id = new.project_id;
  select email into e from profiles where id = new.user_id;
  if coalesce((select data->>'mute_mail' from app_state where key = 'flags'), 'false') = 'true'
     or p.status not in ('not_started','active') then return new; end if;   -- silent during legacy import / for closed projects
  perform enqueue_mail(array[e], '{}', '[Assigned] ' || coalesce(p.code,'') || ' ' || p.name,
    'You were assigned as ' || new.role || ' on project ' || coalesce(p.code,'') || ' — ' || p.name || E'.\n\nPlease sign in to the PMO platform.', 'assigned', p.id::text);
  return new;
end $$;
create trigger t_member_assigned after insert on public.project_members for each row execute function public.n_member_assigned();

-- ───────────────────────── shared settings + realtime ─────────────────────────
create table public.app_state (            -- cadence, tracks, rules, reminder dedupe, flags
  key text primary key, data jsonb not null default '{}', version int not null default 1, updated_at timestamptz not null default now());
alter table public.app_state enable row level security;
create policy st_read on public.app_state for select to authenticated using (key <> 'flags' or is_pmo());
create policy st_pmo  on public.app_state for all    to authenticated using (is_pmo()) with check (is_pmo());
insert into public.app_state (key, data) values ('settings','{}'), ('flags','{"mute_mail":false}');

alter publication supabase_realtime add table public.projects, public.requests, public.records,
  public.project_members, public.app_state, public.profiles;
