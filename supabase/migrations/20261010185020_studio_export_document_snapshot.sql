-- STUDIO_EXPORT Stage B — immutable document_snapshot on render_jobs
-- Additive. Nullable for legacy MIX / TAKE_EXPORT. No RLS changes.
-- Snapshot retention follows the job row (same lifecycle as entitlement_snapshot /
-- artifact linkage). Do not DROP this column while QUEUED/RUNNING/retry may need it.
-- NOT applied to any database by the Stage B coding step.

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS document_snapshot jsonb;

COMMENT ON COLUMN public.render_jobs.document_snapshot IS
  'STUDIO_EXPORT immutable Studio document snapshot (Stage B). NULL for MIX/TAKE_EXPORT. Not an AuthZ substitute — claim must re-validate TAKE/BEAT sources.';

-- STUDIO_EXPORT rows must carry a snapshot; legacy kinds remain unconstrained.
ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_studio_export_snapshot_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_studio_export_snapshot_chk
  CHECK (
    kind <> 'STUDIO_EXPORT'
    OR document_snapshot IS NOT NULL
  );
