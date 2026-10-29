-- Stage 3 — Studio Mastering jobs (E3 queue) + final-track approval +
-- server-side download quota (Free: 1 file / rolling 7 days).
-- Applied to production 2026-10-29.
-- Writes go exclusively through service_role (API routes / E3 worker).

create table if not exists public.studio_master_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'master'
    check (kind in ('master', 'raw_sum', 'project_zip', 'transcode')),
  target text check (target in ('streaming', 'youtube', 'headphones', 'club')),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) <= 2048),
  source_document_version integer not null check (source_document_version >= 0),
  source_artifact_id uuid,
  output_format text not null default 'WAV_FLOAT'
    check (output_format in ('WAV_FLOAT', 'WAV_24', 'MP3_128', 'MP3_192', 'MP3_320', 'ZIP')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  worker_ref text,
  attempts integer not null default 0 check (attempts between 0 and 5),
  result_object_key text,
  metrics jsonb check (metrics is null or pg_column_size(metrics) <= 16384),
  error_code text check (error_code is null or length(error_code) <= 80),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint studio_master_jobs_target_for_master check (kind <> 'master' or target is not null),
  constraint studio_master_jobs_approve_only_done check (approved_at is null or (kind = 'master' and status = 'succeeded'))
);

create index if not exists studio_master_jobs_project_idx on public.studio_master_jobs (project_id, created_at desc);
create index if not exists studio_master_jobs_queue_idx on public.studio_master_jobs (created_at) where status = 'queued';
create index if not exists studio_master_jobs_owner_idx on public.studio_master_jobs (owner_id);

-- Owner of the row must own the project.
create or replace function public.studio_master_jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.studio_projects p where p.id = new.project_id and p.owner_id = new.owner_id) then
    raise exception 'STUDIO_MASTER_OWNER_MISMATCH' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists studio_master_jobs_guard on public.studio_master_jobs;
create trigger studio_master_jobs_guard before insert on public.studio_master_jobs
  for each row execute function public.studio_master_jobs_guard();

alter table public.studio_master_jobs enable row level security;
drop policy if exists studio_master_jobs_select_own on public.studio_master_jobs;
create policy studio_master_jobs_select_own on public.studio_master_jobs
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.studio_master_jobs from anon, authenticated;
grant select on public.studio_master_jobs to authenticated;
grant select, insert, update, delete on public.studio_master_jobs to service_role;

revoke all on function public.studio_master_jobs_guard() from public, anon, authenticated;

-- Worker claim (SKIP LOCKED, attempts cap) — service_role only.
create or replace function public.claim_next_studio_master_job(p_worker_ref text)
returns setof public.studio_master_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.studio_master_jobs j
     set status = 'running', worker_ref = p_worker_ref, started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from public.studio_master_jobs
      where status = 'queued' and attempts < 3
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end $$;

create or replace function public.complete_studio_master_job(
  p_job_id uuid, p_worker_ref text, p_status text, p_result_object_key text, p_metrics jsonb, p_error_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'STUDIO_MASTER_BAD_STATUS' using errcode = '22023';
  end if;
  update public.studio_master_jobs
     set status = p_status, result_object_key = p_result_object_key, metrics = p_metrics,
         error_code = p_error_code, finished_at = now()
   where id = p_job_id and worker_ref = p_worker_ref and status = 'running';
  if not found then
    raise exception 'STUDIO_MASTER_NOT_CLAIMED' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.claim_next_studio_master_job(text) from public, anon, authenticated;
revoke all on function public.complete_studio_master_job(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_next_studio_master_job(text) to service_role;
grant execute on function public.complete_studio_master_job(uuid, text, text, text, jsonb, text) to service_role;

-- Download ledger + atomic weekly quota.
create table if not exists public.studio_download_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.studio_projects(id) on delete set null,
  kind text not null check (kind in ('mix', 'master', 'raw', 'project')),
  format text not null check (format in ('MP3_128', 'MP3_192', 'MP3_320', 'WAV_24', 'ZIP')),
  tier text not null check (tier in ('FREE', 'BRONZE', 'SILVER', 'GOLD')),
  created_at timestamptz not null default now()
);
create index if not exists studio_download_usage_owner_idx on public.studio_download_usage (owner_id, created_at desc);

alter table public.studio_download_usage enable row level security;
drop policy if exists studio_download_usage_select_own on public.studio_download_usage;
create policy studio_download_usage_select_own on public.studio_download_usage
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.studio_download_usage from anon, authenticated;
grant select on public.studio_download_usage to authenticated;
grant select, insert, delete on public.studio_download_usage to service_role;

-- p_week_limit null = unlimited (still logged). Serialised per owner.
create or replace function public.consume_studio_download(
  p_owner_id uuid, p_project_id uuid, p_kind text, p_format text, p_tier text, p_week_limit integer)
returns table (allowed boolean, used integer, week_limit integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_used integer;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('studio_download:' || p_owner_id::text, 0));
  select count(*), min(created_at) into v_used, v_oldest
    from public.studio_download_usage
   where owner_id = p_owner_id and created_at > now() - interval '7 days';
  if p_week_limit is not null and v_used >= p_week_limit then
    return query select false, v_used, p_week_limit, v_oldest + interval '7 days';
    return;
  end if;
  insert into public.studio_download_usage (owner_id, project_id, kind, format, tier)
  values (p_owner_id, p_project_id, p_kind, p_format, p_tier);
  return query select true, v_used + 1, p_week_limit, coalesce(v_oldest, now()) + interval '7 days';
end $$;

revoke all on function public.consume_studio_download(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_studio_download(uuid, uuid, text, text, text, integer) to service_role;
