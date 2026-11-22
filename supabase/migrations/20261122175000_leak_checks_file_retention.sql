-- Leak check uploads are deleted after 90 days; the result row stays (file_deleted_at marks it).
alter table public.leak_checks add column if not exists file_deleted_at timestamptz;
