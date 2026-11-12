-- Deliverables may be any file type (documents, images, video, archives, mail...).
-- The size limit stays at 50 MB; only the type allow-list is removed.
update storage.buckets set allowed_mime_types = null where id = 'project-files';
