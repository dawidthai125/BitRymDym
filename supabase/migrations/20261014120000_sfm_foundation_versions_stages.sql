-- SFM Foundation (Stage A) — immutable accepted versions + domain stages.
-- GO-SFM-IMPL-A / local only. Does NOT add render_jobs.kind values.
-- Does NOT mutate E3 MIX / TAKE / RAW semantics.
-- Job enqueue for SFM_MIX/SFM_MASTER is OUT OF SCOPE (Stage C / OD-SFM-ID-07).

-- ---------------------------------------------------------------------------
-- studio_final_versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_final_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  source_document_version integer NOT NULL,
  content_snapshot jsonb NOT NULL,
  content_digest text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ACCEPTED',
  retention_anchor_at timestamptz NULL,
  expires_at timestamptz NULL,
  superseded_by uuid NULL REFERENCES public.studio_final_versions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_final_versions_source_document_version_chk
    CHECK (source_document_version >= 1),
  CONSTRAINT studio_final_versions_status_chk
    CHECK (status IN ('ACCEPTED', 'EXPORTS_ELIGIBLE', 'SUPERSEDED', 'EXPIRED')),
  CONSTRAINT studio_final_versions_content_digest_chk
    CHECK (char_length(content_digest) >= 16 AND char_length(content_digest) <= 128)
);

CREATE INDEX IF NOT EXISTS studio_final_versions_project_accepted_idx
  ON public.studio_final_versions (project_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS studio_final_versions_owner_accepted_idx
  ON public.studio_final_versions (owner_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS studio_final_versions_expires_idx
  ON public.studio_final_versions (expires_at)
  WHERE status <> 'EXPIRED' AND expires_at IS NOT NULL;

CREATE TRIGGER studio_final_versions_set_updated_at
BEFORE UPDATE ON public.studio_final_versions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_studio_final_versions_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_final_versions';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER studio_final_versions_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.studio_final_versions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_studio_final_versions_privilege_escalation();

ALTER TABLE public.studio_final_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_final_versions_select_own ON public.studio_final_versions;
CREATE POLICY studio_final_versions_select_own
  ON public.studio_final_versions
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.studio_final_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_final_versions TO authenticated;
GRANT ALL ON TABLE public.studio_final_versions TO service_role;

COMMENT ON TABLE public.studio_final_versions IS
  'SFM Stage A — immutable accepted Studio finalization versions. Mutations service_role / DEFINER RPC only.';

-- ---------------------------------------------------------------------------
-- studio_final_stages (domain stages ≠ render_jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_final_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.studio_final_versions (id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  job_id uuid NULL REFERENCES public.render_jobs (id) ON DELETE SET NULL,
  error_code text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_final_stages_kind_chk
    CHECK (kind IN ('SFM_MIX', 'SFM_MASTER')),
  CONSTRAINT studio_final_stages_status_chk
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT studio_final_stages_version_kind_uidx UNIQUE (version_id, kind)
);

CREATE INDEX IF NOT EXISTS studio_final_stages_version_idx
  ON public.studio_final_stages (version_id);

CREATE TRIGGER studio_final_stages_set_updated_at
BEFORE UPDATE ON public.studio_final_stages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_studio_final_stages_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_final_stages';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER studio_final_stages_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.studio_final_stages
FOR EACH ROW
EXECUTE FUNCTION public.prevent_studio_final_stages_privilege_escalation();

ALTER TABLE public.studio_final_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_final_stages_select_own ON public.studio_final_stages;
CREATE POLICY studio_final_stages_select_own
  ON public.studio_final_stages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_final_versions v
      WHERE v.id = studio_final_stages.version_id
        AND v.owner_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.studio_final_stages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_final_stages TO authenticated;
GRANT ALL ON TABLE public.studio_final_stages TO service_role;

COMMENT ON TABLE public.studio_final_stages IS
  'SFM Stage A — domain stages SFM_MIX / SFM_MASTER. Not written by E3 kind=MIX paths.';

-- ---------------------------------------------------------------------------
-- studio_projects.current_final_version_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.studio_projects
  ADD COLUMN IF NOT EXISTS current_final_version_id uuid NULL
  REFERENCES public.studio_final_versions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS studio_projects_current_final_version_idx
  ON public.studio_projects (current_final_version_id)
  WHERE current_final_version_id IS NOT NULL;

COMMENT ON COLUMN public.studio_projects.current_final_version_id IS
  'SFM — pointer to current EXPORTS_ELIGIBLE final version (set on MASTER SUCCEEDED).';

-- ---------------------------------------------------------------------------
-- sfm_accept_version — atomic Accept + PENDING stages (no job enqueue)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_accept_version(
  p_project_id uuid,
  p_owner_id uuid,
  p_expected_document_version integer,
  p_content_snapshot jsonb,
  p_content_digest text
)
RETURNS TABLE (
  version_id uuid,
  project_id uuid,
  owner_id uuid,
  source_document_version integer,
  content_digest text,
  status text,
  accepted_at timestamptz,
  mix_stage_status text,
  master_stage_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.studio_projects%ROWTYPE;
  v_version_id uuid;
  v_accepted_at timestamptz;
  v_mix_status text;
  v_master_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_project_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'INVALID';
  END IF;
  IF p_expected_document_version IS NULL OR p_expected_document_version < 1 THEN
    RAISE EXCEPTION 'INVALID';
  END IF;
  IF p_content_snapshot IS NULL OR p_content_digest IS NULL
     OR char_length(p_content_digest) < 16 THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sfm_accept:' || p_project_id::text, 0)
  );

  SELECT * INTO v_project
  FROM public.studio_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_project.owner_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  IF v_project.document_version IS DISTINCT FROM p_expected_document_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;

  INSERT INTO public.studio_final_versions (
    project_id,
    owner_id,
    source_document_version,
    content_snapshot,
    content_digest,
    status,
    accepted_at
  ) VALUES (
    p_project_id,
    p_owner_id,
    p_expected_document_version,
    p_content_snapshot,
    p_content_digest,
    'ACCEPTED',
    now()
  )
  RETURNING id, studio_final_versions.accepted_at
  INTO v_version_id, v_accepted_at;

  INSERT INTO public.studio_final_stages (version_id, kind, status)
  VALUES
    (v_version_id, 'SFM_MIX', 'PENDING'),
    (v_version_id, 'SFM_MASTER', 'PENDING');

  SELECT s.status INTO v_mix_status
  FROM public.studio_final_stages s
  WHERE s.version_id = v_version_id AND s.kind = 'SFM_MIX';

  SELECT s.status INTO v_master_status
  FROM public.studio_final_stages s
  WHERE s.version_id = v_version_id AND s.kind = 'SFM_MASTER';

  RETURN QUERY SELECT
    v_version_id,
    p_project_id,
    p_owner_id,
    p_expected_document_version,
    p_content_digest,
    'ACCEPTED'::text,
    v_accepted_at,
    v_mix_status,
    v_master_status;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_accept_version(uuid, uuid, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_accept_version(uuid, uuid, integer, jsonb, text)
  TO service_role;

COMMENT ON FUNCTION public.sfm_accept_version(uuid, uuid, integer, jsonb, text) IS
  'SFM Stage A — Accept immutable version + PENDING SFM_MIX/SFM_MASTER stages. No render_jobs.';

-- ---------------------------------------------------------------------------
-- sfm_start_stage — domain PENDING→RUNNING (no job enqueue in Stage A)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_start_stage(
  p_version_id uuid,
  p_owner_id uuid,
  p_kind text
)
RETURNS TABLE (
  stage_id uuid,
  version_id uuid,
  kind text,
  status text,
  started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.studio_final_versions%ROWTYPE;
  v_mix_status text;
  v_stage public.studio_final_stages%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_kind IS DISTINCT FROM 'SFM_MIX' AND p_kind IS DISTINCT FROM 'SFM_MASTER' THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  SELECT * INTO v_version
  FROM public.studio_final_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_version.owner_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  IF v_version.status NOT IN ('ACCEPTED', 'EXPORTS_ELIGIBLE') THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  IF p_kind = 'SFM_MASTER' THEN
    SELECT s.status INTO v_mix_status
    FROM public.studio_final_stages s
    WHERE s.version_id = p_version_id AND s.kind = 'SFM_MIX'
    FOR UPDATE;

    IF v_mix_status IS DISTINCT FROM 'SUCCEEDED' THEN
      RAISE EXCEPTION 'ILLEGAL_TRANSITION';
    END IF;
  END IF;

  SELECT * INTO v_stage
  FROM public.studio_final_stages
  WHERE studio_final_stages.version_id = p_version_id
    AND studio_final_stages.kind = p_kind
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  -- Idempotent: already RUNNING
  IF v_stage.status = 'RUNNING' THEN
    RETURN QUERY SELECT
      v_stage.id,
      v_stage.version_id,
      v_stage.kind,
      v_stage.status,
      v_stage.started_at;
    RETURN;
  END IF;

  IF v_stage.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION';
  END IF;

  UPDATE public.studio_final_stages
  SET status = 'RUNNING',
      started_at = v_now,
      error_code = NULL,
      finished_at = NULL
  WHERE id = v_stage.id
  RETURNING * INTO v_stage;

  RETURN QUERY SELECT
    v_stage.id,
    v_stage.version_id,
    v_stage.kind,
    v_stage.status,
    v_stage.started_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_start_stage(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_start_stage(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.sfm_start_stage(uuid, uuid, text) IS
  'SFM Stage A — start domain stage. No render_jobs.kind enqueue (OD-SFM-ID-07 OPEN).';

-- ---------------------------------------------------------------------------
-- sfm_complete_stage — worker/service only; MASTER SUCCEEDED → EXPORTS_ELIGIBLE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_complete_stage(
  p_version_id uuid,
  p_kind text,
  p_status text,
  p_job_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS TABLE (
  stage_id uuid,
  version_id uuid,
  kind text,
  stage_status text,
  version_status text,
  current_final_version_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.studio_final_versions%ROWTYPE;
  v_mix_status text;
  v_stage public.studio_final_stages%ROWTYPE;
  v_now timestamptz := now();
  v_project_id uuid;
  v_prev_current uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_kind IS DISTINCT FROM 'SFM_MIX' AND p_kind IS DISTINCT FROM 'SFM_MASTER' THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  IF p_status IS DISTINCT FROM 'SUCCEEDED' AND p_status IS DISTINCT FROM 'FAILED' THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  SELECT * INTO v_version
  FROM public.studio_final_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  v_project_id := v_version.project_id;

  IF p_kind = 'SFM_MASTER' AND p_status = 'SUCCEEDED' THEN
    SELECT s.status INTO v_mix_status
    FROM public.studio_final_stages s
    WHERE s.version_id = p_version_id AND s.kind = 'SFM_MIX'
    FOR UPDATE;

    IF v_mix_status IS DISTINCT FROM 'SUCCEEDED' THEN
      RAISE EXCEPTION 'ILLEGAL_TRANSITION';
    END IF;
  END IF;

  SELECT * INTO v_stage
  FROM public.studio_final_stages
  WHERE studio_final_stages.version_id = p_version_id
    AND studio_final_stages.kind = p_kind
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  -- Idempotent complete to same terminal status
  IF v_stage.status = p_status AND v_stage.status IN ('SUCCEEDED', 'FAILED') THEN
    RETURN QUERY SELECT
      v_stage.id,
      v_stage.version_id,
      v_stage.kind,
      v_stage.status,
      v_version.status,
      (
        SELECT sp.current_final_version_id
        FROM public.studio_projects sp
        WHERE sp.id = v_project_id
      );
    RETURN;
  END IF;

  IF v_stage.status IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION';
  END IF;

  UPDATE public.studio_final_stages
  SET status = p_status,
      finished_at = v_now,
      job_id = COALESCE(p_job_id, job_id),
      error_code = CASE
        WHEN p_status = 'FAILED' THEN p_error_code
        ELSE NULL
      END
  WHERE id = v_stage.id
  RETURNING * INTO v_stage;

  IF p_kind = 'SFM_MASTER' AND p_status = 'SUCCEEDED' THEN
    SELECT sp.current_final_version_id INTO v_prev_current
    FROM public.studio_projects sp
    WHERE sp.id = v_project_id
    FOR UPDATE;

    IF v_prev_current IS NOT NULL AND v_prev_current IS DISTINCT FROM p_version_id THEN
      UPDATE public.studio_final_versions
      SET status = 'SUPERSEDED',
          superseded_by = p_version_id
      WHERE id = v_prev_current
        AND status IN ('ACCEPTED', 'EXPORTS_ELIGIBLE');
    END IF;

    UPDATE public.studio_final_versions
    SET status = 'EXPORTS_ELIGIBLE',
        retention_anchor_at = v_now,
        expires_at = v_now + interval '90 days'
    WHERE id = p_version_id
    RETURNING * INTO v_version;

    UPDATE public.studio_projects
    SET current_final_version_id = p_version_id
    WHERE id = v_project_id;
  END IF;

  RETURN QUERY SELECT
    v_stage.id,
    v_stage.version_id,
    v_stage.kind,
    v_stage.status,
    v_version.status,
    (
      SELECT sp.current_final_version_id
      FROM public.studio_projects sp
      WHERE sp.id = v_project_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_complete_stage(uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_complete_stage(uuid, text, text, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.sfm_complete_stage(uuid, text, text, uuid, text) IS
  'SFM Stage A — complete domain stage. Job SUCCEEDED alone is insufficient without this RPC. No E3 MIX writes.';

REVOKE EXECUTE ON FUNCTION public.prevent_studio_final_versions_privilege_escalation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_studio_final_stages_privilege_escalation()
  FROM PUBLIC, anon, authenticated;
