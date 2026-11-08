-- 4-stem queue. The web app inserts a row. The host worker writes the files.
-- Authenticated users can read their own rows. Writes go through service_role RPCs.

create table if not exists public.studio_separate_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  status text not null default 'queued',
  source_kind text not null,
  source_bucket text not null,
  source_key text not null,
  error_code text null,
  stems jsonb null,
  attempts integer not null default 0,
  worker_ref text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  constraint studio_separate_jobs_status_chk check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint studio_separate_jobs_source_kind_chk check (source_kind in ('master', 'beat')),
  constraint studio_separate_jobs_bucket_chk check (source_bucket in ('audio-artifacts', 'beat-audio')),
  constraint studio_separate_jobs_key_chk check (char_length(source_key) between 1 and 512 and position('..' in source_key) = 0),
  constraint studio_separate_jobs_stems_chk check (stems is null or (jsonb_typeof(stems) = 'object' and pg_column_size(stems) <= 2048)),
  constraint studio_separate_jobs_error_chk check (error_code is null or char_length(error_code) <= 80)
);

create index if not exists studio_separate_jobs_owner_idx
  on public.studio_separate_jobs (owner_id, created_at desc);

create unique index if not exists studio_separate_jobs_active_uq
  on public.studio_separate_jobs (project_id)
  where status in ('queued', 'running');

alter table public.studio_separate_jobs enable row level security;

revoke all on table public.studio_separate_jobs from public, anon, authenticated;
grant select on table public.studio_separate_jobs to authenticated;
grant select, insert, update, delete on table public.studio_separate_jobs to service_role;

drop policy if exists studio_separate_jobs_select_own on public.studio_separate_jobs;
create policy studio_separate_jobs_select_own
  on public.studio_separate_jobs
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists studio_separate_jobs_service_all on public.studio_separate_jobs;
create policy studio_separate_jobs_service_all
  on public.studio_separate_jobs
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.studio_separate_jobs is
  'Queued 4-stem split. Files appear only after the host worker with DEMUCS_PYTHON finishes.';

create or replace function public.enqueue_studio_separate_job(
  p_owner uuid,
  p_project uuid,
  p_source_kind text,
  p_source_bucket text,
  p_source_key text
)
returns public.studio_separate_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.studio_separate_jobs;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SEPARATE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_source_kind not in ('master', 'beat')
     or p_source_bucket not in ('audio-artifacts', 'beat-audio')
     or p_source_key is null
     or char_length(p_source_key) < 1
     or char_length(p_source_key) > 512
     or position('..' in p_source_key) > 0 then
    raise exception 'SEPARATE_BAD_SOURCE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.studio_projects p
    where p.id = p_project and p.owner_id = p_owner
  ) then
    raise exception 'SEPARATE_OWNER' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_separate:' || p_project::text, 0));
  if exists (
    select 1 from public.studio_separate_jobs
    where project_id = p_project and status in ('queued', 'running')
  ) then
    raise exception 'SEPARATE_IN_PROGRESS' using errcode = 'P0001';
  end if;
  insert into public.studio_separate_jobs (owner_id, project_id, source_kind, source_bucket, source_key)
  values (p_owner, p_project, p_source_kind, p_source_bucket, p_source_key)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.claim_next_studio_separate_job(p_worker_ref text)
returns setof public.studio_separate_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SEPARATE_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  update public.studio_separate_jobs j
     set status = 'running',
         worker_ref = p_worker_ref,
         started_at = now(),
         attempts = j.attempts + 1
   where j.id = (
     select id from public.studio_separate_jobs
      where attempts < 3
        and (
          status = 'queued'
          or (status = 'running' and started_at < now() - interval '30 minutes')
        )
      order by created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;

create or replace function public.complete_studio_separate_job(
  p_job_id uuid,
  p_worker_ref text,
  p_status text,
  p_stems jsonb,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SEPARATE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'SEPARATE_BAD_STATUS' using errcode = '22023';
  end if;
  if p_status = 'succeeded' and (p_stems is null or jsonb_typeof(p_stems) <> 'object') then
    raise exception 'SEPARATE_NO_STEMS' using errcode = '22023';
  end if;
  if p_error_code is not null and char_length(p_error_code) > 80 then
    raise exception 'SEPARATE_BAD_ERROR' using errcode = '22023';
  end if;
  update public.studio_separate_jobs
     set status = p_status,
         stems = case when p_status = 'succeeded' then p_stems else null end,
         error_code = p_error_code,
         finished_at = now()
   where id = p_job_id
     and worker_ref = p_worker_ref
     and status = 'running';
  if not found then
    raise exception 'SEPARATE_NOT_CLAIMED' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.enqueue_studio_separate_job(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_next_studio_separate_job(text) from public, anon, authenticated;
revoke all on function public.complete_studio_separate_job(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.enqueue_studio_separate_job(uuid, uuid, text, text, text) to service_role;
grant execute on function public.claim_next_studio_separate_job(text) to service_role;
grant execute on function public.complete_studio_separate_job(uuid, text, text, jsonb, text) to service_role;
