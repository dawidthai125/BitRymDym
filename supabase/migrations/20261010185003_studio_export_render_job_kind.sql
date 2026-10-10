-- STUDIO_EXPORT Stage A — render_jobs kind + project_id source XOR
-- Additive only. Does not alter RLS, MIX/TAKE_EXPORT enqueue paths,
-- audio_artifacts, workers, Contabo, or product UI.

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES public.studio_projects (id) ON DELETE RESTRICT;

ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_kind_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_kind_chk
  CHECK (kind IN ('MIX', 'TAKE_EXPORT', 'STUDIO_EXPORT'));

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
    )
    OR (
      kind = 'TAKE_EXPORT'
      AND take_id IS NOT NULL
      AND mix_session_id IS NULL
      AND project_id IS NULL
    )
    OR (
      kind = 'STUDIO_EXPORT'
      AND project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS render_jobs_project_id_idx
  ON public.render_jobs (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.render_jobs.project_id IS
  'STUDIO_EXPORT source project. NULL for MIX and TAKE_EXPORT. Stage A contract only — no worker dispatch yet.';
