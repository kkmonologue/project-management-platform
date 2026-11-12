-- ALSA resolutions: published by the ALSA Secretariat (and PMO), read by every ALSA member.
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check check (kind in ('todo','issue','meeting','alsa_topic','alsa_res'));

create or replace function public.is_alsa_sec() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and status = 'active' and alsa = 'sec') $$;

drop policy if exists rec_read  on public.records;
drop policy if exists rec_write on public.records;
create policy rec_read on public.records for select to authenticated using (
  me_role() is not null and case kind
    when 'issue'      then sees_all_risks() or (team is not null and can_see_team(team))
    when 'todo'       then is_pmo()
    else                   in_alsa() end);                      -- meeting, alsa_topic, alsa_res
create policy rec_write on public.records for all to authenticated
  using (case kind
    when 'issue'    then can_edit_team(team)
    when 'todo'     then is_pmo()
    when 'alsa_res' then is_pmo() or is_alsa_sec()
    else                 in_alsa() end)
  with check (case kind
    when 'issue'    then can_edit_team(team)
    when 'todo'     then is_pmo()
    when 'alsa_res' then is_pmo() or is_alsa_sec()
    else                 in_alsa() end);

-- files of resolutions live under the folder alsa-res/ in the private bucket
drop policy if exists pf_res_read   on storage.objects;
drop policy if exists pf_res_insert on storage.objects;
create policy pf_res_read on storage.objects for select to authenticated using (
  bucket_id = 'project-files' and (storage.foldername(name))[1] = 'alsa-res' and public.in_alsa());
create policy pf_res_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files' and (storage.foldername(name))[1] = 'alsa-res' and (public.is_pmo() or public.is_alsa_sec()));
