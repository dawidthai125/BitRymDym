-- Public 45 s clip of a published catalogue work (owner decision 2026-11-22).
-- The E3 master worker cuts it from the approved master (never uploaded by the browser)
-- into the private audio-artifacts bucket, next to the master:
--   studio-master/{owner}/{project}/{master_job}/out/master_clip.mp3
-- The app serves it only for live works via GET /api/catalog/works/[id]/clip (signed URL).
-- Additive only: new nullable columns + two service_role RPCs. No data is changed.
-- Rollback: drop the two functions and the columns below (clip files may stay; they are
-- removed with the master folder).

alter table public.catalog_works
  add column if not exists preview_clip_status text,
  add column if not exists preview_clip_key text,
  add column if not exists preview_clip_seconds numeric(6, 3),
  add column if not exists preview_clip_requested_at timestamptz,
  add column if not exists preview_clip_claimed_at timestamptz,
  add column if not exists preview_clip_worker_ref text,
  add column if not exists preview_clip_attempts smallint not null default 0,
  add column if not exists preview_clip_error text;

alter table public.catalog_works drop constraint if exists catalog_works_preview_clip_status_chk;
alter table public.catalog_works
  add constraint catalog_works_preview_clip_status_chk
  check (preview_clip_status is null or preview_clip_status in ('pending', 'running', 'ready', 'failed'));

alter table public.catalog_works drop constraint if exists catalog_works_preview_clip_ready_chk;
alter table public.catalog_works
  add constraint catalog_works_preview_clip_ready_chk
  check (
    preview_clip_status is distinct from 'ready'
    or (
      preview_clip_key is not null
      and preview_clip_key like 'studio-master/%/out/master_clip.mp3'
      and preview_clip_seconds > 0
      and preview_clip_seconds <= 60
    )
  );

alter table public.catalog_works drop constraint if exists catalog_works_preview_clip_error_len;
alter table public.catalog_works
  add constraint catalog_works_preview_clip_error_len
  check (preview_clip_error is null or char_length(preview_clip_error) <= 80);

create index if not exists catalog_works_preview_clip_queue_idx
  on public.catalog_works (preview_clip_requested_at)
  where preview_clip_status in ('pending', 'running');

comment on column public.catalog_works.preview_clip_key is
  'Private audio-artifacts key of the public 45 s clip cut by the E3 worker from the approved master. Served only for live works through a short signed URL.';

-- Claim: oldest pending clip of a live work whose master is still the approved one;
-- a running claim older than 15 min is taken over. Max 3 attempts.
create or replace function public.claim_next_work_preview_clip(p_worker_ref text)
returns table (
  id uuid,
  owner_id uuid,
  project_id uuid,
  master_job_id uuid,
  result_object_key text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  select w.id into v_id
    from public.catalog_works w
    join public.studio_master_jobs j on j.id = w.master_job_id
   where w.withdrawn_at is null
     and w.preview_clip_attempts < 3
     and (
       w.preview_clip_status = 'pending'
       or (w.preview_clip_status = 'running' and w.preview_clip_claimed_at < now() - interval '15 minutes')
     )
     and j.kind = 'master'
     and j.status = 'succeeded'
     and j.approved_at is not null
     and j.owner_id = w.owner_id
     and j.project_id = w.project_id
     and j.result_object_key is not null
   order by w.preview_clip_requested_at nulls first
   limit 1
   for update of w skip locked;

  if v_id is null then
    return;
  end if;

  update public.catalog_works w
     set preview_clip_status = 'running',
         preview_clip_claimed_at = now(),
         preview_clip_worker_ref = left(p_worker_ref, 80),
         preview_clip_attempts = w.preview_clip_attempts + 1
   where w.id = v_id;

  return query
    select w.id, w.owner_id, w.project_id, w.master_job_id, j.result_object_key
      from public.catalog_works w
      join public.studio_master_jobs j on j.id = w.master_job_id
     where w.id = v_id;
end;
$function$;

-- Complete: only the worker holding the claim. A failure goes back to pending until
-- the 3rd attempt, then stays failed (the owner's next publish save re-queues it after 1 h).
create or replace function public.complete_work_preview_clip(
  p_work_id uuid,
  p_worker_ref text,
  p_ok boolean,
  p_key text,
  p_seconds numeric,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_n integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  update public.catalog_works w
     set preview_clip_status = case
           when p_ok then 'ready'
           when w.preview_clip_attempts >= 3 then 'failed'
           else 'pending'
         end,
         preview_clip_key = case when p_ok then p_key else w.preview_clip_key end,
         preview_clip_seconds = case when p_ok then p_seconds else w.preview_clip_seconds end,
         preview_clip_error = case when p_ok then null else left(coalesce(p_error, 'unknown'), 80) end,
         preview_clip_claimed_at = null
   where w.id = p_work_id
     and w.preview_clip_status = 'running'
     and w.preview_clip_worker_ref = left(p_worker_ref, 80);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

revoke all on function public.claim_next_work_preview_clip(text) from public, anon, authenticated;
revoke all on function public.complete_work_preview_clip(uuid, text, boolean, text, numeric, text) from public, anon, authenticated;
grant execute on function public.claim_next_work_preview_clip(text) to service_role;
grant execute on function public.complete_work_preview_clip(uuid, text, boolean, text, numeric, text) to service_role;
