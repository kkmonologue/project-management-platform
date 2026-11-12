-- File uploads (close reports, deliverable evidence). Run after 20261104000200_mail_drafts.sql.
-- Private bucket; every object path starts with the project id, so access follows the project:
--   read   = anyone who can read that project (projects row-level security applies inside the subquery)
--   upload = anyone who may edit that project (PMO, or manager / ops manager of its team)
-- No update or delete from the app: files stay as part of the project record.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 52428800, array[
  'application/pdf',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/zip', 'application/x-zip-compressed',
  'application/vnd.ms-outlook', 'message/rfc822',
  'application/octet-stream'                      -- some browsers send .msg / .eml this way
])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

drop policy if exists pf_read   on storage.objects;
drop policy if exists pf_insert on storage.objects;
create policy pf_read on storage.objects for select to authenticated using (
  bucket_id = 'project-files'
  and exists (select 1 from public.projects p where p.id = (storage.foldername(name))[1]));
create policy pf_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files'
  and public.can_edit_project((storage.foldername(name))[1]));
