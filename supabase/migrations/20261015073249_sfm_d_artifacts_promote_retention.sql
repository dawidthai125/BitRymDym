-- SFM Stage D — audio_artifacts F02b bind + atomic promote + F03b retention helpers.
-- GO-SFM-IMPL-D / local only.
-- Does NOT enable Contabo / SFM poller / download cutover / paid slots.
-- Does NOT mutate TAKE / E3 / legacy STUDIO_EXPORT semantics.
-- Upload alone never sets is_current; promote RPC required after QC.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.audio_artifacts
  ADD COLUMN IF NOT EXISTS sfm_version_id uuid
    REFERENCES public.studio_final_versions (id) ON DELETE RESTRICT;

ALTER TABLE public.audio_artifacts
  ADD COLUMN IF NOT EXISTS sfm_quality text;

ALTER TABLE public.audio_artifacts
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.audio_artifacts.sfm_version_id IS
  'SFM Stage D — Final Mix version bind. NULL for MIX/TAKE/legacy STUDIO_EXPORT.';
COMMENT ON COLUMN public.audio_artifacts.sfm_quality IS
  'SFM Stage D — product quality MP3_128|MP3_192|MP3_320|WAV. NULL for non-SFM.';
COMMENT ON COLUMN public.audio_artifacts.is_current IS
  'SFM Stage D — at most one current READY per (version, quality). Never set by upload alone.';

CREATE INDEX IF NOT EXISTS audio_artifacts_sfm_version_id_idx
  ON public.audio_artifacts (sfm_version_id)
  WHERE sfm_version_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Source XOR: preserve MIX / TAKE / legacy project WAV; add SFM leg
-- ---------------------------------------------------------------------------
ALTER TABLE public.audio_artifacts
  DROP CONSTRAINT IF EXISTS audio_artifacts_source_xor_chk;

ALTER TABLE public.audio_artifacts
  ADD CONSTRAINT audio_artifacts_source_xor_chk
  CHECK (
    (
      mix_session_id IS NOT NULL
      AND take_id IS NULL
      AND project_id IS NULL
      AND sfm_version_id IS NULL
      AND sfm_quality IS NULL
      AND is_current = false
    )
    OR (
      take_id IS NOT NULL
      AND mix_session_id IS NULL
      AND project_id IS NULL
      AND sfm_version_id IS NULL
      AND sfm_quality IS NULL
      AND is_current = false
    )
    OR (
      project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
      AND sfm_version_id IS NULL
      AND sfm_quality IS NULL
      AND is_current = false
    )
    OR (
      project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
      AND sfm_version_id IS NOT NULL
      AND sfm_quality IS NOT NULL
      AND sfm_quality IN ('MP3_128', 'MP3_192', 'MP3_320', 'WAV')
    )
  );

-- Race winner for current READY (Correction B / F02b)
CREATE UNIQUE INDEX IF NOT EXISTS audio_artifacts_sfm_current_ready_uidx
  ON public.audio_artifacts (sfm_version_id, sfm_quality)
  WHERE is_current = true
    AND status = 'READY'
    AND deleted_at IS NULL
    AND sfm_version_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- sfm_promote_current_artifact — atomic current switch after QC + READY insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_promote_current_artifact(p_artifact_id uuid)
RETURNS TABLE (
  artifact_id uuid,
  sfm_version_id uuid,
  sfm_quality text,
  is_current boolean,
  status text,
  demoted_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_art public.audio_artifacts%ROWTYPE;
  v_job public.render_jobs%ROWTYPE;
  v_version public.studio_final_versions%ROWTYPE;
  v_grant public.studio_final_version_grants%ROWTYPE;
  v_existing_current uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Lock order: artifact → job → version (serialize promote for version) → grant.
  SELECT * INTO v_art
  FROM public.audio_artifacts
  WHERE id = p_artifact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  -- Idempotent: already current READY for this artifact.
  IF v_art.is_current = true
     AND v_art.status = 'READY'
     AND v_art.deleted_at IS NULL THEN
    RETURN QUERY SELECT
      v_art.id,
      v_art.sfm_version_id,
      v_art.sfm_quality,
      v_art.is_current,
      v_art.status::text,
      0;
    RETURN;
  END IF;

  IF v_art.sfm_version_id IS NULL OR v_art.sfm_quality IS NULL THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  IF v_art.status IS DISTINCT FROM 'READY' OR v_art.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'QC_FAILED';
  END IF;

  IF v_art.byte_size IS NULL OR v_art.byte_size <= 0 OR v_art.checksum IS NULL THEN
    RAISE EXCEPTION 'QC_FAILED';
  END IF;

  SELECT * INTO v_job
  FROM public.render_jobs
  WHERE id = v_art.render_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_job.status IS DISTINCT FROM 'SUCCEEDED' THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION';
  END IF;

  IF v_job.kind IS DISTINCT FROM 'SFM_QUALITY_ENCODE' THEN
    RAISE EXCEPTION 'INVALID';
  END IF;

  IF v_job.owner_id IS DISTINCT FROM v_art.owner_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  IF v_job.sfm_version_id IS DISTINCT FROM v_art.sfm_version_id
     OR v_job.sfm_quality IS DISTINCT FROM v_art.sfm_quality THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  IF v_job.project_id IS DISTINCT FROM v_art.project_id THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  SELECT * INTO v_version
  FROM public.studio_final_versions
  WHERE id = v_art.sfm_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_version.owner_id IS DISTINCT FROM v_art.owner_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  IF v_version.project_id IS DISTINCT FROM v_art.project_id THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  IF v_version.status IS DISTINCT FROM 'EXPORTS_ELIGIBLE' THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  IF v_version.expires_at IS NOT NULL AND v_version.expires_at <= v_now THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  -- F-03: grant must still authorize this quality (strict snapshot; OD-SFM-ID-05).
  SELECT * INTO v_grant
  FROM public.studio_final_version_grants g
  WHERE g.user_id = v_version.owner_id
    AND g.version_id = v_art.sfm_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_GRANT';
  END IF;

  IF NOT (v_art.sfm_quality = ANY (v_grant.granted_qualities)) THEN
    RAISE EXCEPTION 'QUALITY_DENIED';
  END IF;

  -- FIRST_COMMIT_WINS: if another current READY exists, do NOT demote it.
  SELECT a.id INTO v_existing_current
  FROM public.audio_artifacts a
  WHERE a.sfm_version_id = v_art.sfm_version_id
    AND a.sfm_quality = v_art.sfm_quality
    AND a.is_current = true
    AND a.status = 'READY'
    AND a.deleted_at IS NULL
    AND a.id IS DISTINCT FROM v_art.id
  FOR UPDATE;

  IF v_existing_current IS NOT NULL THEN
    -- Loser stays READY non-current history; winner pointer unchanged.
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  BEGIN
    UPDATE public.audio_artifacts
    SET is_current = true
    WHERE id = v_art.id
      AND status = 'READY'
      AND deleted_at IS NULL
      AND is_current = false
    RETURNING * INTO v_art;
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent first-wins race (partial UNIQUE belt-and-suspenders).
      RAISE EXCEPTION 'CONFLICT';
  END;

  IF NOT FOUND OR v_art.is_current IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  RETURN QUERY SELECT
    v_art.id,
    v_art.sfm_version_id,
    v_art.sfm_quality,
    v_art.is_current,
    v_art.status::text,
    0;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_promote_current_artifact(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_promote_current_artifact(uuid)
  TO service_role;

COMMENT ON FUNCTION public.sfm_promote_current_artifact(uuid) IS
  'SFM Stage D — FIRST_COMMIT_WINS promote. Existing current READY is never demoted. Requires grant+quality snapshot. Partial UNIQUE backup. Upload alone never sets is_current.';

-- ---------------------------------------------------------------------------
-- sfm_expire_versions — F03b janitor helper (service/cron; do not run remotely here)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sfm_expire_versions()
RETURNS TABLE (
  expired_versions integer,
  cleared_current_final integer,
  demoted_artifacts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_expired integer := 0;
  v_cleared integer := 0;
  v_demoted integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  WITH expired AS (
    UPDATE public.studio_final_versions v
    SET status = 'EXPIRED'
    WHERE v.expires_at IS NOT NULL
      AND v.expires_at <= v_now
      AND v.status IS DISTINCT FROM 'EXPIRED'
    RETURNING v.id, v.project_id
  ),
  cleared AS (
    UPDATE public.studio_projects sp
    SET current_final_version_id = NULL
    WHERE sp.current_final_version_id IN (SELECT id FROM expired)
    RETURNING sp.id
  ),
  demoted AS (
    UPDATE public.audio_artifacts a
    SET is_current = false,
        status = 'EXPIRED'
    WHERE a.sfm_version_id IN (SELECT id FROM expired)
      AND a.deleted_at IS NULL
      AND a.status IS DISTINCT FROM 'DELETED'
    RETURNING a.id
  )
  SELECT
    (SELECT count(*)::integer FROM expired),
    (SELECT count(*)::integer FROM cleared),
    (SELECT count(*)::integer FROM demoted)
  INTO v_expired, v_cleared, v_demoted;

  RETURN QUERY SELECT v_expired, v_cleared, v_demoted;
END;
$$;

REVOKE ALL ON FUNCTION public.sfm_expire_versions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfm_expire_versions()
  TO service_role;

COMMENT ON FUNCTION public.sfm_expire_versions() IS
  'SFM Stage D / F03b — expire versions past MASTER+90d; clear current_final; demote SFM artifacts. Grants retained. Ignores TAKE/E3 (sfm_version_id filter).';

-- ---------------------------------------------------------------------------
-- F-03 — harden sfm_enqueue_quality_encode: require grant + granted_qualities
-- (replaces Stage C body; still EXPORTS_ELIGIBLE + owner; no snapshot expand)
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
  v_grant public.studio_final_version_grants%ROWTYPE;
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

  SELECT * INTO v_grant
  FROM public.studio_final_version_grants g
  WHERE g.user_id = p_owner_id
    AND g.version_id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_GRANT';
  END IF;

  IF NOT (p_quality = ANY (v_grant.granted_qualities)) THEN
    RAISE EXCEPTION 'QUALITY_DENIED';
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
  'SFM Stage D — enqueue SFM_QUALITY_ENCODE only with owner grant + quality ∈ granted_qualities (strict snapshot).';
