-- Studio song cap: 6:00 (STUDIO_MAX_SONG_MS = 360000).
alter table public.studio_projects drop constraint if exists studio_projects_timeline_len_chk;
alter table public.studio_projects add constraint studio_projects_timeline_len_chk
  check (timeline_length_ms >= 1000 and timeline_length_ms <= 360000);
