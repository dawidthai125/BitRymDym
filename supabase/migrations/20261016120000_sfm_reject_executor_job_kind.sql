-- SFM worker — atomic KIND_OUT reject for already-claimed SFM-shaped executor jobs.
-- OD-SFM-WORKER-KIND-REJECT: RUNNING + matching worker_ref → FAILED / KIND_OUT.
-- No bake · no artifact · no FAILED→QUEUED · no stage mutate · no orphan timeout recovery.
-- Sibling to claim_next_sfm_job (service_role only).
--
-- Shape gate (SFM executor jobs): sfm_version_id + project_id set, mix/take null.
-- Kind is NOT re-checked against the SFM allowlist here — poller already refused the
-- kind; CAS still refuses legacy MIX/TAKE/STUDIO rows that lack SFM claim shape.

CREATE OR REPLACE FUNCTION public.reject_sfm_executor_job_kind(
  p_job_id uuid,
  p_worker_ref text
)
RETURNS SETOF public.render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_finished_at timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may reject_sfm_executor_job_kind';
  END IF;

  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'job_id required';
  END IF;

  v_ref := nullif(trim(p_worker_ref), '');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'worker_ref required';
  END IF;

  -- Atomic CAS: only the claiming worker may terminalize a RUNNING SFM-shaped job.
  -- Empty SETOF = no match (wrong worker_ref, terminal status, non-SFM shape, missing id).
  -- Does not leak whether the row exists under another worker.
  RETURN QUERY
    UPDATE public.render_jobs rj
    SET
      status = 'FAILED',
      finished_at = v_finished_at,
      error_code = 'KIND_OUT',
      error_message = 'SFM worker rejected unsupported or out-of-contract job kind.'
    WHERE rj.id = p_job_id
      AND rj.status = 'RUNNING'
      AND rj.worker_ref IS NOT DISTINCT FROM v_ref
      AND rj.sfm_version_id IS NOT NULL
      AND rj.project_id IS NOT NULL
      AND rj.mix_session_id IS NULL
      AND rj.take_id IS NULL
    RETURNING rj.*;
END;
$$;

COMMENT ON FUNCTION public.reject_sfm_executor_job_kind(uuid, text) IS
  'SFM worker — OD-SFM-WORKER-KIND-REJECT. CAS RUNNING+worker_ref → FAILED/KIND_OUT for SFM-shaped jobs. service_role. No bake, no FAILED→QUEUED, no stage mutate, no orphan timeout recovery.';

REVOKE ALL ON FUNCTION public.reject_sfm_executor_job_kind(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_sfm_executor_job_kind(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reject_sfm_executor_job_kind(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_sfm_executor_job_kind(uuid, text) TO service_role;
