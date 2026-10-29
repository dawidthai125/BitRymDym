-- A2 — Mix Working Plane durable revision history (append-only).
-- Extends A1 apply RPC to insert a revision in the same transaction when requested.
-- LOCAL-FIRST. service_role only for mutations.

-- ---------------------------------------------------------------------------
-- Revisions table (immutable after insert; no client DML)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_mix_working_revisions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  parent_revision_id uuid NULL REFERENCES public.studio_mix_working_revisions (id),
  restored_from_revision_id uuid NULL REFERENCES public.studio_mix_working_revisions (id),
  kind text NOT NULL,
  author text NOT NULL,
  status text NOT NULL,
  description text NULL,
  source_document_version integer NOT NULL,
  document_digest text NOT NULL,
  snapshot jsonb NOT NULL,
  ops jsonb NULL,
  proposal_id uuid NULL,
  idempotency_request_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  CONSTRAINT studio_mix_working_revisions_kind_chk CHECK (
    kind IN (
      'baseline',
      'manual_checkpoint',
      'auto_proposal',
      'accepted',
      'rejected',
      'restored',
      'tip_apply'
    )
  ),
  CONSTRAINT studio_mix_working_revisions_author_chk CHECK (
    author IN ('USER', 'AUTOMATION', 'AI')
  ),
  CONSTRAINT studio_mix_working_revisions_status_chk CHECK (
    status IN ('draft', 'proposed', 'accepted', 'rejected', 'superseded')
  ),
  CONSTRAINT studio_mix_working_revisions_digest_len_chk CHECK (
    char_length(document_digest) = 64
  ),
  CONSTRAINT studio_mix_working_revisions_version_chk CHECK (
    source_document_version >= 1
  ),
  CONSTRAINT studio_mix_working_revisions_snapshot_kind_chk CHECK (
    (snapshot ->> 'snapshotKind') = 'MIX_WORKING'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_mix_working_revisions_idempotency_uidx
  ON public.studio_mix_working_revisions (owner_id, project_id, idempotency_request_id)
  WHERE idempotency_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS studio_mix_working_revisions_project_created_idx
  ON public.studio_mix_working_revisions (project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS studio_mix_working_revisions_owner_project_idx
  ON public.studio_mix_working_revisions (owner_id, project_id);

ALTER TABLE public.studio_mix_working_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_mix_working_revisions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.studio_mix_working_revisions TO service_role;
-- No UPDATE/DELETE for service_role either — append-only via grants.
REVOKE UPDATE, DELETE ON TABLE public.studio_mix_working_revisions FROM service_role;

COMMENT ON TABLE public.studio_mix_working_revisions IS
  'A2 Mix Working append-only revisions. Mutations via service_role apply RPC only.';

-- ---------------------------------------------------------------------------
-- Replace A1 RPC with A2-aware signature (drop old overload first)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text
);

CREATE OR REPLACE FUNCTION public.studio_cas_apply_mix_working_ops(
  p_project_id uuid,
  p_owner_id uuid,
  p_expected integer,
  p_request_id uuid,
  p_request_fingerprint text,
  p_patch jsonb,
  p_result_document_digest text,
  p_revision jsonb DEFAULT NULL
)
RETURNS TABLE (
  document_version integer,
  document_digest text,
  replay boolean,
  revision_id uuid
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
  v_rev_id uuid;
  v_rev_kind text;
  v_rev_author text;
  v_rev_status text;
  v_rev_parent uuid;
  v_rev_restored_from uuid;
  v_rev_description text;
  v_rev_snapshot jsonb;
  v_rev_ops jsonb;
  v_rev_proposal uuid;
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

  -- Optional revision payload (A2)
  IF p_revision IS NOT NULL THEN
    IF jsonb_typeof(p_revision) <> 'object' THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END IF;
    BEGIN
      v_rev_id := (p_revision ->> 'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END;
    IF v_rev_id IS NULL THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END IF;
    v_rev_kind := p_revision ->> 'kind';
    v_rev_author := COALESCE(p_revision ->> 'author', 'USER');
    v_rev_status := COALESCE(p_revision ->> 'status', 'accepted');
    v_rev_description := p_revision ->> 'description';
    v_rev_snapshot := p_revision -> 'snapshot';
    v_rev_ops := p_revision -> 'ops';
    IF v_rev_snapshot IS NULL OR jsonb_typeof(v_rev_snapshot) <> 'object' THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END IF;
    IF (v_rev_snapshot ->> 'snapshotKind') IS DISTINCT FROM 'MIX_WORKING' THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END IF;
    IF (v_rev_snapshot ->> 'projectId') IS DISTINCT FROM p_project_id::text THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END IF;
    IF (v_rev_snapshot ->> 'ownerId') IS DISTINCT FROM p_owner_id::text THEN
      RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
    END IF;
    IF p_revision ? 'parentRevisionId'
       AND p_revision ->> 'parentRevisionId' IS NOT NULL THEN
      BEGIN
        v_rev_parent := (p_revision ->> 'parentRevisionId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
      END;
    END IF;
    IF p_revision ? 'restoredFromRevisionId'
       AND p_revision ->> 'restoredFromRevisionId' IS NOT NULL THEN
      BEGIN
        v_rev_restored_from := (p_revision ->> 'restoredFromRevisionId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
      END;
    END IF;
    IF p_revision ? 'proposalId' AND p_revision ->> 'proposalId' IS NOT NULL THEN
      BEGIN
        v_rev_proposal := (p_revision ->> 'proposalId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
      END;
    END IF;
  END IF;

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
    revision_id := NULLIF(v_existing.result ->> 'revisionId', '')::uuid;
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

  IF v_new IS NULL OR v_new <> p_expected + 1 THEN
    RAISE EXCEPTION 'FX_CHAIN_VERSION_CONFLICT';
  END IF;

  -- A2: revision insert in the same transaction (before idempotency commit row)
  IF v_rev_id IS NOT NULL THEN
    IF v_rev_parent IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.studio_mix_working_revisions r
        WHERE r.id = v_rev_parent
          AND r.project_id = p_project_id
          AND r.owner_id = p_owner_id
      ) THEN
        RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
      END IF;
    END IF;
    IF v_rev_restored_from IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.studio_mix_working_revisions r
        WHERE r.id = v_rev_restored_from
          AND r.project_id = p_project_id
          AND r.owner_id = p_owner_id
      ) THEN
        RAISE EXCEPTION 'MIX_WORKING_REVISION_INVALID';
      END IF;
    END IF;

    INSERT INTO public.studio_mix_working_revisions (
      id,
      owner_id,
      project_id,
      parent_revision_id,
      restored_from_revision_id,
      kind,
      author,
      status,
      description,
      source_document_version,
      document_digest,
      snapshot,
      ops,
      proposal_id,
      idempotency_request_id,
      created_at,
      accepted_at
    ) VALUES (
      v_rev_id,
      p_owner_id,
      p_project_id,
      v_rev_parent,
      v_rev_restored_from,
      v_rev_kind,
      v_rev_author,
      v_rev_status,
      NULLIF(v_rev_description, ''),
      v_new,
      p_result_document_digest,
      v_rev_snapshot,
      v_rev_ops,
      v_rev_proposal,
      p_request_id,
      now(),
      CASE WHEN v_rev_status = 'accepted' THEN now() ELSE NULL END
    );
  END IF;

  v_result := jsonb_build_object(
    'documentVersion', v_new,
    'documentDigest', p_result_document_digest,
    'revisionId', to_jsonb(v_rev_id)
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
  revision_id := v_rev_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text, jsonb
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.studio_cas_apply_mix_working_ops(
  uuid, uuid, integer, uuid, text, jsonb, text, jsonb
) IS
  'A1/A2 Mix Working atomic apply + optional revision insert. service_role only.';
