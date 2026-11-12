-- Meeting materials attached to ALSA topics: any ALSA member may upload, every ALSA member may read.
drop policy if exists pf_topic_read   on storage.objects;
drop policy if exists pf_topic_insert on storage.objects;
create policy pf_topic_read on storage.objects for select to authenticated using (
  bucket_id = 'project-files' and (storage.foldername(name))[1] = 'alsa-topic' and public.in_alsa());
create policy pf_topic_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files' and (storage.foldername(name))[1] = 'alsa-topic' and public.in_alsa());
