-- Projekt ZIP downloads are written by the E3 worker into audio-artifacts; the bucket only allowed audio types (upload_failed).
update storage.buckets
set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/zip']))
where id = 'audio-artifacts'
  and allowed_mime_types is not null
  and not ('application/zip' = any(allowed_mime_types));
