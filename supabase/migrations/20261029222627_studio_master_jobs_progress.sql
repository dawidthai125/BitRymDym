-- Studio E3 jobs: live progress for Mastering / exports (worker writes, owner reads via RLS).
-- stage = current step, progress = overall 0..100 (see src/lib/studio/master/progress.ts).
alter table public.studio_master_jobs
  add column if not exists stage text
    check (stage is null or stage in ('queued', 'download', 'decode', 'render', 'master', 'encode', 'upload', 'done')),
  add column if not exists progress smallint
    check (progress is null or progress between 0 and 100),
  add column if not exists progress_at timestamptz;
