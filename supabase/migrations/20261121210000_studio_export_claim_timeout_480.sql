-- STUDIO_EXPORT now renders songs up to 6:00 (STUDIO_MAX_SONG_MS, Owner GO 2026-11-21).
-- A 2:30 song takes ~85 s on the Contabo worker, so the 180 s claim wall would time out long songs.
-- Raise the STUDIO_EXPORT claim timeout to 480 s. Same body otherwise. Idempotent.
CREATE OR REPLACE FUNCTION public.claim_next_studio_export_job(p_worker_ref text)
 RETURNS SETOF render_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- STUDIO_EXPORT wall clock (6:00 songs); other render kinds keep AUDIO_RENDER_JOB_TIMEOUT_SECONDS = 180.
  v_timeout_at := v_claim_at + make_interval(secs => 480);
  SELECT j.id INTO v_id
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
  SET status = 'RUNNING',
      started_at = v_claim_at,
      timeout_at = v_timeout_at,
      progress = 0,
      worker_ref = v_ref
  WHERE rj.id = v_id AND rj.status = 'QUEUED'
  RETURNING rj.*;
END;
$function$;
