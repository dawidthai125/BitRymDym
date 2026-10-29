-- Idempotent: audio-artifacts objects are capped at 50 MB (project-wide Storage limit).
update storage.buckets set file_size_limit = 52428800 where id = 'audio-artifacts';
