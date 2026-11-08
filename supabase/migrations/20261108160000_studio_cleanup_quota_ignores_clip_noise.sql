-- A saved spectrogram profile is a finished cleanup row. It must not spend the daily vocal-cleanup quota.

create or replace function public.enqueue_studio_cleanup_job(
  p_owner uuid, p_project uuid, p_take uuid, p_settings jsonb, p_per_day integer)
returns public.studio_cleanup_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Warsaw')) at time zone 'Europe/Warsaw';
  v_used integer;
  v_row public.studio_cleanup_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended('studio_cleanup_jobs:' || p_owner::text, 0));
  if exists (
    select 1 from public.studio_cleanup_jobs
    where take_id = p_take
      and (
        (status = 'queued' and attempts < 3)
        or (status = 'running' and started_at > now() - interval '15 minutes')
      )
  ) then
    raise exception 'CLEANUP_IN_PROGRESS' using errcode = 'P0001';
  end if;
  select count(*) into v_used from public.studio_cleanup_jobs
   where owner_id = p_owner
     and created_at >= v_day_start
     and status not in ('failed', 'cancelled')
     and coalesce(settings->>'source', '') <> 'clip_noise';
  if v_used >= p_per_day then
    raise exception 'CLEANUP_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.studio_cleanup_jobs (owner_id, project_id, take_id, settings)
  values (p_owner, p_project, p_take, coalesce(p_settings, '{}'::jsonb))
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.enqueue_studio_cleanup_job(uuid, uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.enqueue_studio_cleanup_job(uuid, uuid, uuid, jsonb, integer) to service_role;
