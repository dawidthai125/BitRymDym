-- Security Wave 5: transactional beat MASTER finalization (E1 + atomic swap).
--
-- One function call = one transaction: lock the beat, validate the asset, replace
-- the active MASTER, activate the new asset and write the beat metadata derived
-- from it. Either everything commits or nothing does; a crash, timeout or error
-- leaves the previous active MASTER and the previous metadata in place.
--
-- Callers: src/lib/beats/audio-transport.ts (USER finalize, PLATFORM finalize,
-- PLATFORM MASTER replace) with the service-role client, after application-level
-- authentication, permission, ownership and status checks. The function repeats
-- every data-integrity check because the beats / beat_audio_assets triggers skip
-- their checks for service_role.
--
-- Lock order (all writers of this function): beats row FOR NO KEY UPDATE, then the
-- target asset, then the active MASTER. Finalizations of one beat run one after
-- another; FOR NO KEY UPDATE does not block FOR KEY SHARE taken by FK checks of
-- concurrent beat_audio_assets inserts (new upload sessions).
--
-- SECURITY INVOKER: service_role already owns every privilege used here, so the
-- function grants nothing extra. EXECUTE is service_role only (the default ACL of
-- this schema grants new functions to anon / authenticated; revoked below).
--
-- Errors (SQLSTATE P0001, message = token) mapped by the application:
--   BEAT_NOT_FOUND / ASSET_NOT_FOUND         -> 404
--   ASSET_BEAT_MISMATCH                      -> 403 (same as the app-level check)
--   BEAT_CHANGED / NOT_PENDING_MASTER /
--   ALREADY_FINALIZED / ACTIVE_AUDIO_CHANGED -> 409 CONFLICT
-- 42501 (not service_role) and 22023 (invalid input) are programming errors -> 500.
--
-- Schema dependencies (unchanged): beats, beat_audio_assets,
-- beat_audio_assets_one_active_per_purpose_uidx, beats CHECK constraints
-- (title length, bpm 1..300, duration 1..210), beat_audio_assets_ready_payload_chk.

CREATE OR REPLACE FUNCTION public.finalize_beat_master_asset(
  p_beat_id uuid,
  p_asset_id uuid,
  p_ownership_type public.beat_ownership_type,
  p_owner_id uuid,
  p_content_type text,
  p_byte_size bigint,
  p_checksum_sha256 text,
  p_duration_seconds integer,
  p_apply_metadata boolean,
  p_title text,
  p_producer text,
  p_description text,
  p_genre text,
  p_style text,
  p_bpm integer,
  p_key text,
  p_scale text,
  p_tags text[],
  p_cover_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_beat public.beats%ROWTYPE;
  v_asset public.beat_audio_assets%ROWTYPE;
  v_previous_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may finalize beat audio'
      USING ERRCODE = '42501';
  END IF;

  IF p_beat_id IS NULL OR p_asset_id IS NULL OR p_ownership_type IS NULL
     OR p_apply_metadata IS NULL OR p_duration_seconds IS NULL
     OR p_content_type IS NULL OR btrim(p_content_type) = ''
     OR p_byte_size IS NULL OR p_byte_size <= 0
     OR p_checksum_sha256 IS NULL OR p_checksum_sha256 !~ '^[0-9a-f]{64}$'
     OR (p_ownership_type = 'USER' AND p_owner_id IS NULL)
     OR (p_ownership_type = 'PLATFORM' AND p_owner_id IS NOT NULL)
     OR (p_apply_metadata AND (p_title IS NULL OR p_bpm IS NULL OR p_tags IS NULL)) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_beat
  FROM public.beats
  WHERE id = p_beat_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BEAT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_beat.ownership_type IS DISTINCT FROM p_ownership_type
     OR v_beat.owner_id IS DISTINCT FROM p_owner_id
     OR (p_ownership_type = 'USER' AND v_beat.status NOT IN ('DRAFT', 'REJECTED')) THEN
    RAISE EXCEPTION 'BEAT_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_asset
  FROM public.beat_audio_assets
  WHERE id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_asset.beat_id IS DISTINCT FROM p_beat_id THEN
    RAISE EXCEPTION 'ASSET_BEAT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_asset.purpose IS DISTINCT FROM 'MASTER' THEN
    RAISE EXCEPTION 'NOT_PENDING_MASTER' USING ERRCODE = 'P0001';
  END IF;

  -- Retry of a committed finalization (lost response): success without writes
  -- only when the active asset and the beat already hold exactly this request.
  IF v_asset.status = 'READY' AND v_asset.is_active THEN
    IF v_asset.checksum_sha256 IS NOT DISTINCT FROM p_checksum_sha256
       AND v_asset.byte_size IS NOT DISTINCT FROM p_byte_size
       AND v_asset.content_type IS NOT DISTINCT FROM p_content_type
       AND v_beat.duration_seconds IS NOT DISTINCT FROM p_duration_seconds
       AND (
         NOT p_apply_metadata
         OR (
           v_beat.title IS NOT DISTINCT FROM p_title
           AND v_beat.producer IS NOT DISTINCT FROM p_producer
           AND v_beat.description IS NOT DISTINCT FROM p_description
           AND v_beat.genre IS NOT DISTINCT FROM p_genre
           AND v_beat.style IS NOT DISTINCT FROM p_style
           AND v_beat.bpm IS NOT DISTINCT FROM p_bpm
           AND v_beat.key IS NOT DISTINCT FROM p_key
           AND v_beat.scale IS NOT DISTINCT FROM p_scale
           AND v_beat.tags IS NOT DISTINCT FROM p_tags
           AND v_beat.cover_ref IS NOT DISTINCT FROM p_cover_ref
         )
       ) THEN
      RETURN jsonb_build_object(
        'beat_id', p_beat_id,
        'asset', to_jsonb(v_asset),
        'replaced_asset_id', NULL,
        'idempotent_replay', true
      );
    END IF;
    RAISE EXCEPTION 'ALREADY_FINALIZED' USING ERRCODE = 'P0001';
  END IF;

  IF v_asset.status IS DISTINCT FROM 'PENDING_UPLOAD' THEN
    RAISE EXCEPTION 'NOT_PENDING_MASTER' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_previous_id
  FROM public.beat_audio_assets
  WHERE beat_id = p_beat_id
    AND purpose = 'MASTER'
    AND is_active
    AND id <> p_asset_id
  FOR UPDATE;

  BEGIN
    IF v_previous_id IS NOT NULL THEN
      UPDATE public.beat_audio_assets
      SET is_active = false,
          status = 'REPLACED',
          replaced_by_asset_id = p_asset_id
      WHERE id = v_previous_id;
    END IF;

    UPDATE public.beat_audio_assets
    SET status = 'READY',
        is_active = true,
        content_type = p_content_type,
        byte_size = p_byte_size,
        checksum_sha256 = p_checksum_sha256
    WHERE id = p_asset_id
    RETURNING * INTO v_asset;
  EXCEPTION
    -- Only reachable through a writer outside this function (the beat row lock
    -- serializes this function); the whole transaction still rolls back.
    WHEN unique_violation THEN
      RAISE EXCEPTION 'ACTIVE_AUDIO_CHANGED' USING ERRCODE = 'P0001';
  END;

  IF p_apply_metadata THEN
    UPDATE public.beats
    SET title = p_title,
        producer = p_producer,
        description = p_description,
        genre = p_genre,
        style = p_style,
        bpm = p_bpm,
        key = p_key,
        scale = p_scale,
        duration_seconds = p_duration_seconds,
        tags = p_tags,
        cover_ref = p_cover_ref
    WHERE id = p_beat_id;
  ELSE
    UPDATE public.beats
    SET duration_seconds = p_duration_seconds
    WHERE id = p_beat_id;
  END IF;

  RETURN jsonb_build_object(
    'beat_id', p_beat_id,
    'asset', to_jsonb(v_asset),
    'replaced_asset_id', v_previous_id,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_beat_master_asset(uuid, uuid, public.beat_ownership_type, uuid, text, bigint, text, integer, boolean, text, text, text, text, text, integer, text, text, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_beat_master_asset(uuid, uuid, public.beat_ownership_type, uuid, text, bigint, text, integer, boolean, text, text, text, text, text, integer, text, text, text[], text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_beat_master_asset(uuid, uuid, public.beat_ownership_type, uuid, text, bigint, text, integer, boolean, text, text, text, text, text, integer, text, text, text[], text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_beat_master_asset(uuid, uuid, public.beat_ownership_type, uuid, text, bigint, text, integer, boolean, text, text, text, text, text, integer, text, text, text[], text) TO service_role;

DO $$
DECLARE
  v_fn regprocedure := 'public.finalize_beat_master_asset(uuid, uuid, public.beat_ownership_type, uuid, text, bigint, text, integer, boolean, text, text, text, text, text, integer, text, text, text[], text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'finalize_beat_master_asset EXECUTE ACL mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = v_fn
      AND (prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])
  ) THEN
    RAISE EXCEPTION 'finalize_beat_master_asset definition mismatch';
  END IF;
END;
$$;
