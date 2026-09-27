-- Recording Wave 4 — race-safe session claim + concurrent PENDING guard
-- Entitlement / anti-abuse enforced in service_role RPC (advisory xact lock).
-- Does not enable pg_cron. Janitor runs via app cron route.

CREATE UNIQUE INDEX IF NOT EXISTS takes_one_pending_per_owner_uidx
  ON public.takes (owner_id)
  WHERE status = 'PENDING_UPLOAD'
    AND owner_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS takes_owner_created_at_idx
  ON public.takes (owner_id, created_at)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS takes_owner_ready_active_idx
  ON public.takes (owner_id, expires_at)
  WHERE status = 'READY'
    AND owner_id IS NOT NULL
    AND deleted_at IS NULL;

-- Atomically claim a recording session under per-owner advisory lock.
-- active READY: status READY, deleted_at IS NULL, expires_at > now()
-- sessions UTC day: rows created on current UTC calendar day (any status)
CREATE OR REPLACE FUNCTION public.claim_take_recording_session(
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
  p_max_sessions_utc_day integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_ready integer;
  v_sessions_today integer;
  v_utc_day_start timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim take recording sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_owner_id IS NULL OR p_beat_id IS NULL OR p_take_id IS NULL THEN
    RAISE EXCEPTION 'owner_id, beat_id and take_id are required';
  END IF;

  IF p_max_active_ready IS NULL OR p_max_active_ready < 0 THEN
    RAISE EXCEPTION 'Invalid max_active_ready';
  END IF;

  IF p_max_sessions_utc_day IS NULL OR p_max_sessions_utc_day < 1 THEN
    RAISE EXCEPTION 'Invalid max_sessions_utc_day';
  END IF;

  -- Transaction-scoped lock per owner (hashtextextended → bigint).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  SELECT count(*)::integer INTO v_active_ready
  FROM public.takes t
  WHERE t.owner_id = p_owner_id
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
    AND t.expires_at > now();

  IF v_active_ready >= p_max_active_ready THEN
    RAISE EXCEPTION 'ACTIVE_READY_CAP'
      USING ERRCODE = 'P0001';
  END IF;

  v_utc_day_start := date_trunc('day', timezone('utc', now()));

  SELECT count(*)::integer INTO v_sessions_today
  FROM public.takes t
  WHERE t.owner_id = p_owner_id
    AND t.created_at >= v_utc_day_start
    AND t.created_at < v_utc_day_start + interval '1 day';

  IF v_sessions_today >= p_max_sessions_utc_day THEN
    RAISE EXCEPTION 'SESSION_DAY_CAP'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.takes (
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
    expires_at
  ) VALUES (
    p_take_id,
    p_owner_id,
    NULL,
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
    p_expires_at
  );

  RETURN p_take_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CONCURRENT_SESSION'
      USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer
) TO service_role;
