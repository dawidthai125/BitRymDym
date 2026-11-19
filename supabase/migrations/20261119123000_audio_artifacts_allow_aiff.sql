-- AIFF 24-bit downloads (studio_master_jobs output_format AIFF_24) are uploaded as audio/aiff.
-- The audio-artifacts bucket only allowed mp3/wav/flac/zip/mp4/jpeg, so the upload was rejected.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m) from unnest(allowed_mime_types || array['audio/aiff', 'audio/x-aiff']) as m
)
where id = 'audio-artifacts';
