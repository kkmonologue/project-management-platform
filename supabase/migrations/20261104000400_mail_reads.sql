-- Mail center: who has opened which email. One row per person and email; each person sees and writes only their own rows.
-- Run after 20261104000300_storage_files.sql. Until it is run the app still works; every email just shows as unread after a reload.
create table if not exists public.mail_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mail_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, mail_id)
);
alter table public.mail_reads enable row level security;
drop policy if exists mr_own on public.mail_reads;
create policy mr_own on public.mail_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
