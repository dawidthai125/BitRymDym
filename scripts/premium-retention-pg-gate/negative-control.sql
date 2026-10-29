-- Negative control (BRD_PG_GATE_NEGATIVE_CONTROL=1): deliberately re-opens known holes after the
-- migrations so the gate can prove it detects them. The run MUST fail.
GRANT UPDATE ON TABLE public.premium_works TO service_role;
ALTER ROLE premium_retention_worker BYPASSRLS;
ALTER TABLE public.audio_artifacts DISABLE TRIGGER audio_artifacts_prevent_privilege_escalation;

-- Concurrency mutant: drop the lease row lock (first FOR UPDATE; lock order is lease → work → artifact).
DO $$
DECLARE
  d text := pg_get_functiondef(
    'public.premium_retention_soft_delete_artifact_if_lease(uuid,uuid,uuid,bigint)'::regprocedure);
BEGIN
  IF position('FOR UPDATE' IN d) = 0 THEN
    RAISE EXCEPTION 'negative control: lease FOR UPDATE not found';
  END IF;
  EXECUTE regexp_replace(d, 'FOR UPDATE', '');
END $$;

CREATE OR REPLACE FUNCTION public.premium_retention_links(
  p_work_owner_id uuid,
  p_work_domain text,
  p_work_domain_ref uuid,
  p_artifact_owner_id uuid,
  p_artifact_take_id uuid,
  p_artifact_project_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_work_owner_id = p_artifact_owner_id
    AND (
      (p_work_domain = 'TAKE' AND p_work_domain_ref = p_artifact_take_id)
      OR (p_work_domain = 'STUDIO_PROJECT' AND p_work_domain_ref = p_artifact_project_id)
    );
$$;
