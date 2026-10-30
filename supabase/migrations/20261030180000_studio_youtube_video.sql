-- Gold: YouTube MP4 (approved master + beat cover / own filtered graphic → 1920×1080 H.264/AAC).
-- NOT applied yet — ships together with the E3 worker deploy.
-- 1) job kind 'youtube_video' + output format 'MP4'
-- 2) studio_master_jobs.video: render spec { source, image {bucket,key}, title, artist }
-- 3) audio-artifacts accepts video/mp4 (result) + image/jpeg (filtered own graphic)

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.studio_master_jobs'::regclass and contype = 'c'
       and ((pg_get_constraintdef(oid) like '%kind%' and pg_get_constraintdef(oid) like '%project_zip%')
         or (pg_get_constraintdef(oid) like '%output_format%' and pg_get_constraintdef(oid) like '%MP3_320%'))
  loop
    execute format('alter table public.studio_master_jobs drop constraint %I', c);
  end loop;
end $$;

alter table public.studio_master_jobs add constraint studio_master_jobs_kind_check
  check (kind in ('master', 'raw_sum', 'project_zip', 'transcode', 'youtube_video'));
alter table public.studio_master_jobs add constraint studio_master_jobs_output_format_check
  check (output_format in ('WAV_FLOAT', 'WAV_24', 'MP3_128', 'MP3_192', 'MP3_320', 'ZIP', 'MP4'));

alter table public.studio_master_jobs
  add column if not exists video jsonb check (video is null or pg_column_size(video) <= 2048);

alter table public.studio_master_jobs drop constraint if exists studio_master_jobs_video_spec;
alter table public.studio_master_jobs add constraint studio_master_jobs_video_spec
  check ((kind = 'youtube_video') = (video is not null)
     and (kind <> 'youtube_video' or (output_format = 'MP4' and source_artifact_id is not null)));

create index if not exists studio_master_jobs_video_owner_idx
  on public.studio_master_jobs (owner_id, created_at desc) where kind = 'youtube_video';

update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['video/mp4', 'image/jpeg']))
 where id = 'audio-artifacts' and allowed_mime_types is not null
   and not (allowed_mime_types @> array['video/mp4', 'image/jpeg']);
