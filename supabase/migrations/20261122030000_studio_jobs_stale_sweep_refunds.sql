-- 2026-11-22 code review: Studio job lifecycle and refunds.
-- 1) Master jobs whose worker died stayed 'running' forever (claim only took 'queued'):
--    spinner forever, monthly count kept, pack credit never refunded.
--    Claim now retakes a running job with no progress for 45 min; after 3 attempts
--    the sweep fails it ('worker_lost') and refunds.
-- 2) Separate / cleanup jobs that crashed on the 3rd attempt stayed 'running' forever,
--    blocking new separations for that project (SEPARATE_IN_PROGRESS) and the cleanup day count.
-- 3) YouTube pack credits were spent but never refunded on a failed video job.
-- 4) Downloads: the weekly/daily slot stayed used when the job failed, and a retried
--    commit with the same job id charged twice. Usage rows now carry the job id.

-- 4a) download usage ↔ job ---------------------------------------------------------
alter table public.studio_download_usage
  add column if not exists job_id uuid;
create unique index if not exists studio_download_usage_job_uq
  on public.studio_download_usage (job_id) where job_id is not null;

-- 3a) refund check covers YouTube video jobs ----------------------------------------
alter table public.studio_master_jobs drop constraint if exists studio_master_jobs_refund_chk;
alter table public.studio_master_jobs add constraint studio_master_jobs_refund_chk
  check (credit_refunded_at is null or (credit_spent and kind in ('master', 'youtube_video') and status = 'failed'));

-- 3b) refund: master → 'master' credit, youtube_video → 'youtube' credit ---------------
create or replace function public.refund_studio_master_credit(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_kind text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'QUOTA_FORBIDDEN' using errcode = '42501';
  end if;
  update public.studio_master_jobs
     set credit_refunded_at = now()
   where id = p_job_id
     and kind in ('master', 'youtube_video')
     and status = 'failed'
     and credit_spent
     and credit_refunded_at is null
  returning owner_id, kind into v_owner, v_kind;
  if v_owner is null then
    return false;
  end if;
  insert into public.studio_quota_credits (user_id, kind, remaining)
  values (v_owner, case when v_kind = 'youtube_video' then 'youtube' else 'master' end, 1)
  on conflict (user_id, kind) do update
    set remaining = least(public.studio_quota_credits.remaining + 1, 100000);
  return true;
end;
$function$;

-- 3c) YouTube enqueue records credit_spent --------------------------------------------
create or replace function public.enqueue_studio_youtube_video(p_job_id uuid, p_project_id uuid, p_owner_id uuid, p_source_artifact_id uuid, p_source_document_version integer, p_video jsonb, p_week_start timestamp with time zone, p_week_limit integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_credits integer;
  v_used integer;
  v_week_start timestamptz := p_week_start;
  v_spent boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'QUOTA_FORBIDDEN' using errcode = '42501';
  end if;
  if p_week_limit is distinct from 0 and p_week_limit is distinct from 2 then
    return jsonb_build_object('result', 'bad_limit');
  end if;
  if p_video is null or pg_column_size(p_video) > 2048 then
    return jsonb_build_object('result', 'bad_video');
  end if;

  insert into public.studio_quota_credits (user_id, kind, remaining)
  values (p_owner_id, 'youtube', 0)
  on conflict (user_id, kind) do nothing;

  select remaining into v_credits
  from public.studio_quota_credits
  where user_id = p_owner_id and kind = 'youtube'
  for update;

  v_week_start := greatest(v_week_start, coalesce(public.usage_reset_at(p_owner_id, 'video'), v_week_start));
  select count(*) into v_used
  from public.studio_master_jobs
  where owner_id = p_owner_id
    and kind = 'youtube_video'
    and created_at >= v_week_start
    and status not in ('failed', 'cancelled');

  if v_used >= p_week_limit then
    if v_credits is null or v_credits <= 0 then
      return jsonb_build_object('result', 'limit');
    end if;
    update public.studio_quota_credits
       set remaining = remaining - 1
     where user_id = p_owner_id and kind = 'youtube' and remaining > 0;
    v_spent := found;
  end if;

  insert into public.studio_master_jobs (
    id, project_id, owner_id, kind, output_format, source_artifact_id, source_document_version, video, credit_spent
  ) values (
    p_job_id, p_project_id, p_owner_id, 'youtube_video', 'MP4', p_source_artifact_id, p_source_document_version, p_video, v_spent
  );

  return jsonb_build_object('result', 'ok');
end;
$function$;

-- 4b) consume download: idempotent per job id ----------------------------------------
drop function if exists public.consume_studio_download(uuid, uuid, text, text, text, integer);
create or replace function public.consume_studio_download(p_owner_id uuid, p_project_id uuid, p_kind text, p_format text, p_tier text, p_week_limit integer, p_job_id uuid default null)
returns table(allowed boolean, used integer, week_limit integer, reset_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_used integer;
  v_oldest timestamptz;
  v_since timestamptz := now() - interval '7 days';
begin
  perform pg_advisory_xact_lock(hashtextextended('studio_download:' || p_owner_id::text, 0));
  v_since := greatest(v_since, coalesce(public.usage_reset_at(p_owner_id, 'downloads'), v_since));
  select count(*), min(created_at) into v_used, v_oldest
    from public.studio_download_usage
   where owner_id = p_owner_id and created_at > v_since;
  -- Retried commit for the same job: already charged, do not charge again.
  if p_job_id is not null and exists (
    select 1 from public.studio_download_usage where job_id = p_job_id and owner_id = p_owner_id
  ) then
    return query select true, v_used, p_week_limit, coalesce(v_oldest, now()) + interval '7 days';
    return;
  end if;
  if p_week_limit is not null and v_used >= p_week_limit then
    return query select false, v_used, p_week_limit, v_oldest + interval '7 days';
    return;
  end if;
  insert into public.studio_download_usage (owner_id, project_id, kind, format, tier, job_id)
  values (p_owner_id, p_project_id, p_kind, p_format, p_tier, p_job_id);
  return query select true, v_used + 1, p_week_limit, coalesce(v_oldest, now()) + interval '7 days';
end $function$;
revoke all on function public.consume_studio_download(uuid, uuid, text, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.consume_studio_download(uuid, uuid, text, text, text, integer, uuid) to service_role;

-- 4c) complete: failed job gives back its download slot (and pack credit as before) ----
create or replace function public.complete_studio_master_job(p_job_id uuid, p_worker_ref text, p_status text, p_result_object_key text, p_metrics jsonb, p_error_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if p_status = 'failed' then
    begin
      perform public.refund_studio_master_credit(p_job_id);
    exception when others then
      raise warning 'STUDIO_MASTER_REFUND_FAILED job=% sqlstate=%', p_job_id, sqlstate;
    end;
    delete from public.studio_download_usage where job_id = p_job_id;
  end if;
end $function$;

-- 1+2) sweep of dead jobs -----------------------------------------------------------
create or replace function public.sweep_stale_studio_jobs()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
begin
  for r in
    update public.studio_master_jobs
       set status = 'failed', error_code = 'worker_lost', finished_at = now()
     where status = 'running' and attempts >= 3
       and coalesce(progress_at, started_at) < now() - interval '45 minutes'
    returning id
  loop
    begin
      perform public.refund_studio_master_credit(r.id);
    exception when others then
      raise warning 'STUDIO_MASTER_REFUND_FAILED job=% sqlstate=%', r.id, sqlstate;
    end;
    delete from public.studio_download_usage where job_id = r.id;
  end loop;

  update public.studio_separate_jobs
     set status = 'failed', error_code = 'worker_lost', finished_at = now()
   where status = 'running' and attempts >= 3 and started_at < now() - interval '30 minutes';

  update public.studio_cleanup_jobs
     set status = 'failed', error_code = 'worker_lost', finished_at = now()
   where status = 'running' and attempts >= 3 and started_at < now() - interval '10 minutes';
end;
$function$;
revoke all on function public.sweep_stale_studio_jobs() from public, anon, authenticated;
grant execute on function public.sweep_stale_studio_jobs() to service_role;

-- 1) master claim: sweep, then queued or stale running ---------------------------------
create or replace function public.claim_next_studio_master_job(p_worker_ref text)
returns setof public.studio_master_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.sweep_stale_studio_jobs();
  return query
  update public.studio_master_jobs j
     set status = 'running', worker_ref = p_worker_ref, started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from public.studio_master_jobs
      where attempts < 3
        and (status = 'queued'
             or (status = 'running' and coalesce(progress_at, started_at) < now() - interval '45 minutes'))
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end $function$;

-- 2) separate claim + enqueue sweep first ------------------------------------------------
create or replace function public.claim_next_studio_separate_job(p_worker_ref text)
returns setof public.studio_separate_jobs
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SEPARATE_FORBIDDEN' using errcode = '42501';
  end if;
  perform public.sweep_stale_studio_jobs();
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
$function$;

create or replace function public.enqueue_studio_separate_job(p_owner uuid, p_project uuid, p_source_kind text, p_source_bucket text, p_source_key text)
returns public.studio_separate_jobs
language plpgsql
security definer
set search_path to ''
as $function$
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
  perform public.sweep_stale_studio_jobs();
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
$function$;

-- 2) cleanup claim sweeps first ----------------------------------------------------------
create or replace function public.claim_next_studio_cleanup_job(p_worker_ref text)
returns setof public.studio_cleanup_jobs
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.sweep_stale_studio_jobs();
  return query
  update public.studio_cleanup_jobs j
     set status = 'running', worker_ref = p_worker_ref, started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from public.studio_cleanup_jobs
      where attempts < 3
        and (status = 'queued' or (status = 'running' and started_at < now() - interval '10 minutes'))  -- crashed worker
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end;
$function$;
