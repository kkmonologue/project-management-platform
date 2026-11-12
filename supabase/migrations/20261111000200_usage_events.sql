-- Page usage during the pilot: one row per page change. Everybody writes their own rows; only PMO reads them.
create table if not exists public.usage_events (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  day     date not null default current_date,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  role    text,
  view    text not null
);
create index if not exists usage_events_day_idx on public.usage_events (day);
alter table public.usage_events enable row level security;
drop policy if exists usage_insert on public.usage_events;
drop policy if exists usage_read   on public.usage_events;
create policy usage_insert on public.usage_events for insert to authenticated with check (user_id = auth.uid());
create policy usage_read   on public.usage_events for select to authenticated using (public.is_pmo());
