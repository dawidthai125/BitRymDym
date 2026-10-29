-- Rights Safety P0 remediation.
-- P0-A: closed still_blocked / needs_new_master keep blocking the same beat+hash.
-- P0-B: USER owner may INSERT an open review for their own beat.
-- P0-C: finalize of a PUBLISHED beat must re-check rights for the new master hash.

CREATE OR REPLACE FUNCTION public.latest_closed_review_outcome(
  p_beat_id uuid,
  p_checksum text
)
RETURNS public.beat_review_close_outcome
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT close_outcome
  FROM public.beat_rights_reviews
  WHERE beat_id = p_beat_id
    AND checksum_sha256 = p_checksum
    AND closed_at IS NOT NULL
    AND close_outcome IS NOT NULL
  ORDER BY closed_at DESC, id DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.latest_closed_review_outcome(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.latest_closed_review_outcome(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.latest_closed_review_outcome(uuid, text) FROM authenticated;

COMMENT ON FUNCTION public.latest_closed_review_outcome(uuid, text) IS
  'Latest closed outcome for one beat and one checksum. New master hashes do not inherit a prior negative outcome.';

CREATE OR REPLACE FUNCTION public.assert_beat_checksum_rights(
  p_beat_id uuid,
  p_checksum text,
  p_ownership public.beat_ownership_type,
  p_require_legal_basis boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_outcome public.beat_review_close_outcome;
BEGIN
  IF p_checksum IS NULL OR p_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'RIGHTS_CHECKSUM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.lock_beat_rights_checksum(p_checksum);

  IF public.hash_event_blocks_publish(p_checksum) THEN
    RAISE EXCEPTION 'RIGHTS_HASH_BLOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.beat_rights_reviews
    WHERE beat_id = p_beat_id
      AND checksum_sha256 = p_checksum
      AND closed_at IS NULL
      AND kind IS DISTINCT FROM 'no_signal'
  ) THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_OPEN' USING ERRCODE = 'P0001';
  END IF;

  v_outcome := public.latest_closed_review_outcome(p_beat_id, p_checksum);
  IF v_outcome IN ('still_blocked', 'needs_new_master') THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_UNRESOLVED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT p_require_legal_basis THEN
    RETURN;
  END IF;

  IF p_ownership = 'USER' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.beat_rights_basis
      WHERE beat_id = p_beat_id
        AND basis_kind = 'user_attestation'
        AND checksum_sha256 = p_checksum
        AND statement_version = 'proposal-2026-10-19'
    ) THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_ownership = 'PLATFORM' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.beat_rights_basis license
      WHERE license.beat_id = p_beat_id
        AND license.basis_kind = 'platform_license'
        AND license.checksum_sha256 = p_checksum
        AND license.scope = 'catalog_publication'
        AND license.statement_version = 'platform-license-2026-10-19'
        AND license.verifier_id IS NOT NULL
        AND license.verified_at IS NOT NULL
        AND (license.valid_until IS NULL OR license.valid_until > now())
        AND NOT EXISTS (
          SELECT 1
          FROM public.beat_rights_basis revocation
          WHERE revocation.basis_kind = 'platform_license_revocation'
            AND revocation.revokes_basis_id = license.id
        )
    ) THEN
      RAISE EXCEPTION 'RIGHTS_LICENSE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'RIGHTS_OWNERSHIP' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean) FROM authenticated;
-- service_role needs EXECUTE so SECURITY INVOKER finalize_beat_master_asset can call it.
-- The helper only validates and raises; it does not publish or mutate beats.
GRANT EXECUTE ON FUNCTION public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_beat_publish_rights(
  p_beat_id uuid,
  p_previous_status public.beat_status,
  p_ownership public.beat_ownership_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_asset_id uuid;
  v_checksum text;
  v_confirmed text;
  v_owner uuid;
BEGIN
  IF p_previous_status IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_PUBLISH_INSERT_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.beat_audio_assets
  WHERE beat_id = p_beat_id
    AND purpose = 'MASTER'
    AND is_active
    AND status = 'READY';

  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'RIGHTS_MASTER_NOT_READY' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, checksum_sha256
  INTO v_asset_id, v_checksum
  FROM public.beat_audio_assets
  WHERE beat_id = p_beat_id
    AND purpose = 'MASTER'
    AND is_active
    AND status = 'READY';

  IF v_checksum IS NULL OR v_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'RIGHTS_CHECKSUM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Lock order with the beat row already held by the UPDATE caller:
  -- beat → checksum → asset FOR SHARE. assert_beat_checksum_rights re-takes
  -- the same checksum row lock in this transaction.
  PERFORM public.lock_beat_rights_checksum(v_checksum);

  SELECT checksum_sha256
  INTO v_confirmed
  FROM public.beat_audio_assets
  WHERE id = v_asset_id
  FOR SHARE;

  IF v_confirmed IS DISTINCT FROM v_checksum THEN
    RAISE EXCEPTION 'RIGHTS_MASTER_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id
  INTO v_owner
  FROM public.beats
  WHERE id = p_beat_id;

  PERFORM public.assert_beat_moderation_actor(p_ownership, v_owner);

  IF p_ownership = 'USER' THEN
    IF p_previous_status IS DISTINCT FROM 'APPROVED' THEN
      RAISE EXCEPTION 'RIGHTS_USER_NOT_APPROVED' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_ownership = 'PLATFORM' THEN
    IF p_previous_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'RIGHTS_PLATFORM_NOT_DRAFT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'RIGHTS_OWNERSHIP' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_beat_checksum_rights(
    p_beat_id,
    v_checksum,
    p_ownership,
    true
  );
END;
$$;

COMMENT ON FUNCTION public.assert_beat_publish_rights(uuid, public.beat_status, public.beat_ownership_type) IS
  'Authoritative publish gate. Closed still_blocked / needs_new_master keep blocking the same beat+hash. dismissed_no_publish does not. A new master hash is evaluated independently.';

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

  -- Beat is locked. Rights checks take the checksum lock next (same order as publish).
  IF v_beat.status = 'PUBLISHED' THEN
    PERFORM public.assert_beat_checksum_rights(
      p_beat_id,
      p_checksum_sha256,
      p_ownership_type,
      true
    );
  ELSE
    PERFORM public.assert_beat_checksum_rights(
      p_beat_id,
      p_checksum_sha256,
      p_ownership_type,
      false
    );
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

DROP POLICY IF EXISTS beat_reviews_insert_own ON public.beat_rights_reviews;
CREATE POLICY beat_reviews_insert_own
  ON public.beat_rights_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND closed_at IS NULL
    AND closed_by IS NULL
    AND close_outcome IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.beats b
      WHERE b.id = beat_id
        AND b.ownership_type = 'USER'
        AND b.owner_id IS NOT NULL
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS beat_reviews_select_own ON public.beat_rights_reviews;
CREATE POLICY beat_reviews_select_own
  ON public.beat_rights_reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.beats b
      WHERE b.id = beat_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DO $$
DECLARE
  v_fn regprocedure := 'public.finalize_beat_master_asset(uuid, uuid, public.beat_ownership_type, uuid, text, bigint, text, integer, boolean, text, text, text, text, text, integer, text, text, text[], text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'finalize_beat_master_asset EXECUTE ACL mismatch after remediation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = v_fn
      AND (prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])
  ) THEN
    RAISE EXCEPTION 'finalize_beat_master_asset definition mismatch after remediation';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.assert_beat_checksum_rights(uuid, text, public.beat_ownership_type, boolean)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'assert_beat_checksum_rights EXECUTE ACL mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'beat_rights_reviews'
      AND policyname = 'beat_reviews_insert_own'
  ) THEN
    RAISE EXCEPTION 'beat_reviews_insert_own policy missing';
  END IF;
END;
$$;
