CREATE OR REPLACE FUNCTION public.claim_anon_take_recording_session(
  p_anonymous_token_hash text,
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
  p_replace_take_id uuid DEFAULT NULL
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
  v_replace public.takes%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim anonymous take recording sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_anonymous_token_hash IS NULL
     OR length(trim(p_anonymous_token_hash)) < 32
     OR p_beat_id IS NULL
     OR p_take_id IS NULL THEN
    RAISE EXCEPTION 'anonymous_token_hash, beat_id and take_id are required';
  END IF;

  IF p_object_key IS NULL OR p_object_key NOT LIKE 'anon/%/takes/%/mic.bin' THEN
    RAISE EXCEPTION 'Invalid anonymous take object key';
  END IF;

  IF p_max_active_ready IS NULL OR p_max_active_ready < 0 THEN
    RAISE EXCEPTION 'Invalid max_active_ready';
  END IF;

  IF p_max_sessions_utc_day IS NULL OR p_max_sessions_utc_day < 1 THEN
    RAISE EXCEPTION 'Invalid max_sessions_utc_day';
  END IF;

  IF p_replace_take_id IS NOT NULL AND p_replace_take_id = p_take_id THEN
    RAISE EXCEPTION 'REPLACE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(87245104, hashtext(p_anonymous_token_hash));

  IF p_replace_take_id IS NOT NULL THEN
    SELECT * INTO v_replace FROM public.takes t WHERE t.id = p_replace_take_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF v_replace.anonymous_token_hash IS DISTINCT FROM p_anonymous_token_hash THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED' USING ERRCODE = 'P0001';
    END IF;
    IF v_replace.owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED' USING ERRCODE = 'P0001';
    END IF;
    IF v_replace.deleted_at IS NOT NULL OR v_replace.status = 'DELETED' THEN
      RAISE EXCEPTION 'REPLACE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF v_replace.status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'REPLACE_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    IF v_replace.expires_at <= now() THEN
      RAISE EXCEPTION 'REPLACE_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_active_ready
  FROM public.takes t
  WHERE t.anonymous_token_hash = p_anonymous_token_hash
    AND t.status = 'READY' AND t.deleted_at IS NULL AND t.expires_at > now();

  IF p_replace_take_id IS NULL THEN
    IF v_active_ready >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF (v_active_ready - 1) >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_utc_day_start := date_trunc('day', timezone('utc', now()));
  SELECT count(*)::integer INTO v_sessions_today
  FROM public.takes t
  WHERE t.anonymous_token_hash = p_anonymous_token_hash
    AND t.created_at >= v_utc_day_start
    AND t.created_at < v_utc_day_start + interval '1 day';

  IF v_sessions_today >= p_max_sessions_utc_day THEN
    RAISE EXCEPTION 'SESSION_DAY_CAP' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.takes (
      id, owner_id, anonymous_token_hash, beat_id, status, recording_mode,
      storage_bucket, object_key, content_type, byte_size,
      beat_duration_seconds_snapshot, recording_max_seconds_snapshot,
      beat_bpm_snapshot, audio_offset_ms, expires_at, replaces_take_id
    ) VALUES (
      p_take_id, NULL, p_anonymous_token_hash, p_beat_id, 'PENDING_UPLOAD', p_recording_mode,
      'take-audio', p_object_key, p_content_type, p_byte_size,
      p_beat_duration_seconds, p_recording_max_seconds,
      p_beat_bpm, 0, p_expires_at, p_replace_take_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%takes_one_pending_replace_target%'
         OR SQLERRM ILIKE '%replaces_take_id%' THEN
        RAISE EXCEPTION 'REPLACE_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'CONCURRENT_SESSION' USING ERRCODE = 'P0001';
  END;

  RETURN p_take_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_anon_take_recording_session(
  text, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_anon_take_recording_session(
  text, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer, uuid
) TO service_role;
;
