-- 2026-11-22 (Owner decision): the plan's "active recordings" cap counts ONLY loose own
-- recordings — READY, not expired, not a stem, not placed in any Studio project, and not a
-- sample/catalog copy (title 'smp:…' / 'catalog:…'). Before, three places counted three
-- ways (menu 4/10, server 12/10, recording screen 14/10) and 10 sample copies blocked
-- recording. One function is now the single source for the server claim, the recording
-- eligibility probe and the plan menu.

create or replace function public.count_active_loose_takes(p_owner_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select count(*)::integer
  from public.takes t
  where t.owner_id = p_owner_id
    and not t.is_stem
    and t.status = 'READY'
    and t.deleted_at is null
    and t.expires_at > now()
    and (t.title is null or (t.title not like 'smp:%' and t.title not like 'catalog:%'))
    and not exists (select 1 from public.studio_clips c where c.source_take_id = t.id);
$function$;
revoke all on function public.count_active_loose_takes(uuid) from public, anon, authenticated;
grant execute on function public.count_active_loose_takes(uuid) to service_role;

create or replace function public.claim_take_recording_session(p_owner_id uuid, p_beat_id uuid, p_take_id uuid, p_object_key text, p_content_type text, p_byte_size bigint, p_recording_mode take_recording_mode, p_beat_duration_seconds integer, p_recording_max_seconds integer, p_beat_bpm integer, p_expires_at timestamp with time zone, p_max_active_ready integer, p_max_sessions_utc_day integer, p_replace_take_id uuid default null::uuid)
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

  -- Loose own recordings only (see public.count_active_loose_takes).
  v_active_ready := public.count_active_loose_takes(p_owner_id);

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
