-- STU-16 — server-side upload window for PENDING_UPLOAD reservations
-- (OD-REC-PENDING-UPLOAD-TTL / OD-REC-10).
--
-- A PENDING_UPLOAD row reserves the actor's single upload slot
-- (takes_one_pending_per_owner_uidx / takes_one_pending_per_anon_hash_uidx).
-- Before: the reservation blocked new sessions until expires_at (= full
-- retention TTL, e.g. 2 h for guests) even when the browser lost the take id.
-- After: a reservation is STALE once its upload window has elapsed on the
-- server clock (created_at + take_pending_upload_window_seconds()) AND no
-- Storage object exists at its reserved key. A stale reservation is marked
-- FAILED (failure_reason PENDING_UPLOAD_WINDOW_ELAPSED):
--   * by the next claim of the same actor, in the claim transaction, under the
--     existing per-actor advisory lock (the same lock finalize_take_ready_swap
--     takes), right before the new reservation is inserted;
--   * by release_stale_pending_take_reservations() (takes janitor), per row
--     under the same advisory lock.
-- Never released here: reservations inside the window (active upload), and
-- reservations whose object exists (upload landed, finalize outcome unknown —
-- they stay finalizable until expires_at). READY / FAILED / EXPIRED / DELETED
-- rows, expires_at (retention) and caps are unchanged.
-- No table, column, index, RLS or function-signature change; existing rows
-- are not modified by this migration.

-- ---------------------------------------------------------------------------
-- 1. Central window length (server-side SSOT; mirrored by
--    TAKE_PENDING_UPLOAD_WINDOW_SECONDS in src/config/recording.ts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.take_pending_upload_window_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 900
$$;

REVOKE ALL ON FUNCTION public.take_pending_upload_window_seconds()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_pending_upload_window_seconds()
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Authenticated claim — P2 body + stale-reservation release.
-- ---------------------------------------------------------------------------
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
  p_max_sessions_utc_day integer,
  p_replace_take_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_ready integer;
  v_sessions_today integer;
  v_utc_day_start timestamptz;
  v_replace public.takes%ROWTYPE;
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

  IF p_replace_take_id IS NOT NULL AND p_replace_take_id = p_take_id THEN
    RAISE EXCEPTION 'REPLACE_INVALID'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  IF p_replace_take_id IS NOT NULL THEN
    SELECT * INTO v_replace
    FROM public.takes t
    WHERE t.id = p_replace_take_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.owner_id IS DISTINCT FROM p_owner_id THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.deleted_at IS NOT NULL OR v_replace.status = 'DELETED' THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'REPLACE_NOT_READY'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.expires_at <= now() THEN
      RAISE EXCEPTION 'REPLACE_EXPIRED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_active_ready
  FROM public.takes t
  WHERE t.owner_id = p_owner_id
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
    AND t.expires_at > now();

  IF p_replace_take_id IS NULL THEN
    IF v_active_ready >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Valid replace reserves one slot: allow claim at/above prior DENY threshold.
    -- Still refuse pathological overshoot (active without counting reserved target).
    IF (v_active_ready - 1) >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
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

  -- STU-16: release the actor's own stale reservation (window elapsed, no
  -- object). Rolled back with the claim if anything below fails.
  UPDATE public.takes t
  SET status = 'FAILED',
      failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
  WHERE t.owner_id = p_owner_id
    AND t.status = 'PENDING_UPLOAD'
    AND t.deleted_at IS NULL
    AND t.created_at <= now()
      - make_interval(secs => public.take_pending_upload_window_seconds())
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = t.storage_bucket
        AND o.name = t.object_key
    );

  BEGIN
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
      expires_at,
      replaces_take_id
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
      p_expires_at,
      p_replace_take_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%takes_one_pending_replace_target%'
         OR SQLERRM ILIKE '%replaces_take_id%' THEN
        RAISE EXCEPTION 'REPLACE_CONFLICT'
          USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'CONCURRENT_SESSION'
        USING ERRCODE = 'P0001';
  END;

  RETURN p_take_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Anonymous claim — P2 body + stale-reservation release.
-- ---------------------------------------------------------------------------
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
SET search_path = ''
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
    RAISE EXCEPTION 'REPLACE_INVALID'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(87245104, hashtext(p_anonymous_token_hash));

  IF p_replace_take_id IS NOT NULL THEN
    SELECT * INTO v_replace
    FROM public.takes t
    WHERE t.id = p_replace_take_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.anonymous_token_hash IS DISTINCT FROM p_anonymous_token_hash THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.deleted_at IS NOT NULL OR v_replace.status = 'DELETED' THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'REPLACE_NOT_READY'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_replace.expires_at <= now() THEN
      RAISE EXCEPTION 'REPLACE_EXPIRED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_active_ready
  FROM public.takes t
  WHERE t.anonymous_token_hash = p_anonymous_token_hash
    AND t.status = 'READY'
    AND t.deleted_at IS NULL
    AND t.expires_at > now();

  IF p_replace_take_id IS NULL THEN
    IF v_active_ready >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF (v_active_ready - 1) >= p_max_active_ready THEN
      RAISE EXCEPTION 'REPLACE_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_utc_day_start := date_trunc('day', timezone('utc', now()));

  SELECT count(*)::integer INTO v_sessions_today
  FROM public.takes t
  WHERE t.anonymous_token_hash = p_anonymous_token_hash
    AND t.created_at >= v_utc_day_start
    AND t.created_at < v_utc_day_start + interval '1 day';

  IF v_sessions_today >= p_max_sessions_utc_day THEN
    RAISE EXCEPTION 'SESSION_DAY_CAP'
      USING ERRCODE = 'P0001';
  END IF;

  -- STU-16: release the actor's own stale reservation (window elapsed, no
  -- object). Rolled back with the claim if anything below fails.
  UPDATE public.takes t
  SET status = 'FAILED',
      failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
  WHERE t.anonymous_token_hash = p_anonymous_token_hash
    AND t.owner_id IS NULL
    AND t.status = 'PENDING_UPLOAD'
    AND t.deleted_at IS NULL
    AND t.created_at <= now()
      - make_interval(secs => public.take_pending_upload_window_seconds())
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = t.storage_bucket
        AND o.name = t.object_key
    );

  BEGIN
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
      expires_at,
      replaces_take_id
    ) VALUES (
      p_take_id,
      NULL,
      p_anonymous_token_hash,
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
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%takes_one_pending_replace_target%'
         OR SQLERRM ILIKE '%replaces_take_id%' THEN
        RAISE EXCEPTION 'REPLACE_CONFLICT'
          USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'CONCURRENT_SESSION'
        USING ERRCODE = 'P0001';
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

-- ---------------------------------------------------------------------------
-- 4. Janitor batch: release stale reservations of any actor.
--    SECURITY INVOKER — runs with the service_role caller's own privileges.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_stale_pending_take_reservations(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (take_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may release stale take reservations'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;

  FOR v_row IN
    SELECT t.id, t.owner_id, t.anonymous_token_hash
    FROM public.takes t
    WHERE t.status = 'PENDING_UPLOAD'
      AND t.deleted_at IS NULL
      AND t.created_at <= now()
        - make_interval(secs => public.take_pending_upload_window_seconds())
    ORDER BY t.created_at, t.id
    LIMIT p_limit
  LOOP
    -- Same per-actor lock as claim / finalize: never races either of them.
    IF v_row.owner_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(v_row.owner_id::text, 0));
    ELSIF v_row.anonymous_token_hash IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(87245104, hashtext(v_row.anonymous_token_hash));
    END IF;

    UPDATE public.takes t
    SET status = 'FAILED',
        failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
    WHERE t.id = v_row.id
      AND t.status = 'PENDING_UPLOAD'
      AND t.deleted_at IS NULL
      AND t.created_at <= now()
        - make_interval(secs => public.take_pending_upload_window_seconds())
      AND NOT EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = t.storage_bucket
          AND o.name = t.object_key
      );

    IF FOUND THEN
      take_id := v_row.id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_pending_take_reservations(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_pending_take_reservations(integer)
  TO service_role;
