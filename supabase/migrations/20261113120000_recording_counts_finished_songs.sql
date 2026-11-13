-- Owner 2026-11-13: the daily recording limit counts finished songs, not takes.
--   * claim_take_recording_session no longer refuses with SESSION_DAY_CAP (takes are free per day);
--     the active-READY cap ignores takes already placed in a Studio project.
--   * claim_song_completion: the first master download of a project is one finished song.
--     Over the plan number per UTC day a take-pack credit is spent, else SONG_DAY_CAP.
--     Later downloads of the same project never count again.
--   * claim_desktop_studio_send: the Windows recorder spends one per "Wrzuć do Studia",
--     separate from the site count, same plan number per UTC day. No pack credits.
-- Additive: two new tables, two new functions, one replaced function (same signature).

create table if not exists public.studio_song_completions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  paid_with_credit boolean not null default false,
  created_at timestamptz not null default now(),
  constraint studio_song_completions_project_uniq unique (owner_id, project_id)
);
create index if not exists studio_song_completions_owner_day_idx
  on public.studio_song_completions (owner_id, created_at desc);
alter table public.studio_song_completions enable row level security;
drop policy if exists studio_song_completions_select_own on public.studio_song_completions;
create policy studio_song_completions_select_own on public.studio_song_completions
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.studio_song_completions from anon, authenticated;
grant select on public.studio_song_completions to authenticated;
grant select, insert, delete on public.studio_song_completions to service_role;

create table if not exists public.desktop_studio_sends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists desktop_studio_sends_owner_day_idx
  on public.desktop_studio_sends (owner_id, created_at desc);
alter table public.desktop_studio_sends enable row level security;
revoke all on public.desktop_studio_sends from anon, authenticated;
grant select, insert, delete on public.desktop_studio_sends to service_role;

create or replace function public.claim_take_recording_session(
  p_owner_id uuid,
  p_beat_id uuid,
  p_take_id uuid,
  p_object_key text,
  p_content_type text,
  p_byte_size bigint,
  p_recording_mode public.take_recording_mode,
  p_beat_duration_seconds integer,
  p_recording_max_seconds integer,
  p_beat_bpm integer,
  p_expires_at timestamptz,
  p_max_active_ready integer,
  p_max_sessions_utc_day integer,
  p_replace_take_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_active_ready integer;
  v_replace public.takes%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim take recording sessions'
      using errcode = '42501';
  end if;

  if p_owner_id is null or p_beat_id is null or p_take_id is null then
    raise exception 'owner_id, beat_id and take_id are required';
  end if;

  if p_max_active_ready is null or p_max_active_ready < 0 then
    raise exception 'Invalid max_active_ready';
  end if;

  if p_max_sessions_utc_day is null or p_max_sessions_utc_day < 1 then
    raise exception 'Invalid max_sessions_utc_day';
  end if;

  if p_replace_take_id is not null and p_replace_take_id = p_take_id then
    raise exception 'REPLACE_INVALID'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  if p_replace_take_id is not null then
    select * into v_replace
    from public.takes t
    where t.id = p_replace_take_id
    for update;

    if not found then
      raise exception 'REPLACE_INVALID'
        using errcode = 'P0001';
    end if;

    if v_replace.owner_id is distinct from p_owner_id then
      raise exception 'REPLACE_OWNERSHIP_DENIED'
        using errcode = 'P0001';
    end if;

    if v_replace.deleted_at is not null or v_replace.status = 'DELETED' then
      raise exception 'REPLACE_INVALID'
        using errcode = 'P0001';
    end if;

    if v_replace.status is distinct from 'READY' then
      raise exception 'REPLACE_NOT_READY'
        using errcode = 'P0001';
    end if;

    if v_replace.expires_at <= now() then
      raise exception 'REPLACE_EXPIRED'
        using errcode = 'P0001';
    end if;
  end if;

  -- Takes already placed in a Studio project are part of a song, not loose takes.
  select count(*)::integer into v_active_ready
  from public.takes t
  where t.owner_id = p_owner_id
    and not t.is_stem
    and t.status = 'READY'
    and t.deleted_at is null
    and t.expires_at > now()
    and not exists (select 1 from public.studio_clips c where c.source_take_id = t.id);

  if p_replace_take_id is null then
    if v_active_ready >= p_max_active_ready then
      raise exception 'REPLACE_REQUIRED'
        using errcode = 'P0001';
    end if;
  else
    -- Valid replace reserves one slot: allow claim at/above prior DENY threshold.
    -- Still refuse pathological overshoot (active without counting reserved target).
    if (v_active_ready - 1) >= p_max_active_ready then
      raise exception 'REPLACE_REQUIRED'
        using errcode = 'P0001';
    end if;
  end if;

  -- Owner 2026-11-13: takes no longer count per day. The daily number of recordings
  -- (plan recording.sessionsPerDay) is spent when a finished song is first downloaded
  -- (claim_song_completion) and, for the Windows recorder, per send (claim_desktop_studio_send).
  -- p_max_sessions_utc_day stays in the signature for the callers; it is validated, not used.

  -- STU-16: release the actor's own stale reservation (window elapsed, no
  -- object). Rolled back with the claim if anything below fails.
  update public.takes t
  set status = 'FAILED',
      failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
  where t.owner_id = p_owner_id
    and t.status = 'PENDING_UPLOAD'
    and t.deleted_at is null
    and t.created_at <= now()
      - make_interval(secs => public.take_pending_upload_window_seconds())
    and not exists (
      select 1
      from storage.objects o
      where o.bucket_id = t.storage_bucket
        and o.name = t.object_key
    );

  begin
    insert into public.takes (
      id,
      owner_id,
      anonymous_token_hash,
      beat_id,
      status,
      recording_mode,
      storage_bucket,
      object_key,
      content_type,
      byte_size,
      beat_duration_seconds_snapshot,
      recording_max_seconds_snapshot,
      beat_bpm_snapshot,
      audio_offset_ms,
      expires_at,
      replaces_take_id
    ) values (
      p_take_id,
      p_owner_id,
      null,
      p_beat_id,
      'PENDING_UPLOAD',
      p_recording_mode,
      'take-audio',
      p_object_key,
      p_content_type,
      p_byte_size,
      p_beat_duration_seconds,
      p_recording_max_seconds,
      p_beat_bpm,
      0,
      p_expires_at,
      p_replace_take_id
    );
  exception
    when unique_violation then
      if sqlerrm ilike '%takes_one_pending_replace_target%'
         or sqlerrm ilike '%replaces_take_id%' then
        raise exception 'REPLACE_CONFLICT'
          using errcode = 'P0001';
      end if;
      raise exception 'CONCURRENT_SESSION'
        using errcode = 'P0001';
  end;

  return p_take_id;
end;
$function$;

create or replace function public.claim_song_completion(
  p_owner_id uuid,
  p_project_id uuid,
  p_max_per_utc_day integer
)
returns table (allowed boolean, counted boolean, used integer, day_limit integer)
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
revoke all on function public.claim_song_completion(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_song_completion(uuid, uuid, integer) to service_role;

create or replace function public.claim_desktop_studio_send(
  p_owner_id uuid,
  p_max_per_utc_day integer,
  p_peek boolean default false
)
returns table (allowed boolean, send_id uuid, used integer, day_limit integer)
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
revoke all on function public.claim_desktop_studio_send(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.claim_desktop_studio_send(uuid, integer, boolean) to service_role;
