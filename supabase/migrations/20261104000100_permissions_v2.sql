-- Permissions v2 (run after 20261104000000_init.sql; safe to run once)
--
--  1. Everyone on the roster can READ every non-ALSA project. Edit rights follow role + team scope.
--  2. role 'mgr'    = country aftersales manager / back-office head: edit own team, file new/change/close requests
--     role 'member' = country aftersales ops manager / back-office ops: edit own team, file new/change requests (NOT close)
--     role 'viewer' = read only
--     role 'pmo'    = everything
--  3. Closing a project: only 'mgr' (and PMO).
--  4. Risks & issues: PMO and anyone flagged risk_all (Cokey, Brent) see all; everyone else only their own teams.
--  5. ALSA projects and ALSA records: only people with an ALSA role (and PMO).

-- ───────── new flag + generated ALSA marker ─────────
alter table public.roster   add column if not exists risk_all boolean not null default false;
alter table public.profiles add column if not exists risk_all boolean not null default false;
alter table public.projects add column if not exists is_alsa boolean
  generated always as (kind = 'alsa' or coalesce(data->>'alsa', 'false') = 'true') stored;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r roster%rowtype; s text;
begin
  select * into r from roster where email = lower(new.email) and active;
  if not found then
    raise exception 'Email % is not on the roster', new.email;
  end if;
  insert into profiles (id, email, name, role, lang, title, alsa, risk_all)
    values (new.id, r.email, r.name, r.role, r.lang, r.title, r.alsa, r.risk_all);
  foreach s in array r.teams loop
    insert into user_scopes (user_id, team, section)
      values (new.id, split_part(s,'|',1), coalesce(nullif(split_part(s,'|',2),''),''))
      on conflict do nothing;
  end loop;
  return new;
end $$;

-- people may not change their own risk_all either
create or replace function public.guard_profile() returns trigger language plpgsql as $$
begin
  if not is_pmo() and (new.role is distinct from old.role or new.email is distinct from old.email
      or new.status is distinct from old.status or new.alsa is distinct from old.alsa
      or new.risk_all is distinct from old.risk_all) then
    raise exception 'Only PMO can change role, email, status, ALSA membership or risk access';
  end if;
  return new;
end $$;

-- ───────── helpers ─────────
create or replace function public.sees_all_risks() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(is_pmo() or exists (select 1 from profiles where id = auth.uid() and status = 'active' and risk_all), false) $$;
create or replace function public.in_alsa() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(is_pmo(), false) or exists (select 1 from profiles where id = auth.uid() and status = 'active' and alsa is not null) $$;
-- may this person edit things that belong to this team/section?
create or replace function public.can_edit_team(p_team text, p_section text default '') returns boolean
language sql stable security definer set search_path = public as $$
  select is_pmo() or (me_role() in ('mgr','member') and can_see_team(p_team, p_section))
$$;
-- kept for compatibility with init.sql; now means "can edit"
create or replace function public.can_edit_project(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects pr where pr.id = p_id and
    case when pr.kind = 'alsa' then in_alsa()
         when pr.is_alsa      then is_pmo() or (in_alsa() and can_edit_team(pr.team, pr.section))
         else can_edit_team(pr.team, pr.section) end)
$$;

-- ───────── projects ─────────
drop policy if exists proj_read on public.projects;
drop policy if exists proj_ins  on public.projects;
drop policy if exists proj_upd  on public.projects;
create policy proj_read on public.projects for select to authenticated
  using (me_role() is not null and (not is_alsa or in_alsa()));
create policy proj_ins  on public.projects for insert to authenticated
  with check (is_pmo() or (kind = 'follow' and can_edit_team(team, section)));
create policy proj_upd  on public.projects for update to authenticated
  using (can_edit_project(id)) with check (can_edit_project(id));

-- status, code and team change only through PMO-approved requests
create or replace function public.guard_project() returns trigger language plpgsql as $$
begin
  if not is_pmo() and new.kind = 'project' and
     (new.status is distinct from old.status or new.code is distinct from old.code or new.team is distinct from old.team) then
    raise exception 'Status, code and team of a project can only be changed by PMO (via an approved request)';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_project on public.projects;
create trigger trg_guard_project before update on public.projects for each row execute function public.guard_project();

drop policy if exists pm_read on public.project_members;
create policy pm_read on public.project_members for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));   -- inherits projects visibility

-- ───────── requests ─────────
drop policy if exists req_read on public.requests;
drop policy if exists req_ins  on public.requests;
create policy req_read on public.requests for select to authenticated
  using (me_role() is not null and (submitted_by = auth.uid() or can_see_team(team)));
create policy req_ins  on public.requests for insert to authenticated with check (
  submitted_by = auth.uid() and can_edit_team(team)
  and (type <> 'close' or me_role() in ('pmo','mgr')));        -- only country managers / back-office heads close

-- ───────── records (todo / issue / meeting / alsa_topic) ─────────
drop policy if exists rec_read  on public.records;
drop policy if exists rec_write on public.records;
create policy rec_read on public.records for select to authenticated using (
  me_role() is not null and case kind
    when 'issue'      then sees_all_risks() or (team is not null and can_see_team(team))
    when 'todo'       then is_pmo()
    else                   in_alsa() end);                      -- meeting, alsa_topic
create policy rec_write on public.records for all to authenticated
  using (case kind
    when 'issue' then can_edit_team(team)
    when 'todo'  then is_pmo()
    else              in_alsa() end)
  with check (case kind
    when 'issue' then can_edit_team(team)
    when 'todo'  then is_pmo()
    else              in_alsa() end);
