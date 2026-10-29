-- GO-IMPL-CONTABO-POLL — atomic claim-next for STUDIO_EXPORT poller V1
-- service_role only. Does NOT auto-drain MIX / TAKE_EXPORT / unknown kinds.
-- Does NOT enable Contabo, apply itself to production, or change enqueue.
-- Timeout seconds MUST match AUDIO_RENDER_JOB_TIMEOUT_SECONDS (180).

CREATE OR REPLACE FUNCTION public.claim_next_studio_export_job(p_worker_ref text)
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
    RAISE EXCEPTION 'Only service_role may claim_next_studio_export_job';
  END IF;

  v_ref := nullif(trim(p_worker_ref), '');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'worker_ref required';
  END IF;

  -- Mirror AUDIO_RENDER_JOB_TIMEOUT_SECONDS = 180 (app constant).
  v_timeout_at := v_claim_at + make_interval(secs => 180);

  SELECT j.id
  INTO v_id
  FROM public.render_jobs j
  WHERE j.status = 'QUEUED'
    AND j.kind = 'STUDIO_EXPORT'
    AND j.requested_tier = 'WAV'
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

COMMENT ON FUNCTION public.claim_next_studio_export_job(text) IS
  'V1 Contabo poller: atomic claim-next for STUDIO_EXPORT WAV QUEUED jobs only. service_role. SKIP LOCKED + CAS. No auto-retry.';

REVOKE ALL ON FUNCTION public.claim_next_studio_export_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_studio_export_job(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_next_studio_export_job(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_studio_export_job(text) TO service_role;
