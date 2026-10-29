CREATE OR REPLACE FUNCTION public.studio_cas_apply_mix_working_ops(
  p_project_id uuid,
  p_owner_id uuid,
  p_expected integer,
  p_request_id uuid,
  p_request_fingerprint text,
  p_patch jsonb,
  p_result_document_digest text
)
RETURNS TABLE (
  document_version integer,
  document_digest text,
  replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.studio_mix_working_idempotency%ROWTYPE;
  v_owner uuid;
  v_version integer;
  v_new integer;
  v_tracks jsonb;
  v_master jsonb;
  v_track_id uuid;
  v_track_ids uuid[];
  v_track_patch jsonb;
  v_result jsonb;
  v_key text;
BEGIN
  IF p_project_id IS NULL OR p_owner_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_expected IS NULL OR p_expected < 1 THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_request_fingerprint IS NULL
     OR char_length(p_request_fingerprint) <> 64
     OR p_request_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_result_document_digest IS NULL
     OR char_length(p_result_document_digest) <> 64
     OR p_result_document_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN ('tracks', 'master') THEN
      RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
    END IF;
  END LOOP;

  v_tracks := COALESCE(p_patch -> 'tracks', '{}'::jsonb);
  v_master := COALESCE(p_patch -> 'master', '{}'::jsonb);

  IF jsonb_typeof(v_tracks) <> 'object' OR jsonb_typeof(v_master) <> 'object' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;

  PERFORM public.studio_mix_working_assert_master_patch(v_master);

  FOR v_key IN SELECT jsonb_object_keys(v_tracks)
  LOOP
    BEGIN
      v_track_id := v_key::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
    END;
    PERFORM public.studio_mix_working_assert_track_patch(v_tracks -> v_key);
  END LOOP;

  PERFORM pg_advisory_xact_lock(87245130, hashtext(p_project_id::text));

  SELECT *
  INTO v_existing
  FROM public.studio_mix_working_idempotency AS i
  WHERE i.owner_id = p_owner_id
    AND i.project_id = p_project_id
    AND i.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE';
    END IF;
    document_version := v_existing.version_after;
    document_digest := v_existing.result_document_digest;
    replay := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT sp.owner_id, sp.document_version
  INTO v_owner, v_version
  FROM public.studio_projects AS sp
  WHERE sp.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_owner IS DISTINCT FROM p_owner_id THEN
    RETURN;
  END IF;

  IF v_version IS DISTINCT FROM p_expected THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(k::uuid ORDER BY k), ARRAY[]::uuid[])
  INTO v_track_ids
  FROM jsonb_object_keys(v_tracks) AS k;

  IF cardinality(v_track_ids) > 0 THEN
    IF (
      SELECT count(*)::integer
      FROM public.studio_tracks AS t
      WHERE t.project_id = p_project_id
        AND t.id = ANY (v_track_ids)
    ) <> cardinality(v_track_ids) THEN
      RAISE EXCEPTION 'TRACK_NOT_FOUND';
    END IF;
  END IF;

  FOREACH v_track_id IN ARRAY v_track_ids
  LOOP
    v_track_patch := v_tracks -> v_track_id::text;

    UPDATE public.studio_tracks AS t
    SET
      gain_db = CASE
        WHEN v_track_patch ? 'gain_db'
          THEN (v_track_patch ->> 'gain_db')::double precision
        ELSE t.gain_db
      END,
      pan = CASE
        WHEN v_track_patch ? 'pan'
          THEN (v_track_patch ->> 'pan')::double precision
        ELSE t.pan
      END,
      muted = CASE
        WHEN v_track_patch ? 'muted'
          THEN (v_track_patch ->> 'muted')::boolean
        ELSE t.muted
      END,
      solo = CASE
        WHEN v_track_patch ? 'solo'
          THEN (v_track_patch ->> 'solo')::boolean
        ELSE t.solo
      END,
      effects_chain = CASE
        WHEN v_track_patch ? 'effects_chain'
          THEN v_track_patch -> 'effects_chain'
        ELSE t.effects_chain
      END
    WHERE t.id = v_track_id
      AND t.project_id = p_project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TRACK_NOT_FOUND';
    END IF;
  END LOOP;

  UPDATE public.studio_projects AS sp
  SET
    master_gain_db = CASE
      WHEN v_master ? 'master_gain_db'
        THEN (v_master ->> 'master_gain_db')::double precision
      ELSE sp.master_gain_db
    END,
    master_pan = CASE
      WHEN v_master ? 'master_pan'
        THEN (v_master ->> 'master_pan')::double precision
      ELSE sp.master_pan
    END,
    master_fx_chain = CASE
      WHEN v_master ? 'master_fx_chain'
        THEN v_master -> 'master_fx_chain'
      ELSE sp.master_fx_chain
    END,
    document_version = sp.document_version + 1
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'FX_CHAIN_VERSION_CONFLICT';
  END IF;

  IF v_new <> p_expected + 1 THEN
    RAISE EXCEPTION 'FX_CHAIN_VERSION_CONFLICT';
  END IF;

  v_result := jsonb_build_object(
    'documentVersion', v_new,
    'documentDigest', p_result_document_digest
  );

  INSERT INTO public.studio_mix_working_idempotency (
    owner_id,
    project_id,
    request_id,
    request_fingerprint,
    status,
    version_before,
    version_after,
    result_document_digest,
    result
  ) VALUES (
    p_owner_id,
    p_project_id,
    p_request_id,
    p_request_fingerprint,
    'succeeded',
    p_expected,
    v_new,
    p_result_document_digest,
    v_result
  );

  document_version := v_new;
  document_digest := p_result_document_digest;
  replay := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text
) TO service_role;
;
