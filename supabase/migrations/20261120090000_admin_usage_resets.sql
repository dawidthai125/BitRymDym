-- Admin "reset limits": a per-user, per-metric marker. Every quota counter starts counting
-- from the later of its normal window start and the marker, so a reset gives the user a fresh
-- day/week/month without touching history. No marker = behaviour identical to before.

create table if not exists public.usage_resets (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null,
  reset_at timestamptz not null default now(),
  reset_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, metric),
  constraint usage_resets_metric_chk check (
    metric in ('recordings', 'masters', 'downloads', 'video', 'cleanup', 'lyrics', 'cover')
  )
);

alter table public.usage_resets enable row level security;
revoke all on public.usage_resets from anon, authenticated;
grant select, insert, update, delete on public.usage_resets to service_role;

comment on table public.usage_resets is
  'Admin quota resets. Counters use greatest(window_start, reset_at). service_role only.';

create or replace function public.usage_reset_at(p_user uuid, p_metric text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.reset_at from public.usage_resets r where r.user_id = p_user and r.metric = p_metric
$$;

revoke all on function public.usage_reset_at(uuid, text) from public, anon, authenticated;
grant execute on function public.usage_reset_at(uuid, text) to service_role;

alter table public.admin_audit_events drop constraint if exists admin_audit_events_action_chk;
alter table public.admin_audit_events add constraint admin_audit_events_action_chk check (
  action = any (array[
    'ROLE_CHANGE', 'ADMIN_GRANT', 'ADMIN_REVOKE', 'MODERATOR_GRANT', 'MODERATOR_REVOKE',
    'PREMIUM_TIER_CHANGE', 'PREMIUM_EXPIRATION_CHANGE', 'USER_ACCOUNT_DELETE', 'SAMPLE_POLICY_UPDATE',
    'BEAT_METADATA_UPDATE', 'SITE_MAINTENANCE_UPDATE', 'PLAN_ADDON_GRANT', 'PLAN_ADDON_REVOKE',
    'BEAT_COVER_REVIEW', 'BEAT_OWNER_UPDATE', 'USAGE_RESET'
  ]::text[])
);

-- 1. Finished songs per UTC day (metric: recordings)
create or replace function public.claim_song_completion(p_owner_id uuid, p_project_id uuid, p_max_per_utc_day integer)
 returns table(allowed boolean, counted boolean, used integer, day_limit integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_day_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_used integer;
  v_credit boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim song completions' using errcode = '42501';
  end if;
  if p_owner_id is null or p_project_id is null or p_max_per_utc_day is null or p_max_per_utc_day < 0 then
    raise exception 'owner_id, project_id and a limit are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('song:' || p_owner_id::text, 0));
  v_day_start := greatest(v_day_start, coalesce(public.usage_reset_at(p_owner_id, 'recordings'), v_day_start));
  select count(*)::integer into v_used
  from public.studio_song_completions s
  where s.owner_id = p_owner_id and s.created_at >= v_day_start;
  if exists (
    select 1 from public.studio_song_completions s
    where s.owner_id = p_owner_id and s.project_id = p_project_id
  ) then
    return query select true, false, v_used, p_max_per_utc_day;
    return;
  end if;
  if v_used >= p_max_per_utc_day then
    v_credit := public.consume_studio_quota_credit(p_owner_id, 'take');
    if not v_credit then
      return query select false, false, v_used, p_max_per_utc_day;
      return;
    end if;
  end if;
  insert into public.studio_song_completions (owner_id, project_id, paid_with_credit)
  values (p_owner_id, p_project_id, v_credit);
  return query select true, true, v_used + 1, p_max_per_utc_day;
end;
$function$;

-- 2. Desktop recorder sends per UTC day (metric: recordings)
create or replace function public.claim_desktop_studio_send(p_owner_id uuid, p_max_per_utc_day integer, p_peek boolean default false)
 returns table(allowed boolean, send_id uuid, used integer, day_limit integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_day_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_used integer;
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim desktop sends' using errcode = '42501';
  end if;
  if p_owner_id is null or p_max_per_utc_day is null or p_max_per_utc_day < 0 then
    raise exception 'owner_id and a limit are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('desktop-send:' || p_owner_id::text, 0));
  v_day_start := greatest(v_day_start, coalesce(public.usage_reset_at(p_owner_id, 'recordings'), v_day_start));
  select count(*)::integer into v_used
  from public.desktop_studio_sends d
  where d.owner_id = p_owner_id and d.created_at >= v_day_start;
  if p_peek or v_used >= p_max_per_utc_day then
    return query select (v_used < p_max_per_utc_day), null::uuid, v_used, p_max_per_utc_day;
    return;
  end if;
  insert into public.desktop_studio_sends (owner_id) values (p_owner_id) returning id into v_id;
  return query select true, v_id, v_used + 1, p_max_per_utc_day;
end;
$function$;

-- 3. Masters per Warsaw month (metric: masters)
create or replace function public.claim_studio_master_job(p_job_id uuid, p_project_id uuid, p_owner_id uuid, p_target text, p_settings jsonb, p_source_document_version integer, p_month_limit integer, p_style text default null::text, p_style_intensity integer default 0, p_reference_id uuid default null::uuid, p_reference_intensity integer default 0)
 returns table(allowed boolean, used integer, month_limit integer, reset_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_start timestamptz := public.studio_master_month_start(now());
  v_reset timestamptz := (date_trunc('month', now() at time zone 'Europe/Warsaw') + interval '1 month') at time zone 'Europe/Warsaw';
  v_used integer;
  v_left integer;
begin
  if p_month_limit is null or p_month_limit < 0 then
    raise exception 'MASTER_LIMIT_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_projects where id = p_project_id and owner_id = p_owner_id) then
    raise exception 'MASTER_PROJECT_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if p_reference_id is not null and not exists (
    select 1 from public.studio_master_references r
     where r.id = p_reference_id and r.owner_id = p_owner_id and r.project_id = p_project_id
       and r.status = 'ready' and r.expires_at > now()) then
    raise exception 'MASTER_REFERENCE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_master_month:' || p_owner_id::text, 0));
  v_start := greatest(v_start, coalesce(public.usage_reset_at(p_owner_id, 'masters'), v_start));
  select count(*) into v_used
    from public.studio_master_jobs
   where owner_id = p_owner_id and kind = 'master'
     and created_at >= v_start
     and status not in ('failed', 'cancelled');
  if v_used >= p_month_limit then
    if not public.consume_studio_quota_credit(p_owner_id, 'master') then
      return query select false, v_used, greatest(v_used, p_month_limit), v_reset;
      return;
    end if;
  end if;
  insert into public.studio_master_jobs (id, project_id, owner_id, kind, target, settings, source_document_version, output_format,
                                         style, style_intensity, reference_id, reference_intensity)
  values (p_job_id, p_project_id, p_owner_id, 'master', p_target, coalesce(p_settings, '{}'::jsonb), p_source_document_version, 'WAV_FLOAT',
          p_style, case when p_style is null then 0 else coalesce(p_style_intensity, 0) end,
          p_reference_id, case when p_reference_id is null then 0 else coalesce(p_reference_intensity, 0) end);
  select coalesce(c.remaining, 0) into v_left
    from public.studio_quota_credits c
   where c.user_id = p_owner_id and c.kind = 'master';
  v_left := coalesce(v_left, 0);
  return query select true, v_used + 1, greatest(v_used + 1, p_month_limit) + v_left, v_reset;
end $function$;

-- 4. Finished-file downloads, rolling 7 days (metric: downloads)
create or replace function public.consume_studio_download(p_owner_id uuid, p_project_id uuid, p_kind text, p_format text, p_tier text, p_week_limit integer)
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
  if p_week_limit is not null and v_used >= p_week_limit then
    return query select false, v_used, p_week_limit, v_oldest + interval '7 days';
    return;
  end if;
  insert into public.studio_download_usage (owner_id, project_id, kind, format, tier)
  values (p_owner_id, p_project_id, p_kind, p_format, p_tier);
  return query select true, v_used + 1, p_week_limit, coalesce(v_oldest, now()) + interval '7 days';
end $function$;

-- 5. Vocal cleanup per Warsaw day (metric: cleanup)
create or replace function public.enqueue_studio_cleanup_job(p_owner uuid, p_project uuid, p_take uuid, p_settings jsonb, p_per_day integer)
 returns public.studio_cleanup_jobs
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Warsaw')) at time zone 'Europe/Warsaw';
  v_used integer;
  v_row public.studio_cleanup_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended('studio_cleanup_jobs:' || p_owner::text, 0));
  v_day_start := greatest(v_day_start, coalesce(public.usage_reset_at(p_owner, 'cleanup'), v_day_start));
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
$function$;

-- 6. YouTube MP4 per week (metric: video)
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
  end if;

  insert into public.studio_master_jobs (
    id, project_id, owner_id, kind, output_format, source_artifact_id, source_document_version, video
  ) values (
    p_job_id, p_project_id, p_owner_id, 'youtube_video', 'MP4', p_source_artifact_id, p_source_document_version, p_video
  );

  return jsonb_build_object('result', 'ok');
end;
$function$;
