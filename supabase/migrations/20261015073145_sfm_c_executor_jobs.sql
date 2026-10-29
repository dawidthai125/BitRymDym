-- SFM Stage C — executor job kinds + version bind + SFM claim RPC.
-- GO-SFM-IMPL-C / local only.
-- Does NOT enable Contabo poller for SFM.
-- Does NOT alter claim_next_studio_export_job (STUDIO_EXPORT-only remains).
-- Does NOT implement encode/bake/download/UI.
-- Job SUCCEEDED alone never completes a domain stage (sfm_complete_stage required).

-- ---------------------------------------------------------------------------
-- Columns: version bind + optional quality (QUALITY_ENCODE)
-- ---------------------------------------------------------------------------
ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS sfm_version_id uuid
    REFERENCES public.studio_final_versions (id) ON DELETE RESTRICT;

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS sfm_quality text;

COMMENT ON COLUMN public.render_jobs.sfm_version_id IS
  'SFM Stage C — Final Mix version bind for SFM_* executor kinds. NULL for MIX/TAKE/STUDIO_EXPORT.';

COMMENT ON COLUMN public.render_jobs.sfm_quality IS
  'SFM Stage C — product quality for SFM_QUALITY_ENCODE only (MP3_128|MP3_192|MP3_320|WAV).';

CREATE INDEX IF NOT EXISTS render_jobs_sfm_version_id_idx
  ON public.render_jobs (sfm_version_id)
  WHERE sfm_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS render_jobs_sfm_queued_idx
  ON public.render_jobs (status, queued_at)
  WHERE status = 'QUEUED'
    AND kind IN ('SFM_MIX_PREPARE', 'SFM_MASTER_BAKE', 'SFM_QUALITY_ENCODE');

-- ---------------------------------------------------------------------------
-- kind CHECK + source XOR (preserves MIX / TAKE / STUDIO_EXPORT semantics)
-- ---------------------------------------------------------------------------
ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_kind_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_kind_chk
  CHECK (
    kind IN (
      'MIX',
      'TAKE_EXPORT',
      'STUDIO_EXPORT',
      'SFM_MIX_PREPARE',
      'SFM_MASTER_BAKE',
      'SFM_QUALITY_ENCODE'
    )
  );

ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_source_xor_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_source_xor_chk
  CHECK (
    (
      kind = 'MIX'
      AND mix_session_id IS NOT NULL
      AND take_id IS NULL
      AND project_id IS NULL
      AND sfm_version_id IS NULL
      AND sfm_quality IS NULL
    )
    OR (
      kind = 'TAKE_EXPORT'
      AND take_id IS NOT NULL
      AND mix_session_id IS NULL
      AND project_id IS NULL
      AND sfm_version_id IS NULL
      AND sfm_quality IS NULL
    )
    OR (
      kind = 'STUDIO_EXPORT'
      AND project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
      AND sfm_version_id IS NULL
      AND sfm_quality IS NULL
    )
    OR (
      kind IN ('SFM_MIX_PREPARE', 'SFM_MASTER_BAKE')
      AND sfm_version_id IS NOT NULL
      AND project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
      AND sfm_quality IS NULL
    )
    OR (
      kind = 'SFM_QUALITY_ENCODE'
      AND sfm_version_id IS NOT NULL
      AND project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
      AND sfm_quality IS NOT NULL
      AND sfm_quality IN ('MP3_128', 'MP3_192', 'MP3_320', 'WAV')
    )
  );

-- Snapshot required only for STUDIO_EXPORT (unchanged); SFM uses version content_snapshot.
ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_studio_export_snapshot_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_studio_export_snapshot_chk
  CHECK (
    kind <> 'STUDIO_EXPORT'
    OR document_snapshot IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- Helper: map domain stage → executor job kind
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_executor_kind_for_stage(p_stage_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage_kind
    WHEN 'SFM_MIX' THEN 'SFM_MIX_PREPARE'
    WHEN 'SFM_MASTER' THEN 'SFM_MASTER_BAKE'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.sfm_executor_kind_for_stage(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_executor_kind_for_stage(text) TO service_role;

-- ---------------------------------------------------------------------------
-- sfm_start_stage — PENDING→RUNNING + enqueue executor job + bind job_id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sfm_start_stage(uuid, uuid, text);

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
  started_at timestamptz,
  job_id uuid
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
  v_job_kind text;
  v_job_id uuid;
  v_job_status text;
  v_idempotency text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_kind IS DISTINCT FROM 'SFM_MIX' AND p_kind IS DISTINCT FROM 'SFM_MASTER' THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  v_job_kind := public.sfm_executor_kind_for_stage(p_kind);
  IF v_job_kind IS NULL THEN
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

  -- RUNNING + bound job: idempotent only while job still active; terminal => recovery.
  -- Does NOT auto-retry, re-queue, create a new job, or mutate stage status here.
  IF v_stage.status = 'RUNNING' AND v_stage.job_id IS NOT NULL THEN
    SELECT j.status INTO v_job_status
    FROM public.render_jobs j
    WHERE j.id = v_stage.job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RECOVERY_REQUIRED';
    END IF;

    IF v_job_status IN ('QUEUED', 'RUNNING') THEN
      RETURN QUERY SELECT
        v_stage.id,
        v_stage.version_id,
        v_stage.kind,
        v_stage.status,
        v_stage.started_at,
        v_stage.job_id;
      RETURN;
    END IF;

    -- SUCCEEDED job while stage still RUNNING: complete via sfm_complete_stage.
    -- FAILED / TIMEOUT / CANCELLED / other terminal: controlled recovery required.
    RAISE EXCEPTION 'RECOVERY_REQUIRED';
  END IF;

  IF v_stage.status IS DISTINCT FROM 'PENDING'
     AND NOT (v_stage.status = 'RUNNING' AND v_stage.job_id IS NULL) THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION';
  END IF;

  IF v_stage.status = 'PENDING' THEN
    UPDATE public.studio_final_stages
    SET status = 'RUNNING',
        started_at = v_now,
        error_code = NULL,
        finished_at = NULL
    WHERE id = v_stage.id
    RETURNING * INTO v_stage;
  END IF;

  v_idempotency :=
    'sfm:' || p_version_id::text || ':' || v_job_kind || ':' || v_stage.id::text;

  -- Replay: existing QUEUED/RUNNING job for same idempotency
  SELECT j.id INTO v_job_id
  FROM public.render_jobs j
  WHERE j.owner_id = v_version.owner_id
    AND j.idempotency_key = v_idempotency
  LIMIT 1;

  IF v_job_id IS NULL THEN
    INSERT INTO public.render_jobs (
      owner_id,
      kind,
      status,
      project_id,
      sfm_version_id,
      sfm_quality,
      mix_session_id,
      take_id,
      requested_tier,
      idempotency_key,
      entitlement_snapshot,
      attempt,
      queued_at
    ) VALUES (
      v_version.owner_id,
      v_job_kind,
      'QUEUED',
      v_version.project_id,
      p_version_id,
      NULL,
      NULL,
      NULL,
      'WAV',
      v_idempotency,
      jsonb_build_object(
        'sfm',
        jsonb_build_object(
          'versionId', p_version_id,
          'stageKind', p_kind,
          'executorKind', v_job_kind
        )
      ),
      1,
      v_now
    )
    RETURNING id INTO v_job_id;
  END IF;

  UPDATE public.studio_final_stages
  SET job_id = v_job_id
  WHERE id = v_stage.id
  RETURNING * INTO v_stage;

  RETURN QUERY SELECT
    v_stage.id,
    v_stage.version_id,
    v_stage.kind,
    v_stage.status,
    v_stage.started_at,
    v_stage.job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_start_stage(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_start_stage(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.sfm_start_stage(uuid, uuid, text) IS
  'SFM Stage C — start domain stage + enqueue SFM_MIX_PREPARE / SFM_MASTER_BAKE. Terminal bound job => RECOVERY_REQUIRED (no auto-retry). Job SUCCEEDED ≠ stage complete.';

-- ---------------------------------------------------------------------------
-- sfm_complete_stage — requires SUCCEEDED job when completing SUCCEEDED
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
  v_job public.render_jobs%ROWTYPE;
  v_now timestamptz := now();
  v_project_id uuid;
  v_prev_current uuid;
  v_bind_job uuid;
  v_expected_job_kind text;
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

  v_expected_job_kind := public.sfm_executor_kind_for_stage(p_kind);

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

  -- F-01: stage↔job integrity — never substitute a different job for the bound one.
  IF p_job_id IS NOT NULL
     AND v_stage.job_id IS NOT NULL
     AND p_job_id IS DISTINCT FROM v_stage.job_id THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  v_bind_job := COALESCE(p_job_id, v_stage.job_id);

  IF p_status = 'SUCCEEDED' THEN
    -- SUCCEEDED requires a non-null stage.job_id; p_job_id may only confirm it.
    IF v_stage.job_id IS NULL THEN
      RAISE EXCEPTION 'INVALID';
    END IF;

    IF p_job_id IS NOT NULL AND p_job_id IS DISTINCT FROM v_stage.job_id THEN
      RAISE EXCEPTION 'CONFLICT';
    END IF;

    v_bind_job := v_stage.job_id;

    SELECT * INTO v_job
    FROM public.render_jobs
    WHERE id = v_bind_job
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    IF v_job.owner_id IS DISTINCT FROM v_version.owner_id THEN
      RAISE EXCEPTION 'NOT_OWNER';
    END IF;

    IF v_job.sfm_version_id IS DISTINCT FROM p_version_id THEN
      RAISE EXCEPTION 'NOT_ELIGIBLE';
    END IF;

    IF v_job.kind IS DISTINCT FROM v_expected_job_kind THEN
      RAISE EXCEPTION 'INVALID';
    END IF;

    IF v_job.status IS DISTINCT FROM 'SUCCEEDED' THEN
      -- Job SUCCEEDED alone is insufficient for stage; stage SUCCEEDED requires job SUCCEEDED first.
      RAISE EXCEPTION 'ILLEGAL_TRANSITION';
    END IF;
  ELSIF v_bind_job IS NOT NULL THEN
    -- FAILED path: optional bind; owner/version/kind must match stage contract (F-03).
    SELECT * INTO v_job
    FROM public.render_jobs
    WHERE id = v_bind_job
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    IF v_job.owner_id IS DISTINCT FROM v_version.owner_id THEN
      RAISE EXCEPTION 'NOT_OWNER';
    END IF;

    IF v_job.sfm_version_id IS DISTINCT FROM p_version_id THEN
      RAISE EXCEPTION 'NOT_ELIGIBLE';
    END IF;

    IF v_job.kind IS DISTINCT FROM v_expected_job_kind THEN
      RAISE EXCEPTION 'INVALID';
    END IF;
  END IF;

  UPDATE public.studio_final_stages
  SET status = p_status,
      finished_at = v_now,
      job_id = COALESCE(v_bind_job, job_id),
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
  'SFM Stage C — complete domain stage. SUCCEEDED requires stage.job_id; p_job_id may only match it. Kind match on SUCCEEDED and FAILED. Never auto-completes from job alone.';

-- ---------------------------------------------------------------------------
-- sfm_enqueue_quality_encode — lazy QUALITY job (no domain stage)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_enqueue_quality_encode(
  p_version_id uuid,
  p_owner_id uuid,
  p_quality text,
  p_idempotency_key text
)
RETURNS TABLE (
  job_id uuid,
  version_id uuid,
  kind text,
  status text,
  sfm_quality text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.studio_final_versions%ROWTYPE;
  v_job public.render_jobs%ROWTYPE;
  v_now timestamptz := now();
  v_tier public.render_job_tier;
  v_key text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_quality NOT IN ('MP3_128', 'MP3_192', 'MP3_320', 'WAV') THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  v_key := nullif(trim(p_idempotency_key), '');
  IF v_key IS NULL THEN
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

  IF v_version.status IS DISTINCT FROM 'EXPORTS_ELIGIBLE' THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  IF v_version.expires_at IS NOT NULL AND v_version.expires_at <= v_now THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  v_tier := CASE p_quality
    WHEN 'MP3_128' THEN 'BASIC_MP3'::public.render_job_tier
    WHEN 'MP3_192' THEN 'MP3_192'::public.render_job_tier
    WHEN 'MP3_320' THEN 'HQ_MP3'::public.render_job_tier
    ELSE 'WAV'::public.render_job_tier
  END;

  SELECT * INTO v_job
  FROM public.render_jobs
  WHERE owner_id = p_owner_id
    AND idempotency_key = v_key
  LIMIT 1;

  IF FOUND THEN
    IF v_job.kind IS DISTINCT FROM 'SFM_QUALITY_ENCODE'
       OR v_job.sfm_version_id IS DISTINCT FROM p_version_id
       OR v_job.sfm_quality IS DISTINCT FROM p_quality THEN
      RAISE EXCEPTION 'CONFLICT';
    END IF;
    RETURN QUERY SELECT
      v_job.id,
      v_job.sfm_version_id,
      v_job.kind,
      v_job.status::text,
      v_job.sfm_quality;
    RETURN;
  END IF;

  INSERT INTO public.render_jobs (
    owner_id,
    kind,
    status,
    project_id,
    sfm_version_id,
    sfm_quality,
    mix_session_id,
    take_id,
    requested_tier,
    idempotency_key,
    entitlement_snapshot,
    attempt,
    queued_at
  ) VALUES (
    p_owner_id,
    'SFM_QUALITY_ENCODE',
    'QUEUED',
    v_version.project_id,
    p_version_id,
    p_quality,
    NULL,
    NULL,
    v_tier,
    v_key,
    jsonb_build_object(
      'sfm',
      jsonb_build_object(
        'versionId', p_version_id,
        'executorKind', 'SFM_QUALITY_ENCODE',
        'quality', p_quality
      )
    ),
    1,
    v_now
  )
  RETURNING * INTO v_job;

  RETURN QUERY SELECT
    v_job.id,
    v_job.sfm_version_id,
    v_job.kind,
    v_job.status::text,
    v_job.sfm_quality;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_enqueue_quality_encode(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_enqueue_quality_encode(uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.sfm_enqueue_quality_encode(uuid, uuid, text, text) IS
  'SFM Stage C — enqueue SFM_QUALITY_ENCODE for EXPORTS_ELIGIBLE version. No encode execution.';

-- ---------------------------------------------------------------------------
-- claim_next_sfm_job — SFM-only atomic claim (≠ STUDIO_EXPORT poller)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_sfm_job(p_worker_ref text)
RETURNS SETOF public.render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_claim_at timestamptz := clock_timestamp();
  v_timeout_at timestamptz;
  v_ref text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim_next_sfm_job';
  END IF;

  v_ref := nullif(trim(p_worker_ref), '');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'worker_ref required';
  END IF;

  -- Mirror AUDIO_RENDER_JOB_TIMEOUT_SECONDS = 180.
  v_timeout_at := v_claim_at + make_interval(secs => 180);

  SELECT j.id
  INTO v_id
  FROM public.render_jobs j
  WHERE j.status = 'QUEUED'
    AND j.kind IN ('SFM_MIX_PREPARE', 'SFM_MASTER_BAKE', 'SFM_QUALITY_ENCODE')
    AND j.sfm_version_id IS NOT NULL
    AND j.project_id IS NOT NULL
    AND j.mix_session_id IS NULL
    AND j.take_id IS NULL
    AND j.attempt >= 1
    AND j.attempt <= 3
  ORDER BY j.queued_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE public.render_jobs rj
    SET
      status = 'RUNNING',
      started_at = v_claim_at,
      timeout_at = v_timeout_at,
      progress = 0,
      worker_ref = v_ref
    WHERE rj.id = v_id
      AND rj.status = 'QUEUED'
    RETURNING rj.*;
END;
$$;

COMMENT ON FUNCTION public.claim_next_sfm_job(text) IS
  'SFM Stage C — atomic claim-next for SFM_* kinds only. service_role. SKIP LOCKED + CAS. Does not claim MIX/TAKE/STUDIO_EXPORT. No auto-retry.';

REVOKE ALL ON FUNCTION public.claim_next_sfm_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_sfm_job(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_next_sfm_job(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sfm_job(text) TO service_role;
