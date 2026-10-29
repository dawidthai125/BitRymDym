-- E3 master worker stores the internal master as 24-bit FLAC (fits 50 MB at 4:00).
update storage.buckets
set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['audio/flac']))
where id = 'audio-artifacts' and allowed_mime_types is not null and not ('audio/flac' = any(allowed_mime_types));
