-- Mastering target "rap" (-10 LUFS / -0.5 dBTP), default in Studio since 9f76691.
alter table public.studio_master_jobs drop constraint if exists studio_master_jobs_target_check;
alter table public.studio_master_jobs add constraint studio_master_jobs_target_check check (target in ('streaming', 'youtube', 'headphones', 'club', 'rap'));
