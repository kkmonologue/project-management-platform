-- DANGER: deletes everything this project created (all tables below and their data).
-- Run only on a fresh/empty project, then re-run migrations/20261104000000_init.sql.
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.mail_outbox, public.code_counters, public.audit_log, public.records,
  public.requests, public.project_members, public.projects, public.user_scopes, public.profiles,
  public.roster, public.app_state, public.teams cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.enqueue_mail(text[], text[], text, text, text, text) cascade;
drop function if exists public.next_code(text, text, text) cascade;
drop function if exists public.me_role() cascade;
drop function if exists public.is_pmo() cascade;
drop function if exists public.in_alsa() cascade;
drop function if exists public.can_see_team(text, text) cascade;
drop function if exists public.is_member(text) cascade;
drop function if exists public.can_edit_project(text) cascade;
drop function if exists public.guard_profile() cascade;
drop function if exists public.bump_version() cascade;
drop function if exists public.audit() cascade;
drop function if exists public.n_request_new() cascade;
drop function if exists public.n_request_decided() cascade;
drop function if exists public.n_member_assigned() cascade;
