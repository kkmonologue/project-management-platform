-- Mail center: drafts -> review -> queued -> sent. Run after 20261104000100_permissions_v2.sql.
alter table public.mail_outbox alter column id drop identity if exists;
alter table public.mail_outbox alter column id type text using id::text;
alter table public.mail_outbox alter column id set default gen_random_uuid()::text;
alter table public.mail_outbox add column if not exists data       jsonb not null default '{}';
alter table public.mail_outbox add column if not exists version    int   not null default 1;
alter table public.mail_outbox add column if not exists created_by uuid default auth.uid();
alter table public.mail_outbox add column if not exists updated_at timestamptz not null default now();
alter table public.mail_outbox drop constraint if exists mail_outbox_status_check;
alter table public.mail_outbox add constraint mail_outbox_status_check
  check (status in ('draft','queued','sent','failed','discarded'));

create or replace function public.my_email() returns text language sql stable security definer set search_path = public as
$$ select lower(email) from profiles where id = auth.uid() and status = 'active' $$;

drop policy if exists mo_pmo on public.mail_outbox;
drop policy if exists mo_own on public.mail_outbox;
create policy mo_pmo on public.mail_outbox for all to authenticated using (is_pmo()) with check (is_pmo());
create policy mo_own on public.mail_outbox for select to authenticated using (
  status in ('queued','sent','failed') and my_email() is not null and
  exists (select 1 from unnest(to_emails || cc_emails) e where lower(e) = my_email()));

drop trigger if exists v_mail on public.mail_outbox;
create trigger v_mail before update on public.mail_outbox for each row execute function public.bump_version();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mail_outbox') then
    alter publication supabase_realtime add table public.mail_outbox;
  end if;
end $$;
