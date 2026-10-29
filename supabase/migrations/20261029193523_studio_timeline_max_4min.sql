-- Studio song cap: 4:00 (STUDIO_MAX_SONG_MS = 240000). Existing projects are 60000 ms.
alter table public.studio_projects drop constraint if exists studio_projects_timeline_len_chk;
alter table public.studio_projects add constraint studio_projects_timeline_len_chk
  check (timeline_length_ms >= 1000 and timeline_length_ms <= 240000);
