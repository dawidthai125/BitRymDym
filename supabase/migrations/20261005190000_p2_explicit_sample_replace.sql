-- P2 Explicit Replace Previous Sample
-- Additive: replaces_take_id + claim signature + finalize swap RPC.
-- Does NOT mutate existing take rows / Storage / beat catalog.

-- ---------------------------------------------------------------------------
-- 1. Column: replacement reservation (claim sets; finalize retires target)
-- ---------------------------------------------------------------------------
ALTER TABLE public.takes
  ADD COLUMN IF NOT EXISTS replaces_take_id uuid
    REFERENCES public.takes (id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'takes_replaces_not_self_chk'
      AND conrelid = 'public.takes'::regclass
  ) THEN
    ALTER TABLE public.takes
      ADD CONSTRAINT takes_replaces_not_self_chk
      CHECK (replaces_take_id IS NULL OR replaces_take_id <> id);
  END IF;
END $$;

-- At most one PENDING reservation against a given replace target.
CREATE UNIQUE INDEX IF NOT EXISTS takes_one_pending_replace_target_uidx
  ON public.takes (replaces_take_id)
  WHERE status = 'PENDING_UPLOAD'
    AND replaces_take_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS takes_replaces_take_id_idx
  ON public.takes (replaces_take_id)
  WHERE replaces_take_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Drop prior claim signatures (replace with extended params)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_take_recording_session(
  uuid, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer
);

DROP FUNCTION IF EXISTS public.claim_anon_take_recording_session(
  text, uuid, uuid, text, text, bigint, public.take_recording_mode,
  integer, integer, integer, timestamptz, integer, integer
);

-- ---------------------------------------------------------------------------
-- 3. Authenticated claim (+ optional p_replace_take_id)
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
SET search_path = public
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
-- 4. Anonymous claim (+ optional p_replace_take_id)
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
-- 5. Atomic finalize READY (+ optional old → DELETED)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_take_ready_swap(
  p_take_id uuid,
  p_actor_owner_id uuid,
  p_actor_anon_hash text,
  p_duration_seconds integer,
  p_byte_size bigint,
  p_content_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_take public.takes%ROWTYPE;
  v_old public.takes%ROWTYPE;
  v_deleted_at timestamptz;
  v_idempotent boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may finalize take ready swap'
      USING ERRCODE = '42501';
  END IF;

  IF p_take_id IS NULL THEN
    RAISE EXCEPTION 'take_id is required';
  END IF;

  IF (p_actor_owner_id IS NULL AND p_actor_anon_hash IS NULL)
     OR (p_actor_owner_id IS NOT NULL AND p_actor_anon_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of owner_id or anonymous_token_hash required';
  END IF;

  IF p_duration_seconds IS NULL OR p_duration_seconds < 0 OR p_duration_seconds > 180 THEN
    RAISE EXCEPTION 'Invalid duration_seconds';
  END IF;

  IF p_byte_size IS NULL OR p_byte_size <= 0 THEN
    RAISE EXCEPTION 'Invalid byte_size';
  END IF;

  IF p_content_type IS NULL OR length(trim(p_content_type)) = 0 THEN
    RAISE EXCEPTION 'Invalid content_type';
  END IF;

  IF p_actor_owner_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_owner_id::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(87245104, hashtext(p_actor_anon_hash));
  END IF;

  SELECT * INTO v_take
  FROM public.takes t
  WHERE t.id = p_take_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Take not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_actor_owner_id IS NOT NULL THEN
    IF v_take.owner_id IS DISTINCT FROM p_actor_owner_id THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_take.anonymous_token_hash IS DISTINCT FROM p_actor_anon_hash
       OR v_take.owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_take.deleted_at IS NOT NULL OR v_take.status = 'DELETED' THEN
    RAISE EXCEPTION 'Take was deleted'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent replay: already READY (optional replace already applied).
  IF v_take.status = 'READY' THEN
    v_idempotent := true;
    IF v_take.replaces_take_id IS NOT NULL THEN
      SELECT * INTO v_old FROM public.takes WHERE id = v_take.replaces_take_id;
      IF FOUND AND v_old.status IS DISTINCT FROM 'DELETED' THEN
        -- Prior partial should be impossible in one txn; heal under lock.
        v_deleted_at := coalesce(v_old.deleted_at, now());
        UPDATE public.takes
        SET status = 'DELETED',
            deleted_at = v_deleted_at,
            failure_reason = coalesce(failure_reason, 'REPLACED')
        WHERE id = v_old.id
          AND status = 'READY'
          AND deleted_at IS NULL;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'take_id', v_take.id,
      'beat_id', v_take.beat_id,
      'status', 'READY',
      'duration_seconds', v_take.duration_seconds,
      'byte_size', v_take.byte_size,
      'content_type', v_take.content_type,
      'replaced_take_id', v_take.replaces_take_id,
      'idempotent_replay', true,
      'code', 'REPLACE_IDEMPOTENCY_REPLAY'
    );
  END IF;

  IF v_take.status IS DISTINCT FROM 'PENDING_UPLOAD' THEN
    RAISE EXCEPTION 'Take is not awaiting finalize'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_take.expires_at <= now() THEN
    UPDATE public.takes
    SET status = 'EXPIRED', failure_reason = 'EXPIRED'
    WHERE id = v_take.id AND status = 'PENDING_UPLOAD';
    RAISE EXCEPTION 'Take session expired'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_take.replaces_take_id IS NOT NULL THEN
    SELECT * INTO v_old
    FROM public.takes t
    WHERE t.id = v_take.replaces_take_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    IF p_actor_owner_id IS NOT NULL THEN
      IF v_old.owner_id IS DISTINCT FROM p_actor_owner_id THEN
        RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      IF v_old.anonymous_token_hash IS DISTINCT FROM p_actor_anon_hash
         OR v_old.owner_id IS NOT NULL THEN
        RAISE EXCEPTION 'REPLACE_OWNERSHIP_DENIED'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF v_old.deleted_at IS NOT NULL OR v_old.status = 'DELETED' THEN
      RAISE EXCEPTION 'REPLACE_CONFLICT'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_old.status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'REPLACE_NOT_READY'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_old.expires_at <= now() THEN
      RAISE EXCEPTION 'REPLACE_EXPIRED'
        USING ERRCODE = 'P0001';
    END IF;

    v_deleted_at := now();

    UPDATE public.takes
    SET status = 'READY',
        duration_seconds = p_duration_seconds,
        byte_size = p_byte_size,
        content_type = p_content_type,
        failure_reason = NULL
    WHERE id = v_take.id
      AND status = 'PENDING_UPLOAD'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_CONFLICT'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.takes
    SET status = 'DELETED',
        deleted_at = v_deleted_at,
        failure_reason = 'REPLACED'
    WHERE id = v_old.id
      AND status = 'READY'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLACE_CONFLICT'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'take_id', v_take.id,
      'beat_id', v_take.beat_id,
      'status', 'READY',
      'duration_seconds', p_duration_seconds,
      'byte_size', p_byte_size,
      'content_type', p_content_type,
      'replaced_take_id', v_old.id,
      'replaced_object_key', v_old.object_key,
      'replaced_storage_bucket', v_old.storage_bucket,
      'idempotent_replay', false
    );
  END IF;

  UPDATE public.takes
  SET status = 'READY',
      duration_seconds = p_duration_seconds,
      byte_size = p_byte_size,
      content_type = p_content_type,
      failure_reason = NULL
  WHERE id = v_take.id
    AND status = 'PENDING_UPLOAD'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPLACE_CONFLICT'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'take_id', v_take.id,
    'beat_id', v_take.beat_id,
    'status', 'READY',
    'duration_seconds', p_duration_seconds,
    'byte_size', p_byte_size,
    'content_type', p_content_type,
    'replaced_take_id', NULL,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_take_ready_swap(
  uuid, uuid, text, integer, bigint, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_take_ready_swap(
  uuid, uuid, text, integer, bigint, text
) TO service_role;
