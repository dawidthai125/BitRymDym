-- A1 — Mix Working Plane atomic apply + durable idempotency (local-first).
-- SECURITY DEFINER RPC: service_role only. No client EXECUTE.
-- Tip SSOT remains studio_projects.document_version + track/master columns.

-- ---------------------------------------------------------------------------
-- Idempotency ledger (succeeded only; apply + insert are one transaction)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_mix_working_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'succeeded',
  version_before integer NOT NULL,
  version_after integer NOT NULL,
  result_document_digest text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_mix_working_idempotency_status_chk
    CHECK (status = 'succeeded'),
  CONSTRAINT studio_mix_working_idempotency_fingerprint_len_chk
    CHECK (char_length(request_fingerprint) = 64),
  CONSTRAINT studio_mix_working_idempotency_digest_len_chk
    CHECK (char_length(result_document_digest) = 64),
  CONSTRAINT studio_mix_working_idempotency_versions_chk
    CHECK (
      version_before >= 1
      AND version_after = version_before + 1
    ),
  CONSTRAINT studio_mix_working_idempotency_owner_project_request_uidx
    UNIQUE (owner_id, project_id, request_id)
);

CREATE INDEX IF NOT EXISTS studio_mix_working_idempotency_project_created_idx
  ON public.studio_mix_working_idempotency (project_id, created_at DESC);

ALTER TABLE public.studio_mix_working_idempotency ENABLE ROW LEVEL SECURITY;

-- No direct client DML/SELECT — service_role only (RPC is the write path).
REVOKE ALL ON TABLE public.studio_mix_working_idempotency
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.studio_mix_working_idempotency TO service_role;

COMMENT ON TABLE public.studio_mix_working_idempotency IS
  'A1 Mix Working apply idempotency. Succeeded rows only; mutations via service_role RPC.';

-- ---------------------------------------------------------------------------
-- Patch allowlist helpers (closed keys only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_mix_working_assert_track_patch(
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN ('gain_db', 'pan', 'muted', 'solo', 'effects_chain') THEN
      RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
    END IF;
  END LOOP;

  IF p_patch ? 'gain_db' AND jsonb_typeof(p_patch -> 'gain_db') <> 'number' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch ? 'pan' AND jsonb_typeof(p_patch -> 'pan') <> 'number' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch ? 'muted' AND jsonb_typeof(p_patch -> 'muted') <> 'boolean' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch ? 'solo' AND jsonb_typeof(p_patch -> 'solo') <> 'boolean' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch ? 'effects_chain'
     AND jsonb_typeof(p_patch -> 'effects_chain') <> 'object' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_mix_working_assert_master_patch(
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_patch IS NULL THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN ('master_gain_db', 'master_pan', 'master_fx_chain') THEN
      RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
    END IF;
  END LOOP;

  IF p_patch ? 'master_gain_db'
     AND jsonb_typeof(p_patch -> 'master_gain_db') <> 'number' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch ? 'master_pan'
     AND jsonb_typeof(p_patch -> 'master_pan') <> 'number' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
  IF p_patch ? 'master_fx_chain'
     AND jsonb_typeof(p_patch -> 'master_fx_chain') <> 'object' THEN
    RAISE EXCEPTION 'MIX_WORKING_PATCH_INVALID';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_mix_working_assert_track_patch(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_mix_working_assert_master_patch(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_mix_working_assert_track_patch(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_mix_working_assert_master_patch(jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic CAS apply
-- ---------------------------------------------------------------------------
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
  -- 1) Parameter format validation
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

  -- 2/3) Serialize project + idempotency key via existing Studio advisory family
  PERFORM pg_advisory_xact_lock(87245130, hashtext(p_project_id::text));

  -- 4/5) Idempotency replay / key reuse
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

  -- 6) Lock project row + ownership
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

  -- 7) CAS expected
  IF v_version IS DISTINCT FROM p_expected THEN
    RETURN;
  END IF;

  -- 8) All referenced tracks must belong to this project
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

  -- 9) Track updates in deterministic id order (allowlisted columns only)
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

  -- 10) Master fields + single document_version bump
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
    -- Concurrent tip advance after FOR UPDATE should be rare; fail closed.
    RAISE EXCEPTION 'FX_CHAIN_VERSION_CONFLICT';
  END IF;

  IF v_new <> p_expected + 1 THEN
    RAISE EXCEPTION 'FX_CHAIN_VERSION_CONFLICT';
  END IF;

  v_result := jsonb_build_object(
    'documentVersion', v_new,
    'documentDigest', p_result_document_digest
  );

  -- 11) Idempotency row in the same transaction
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

  -- 12) Return
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

COMMENT ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text
) IS
  'A1 Mix Working atomic multi-op apply under CAS + durable idempotency. service_role only.';
