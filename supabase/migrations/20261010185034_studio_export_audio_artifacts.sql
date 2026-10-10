-- STUDIO_EXPORT Stage G — extend audio_artifacts for project-scoped Studio Final Mix.
-- Additive only. Preserves MIX and TAKE_EXPORT XOR legs.
-- Does NOT apply Contabo / worker / UI changes. Migration file only — apply via separate ops.

ALTER TABLE public.audio_artifacts
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES public.studio_projects (id) ON DELETE RESTRICT;

ALTER TABLE public.audio_artifacts
  DROP CONSTRAINT IF EXISTS audio_artifacts_source_xor_chk;

ALTER TABLE public.audio_artifacts
  ADD CONSTRAINT audio_artifacts_source_xor_chk
  CHECK (
    (
      mix_session_id IS NOT NULL
      AND take_id IS NULL
      AND project_id IS NULL
    )
    OR (
      take_id IS NOT NULL
      AND mix_session_id IS NULL
      AND project_id IS NULL
    )
    OR (
      project_id IS NOT NULL
      AND mix_session_id IS NULL
      AND take_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS audio_artifacts_project_id_idx
  ON public.audio_artifacts (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.audio_artifacts.project_id IS
  'STUDIO_EXPORT artifact source project. NULL for MIX and TAKE_EXPORT. Unique render_job_id still enforces one artifact per job.';

-- render_job_id UNIQUE (audio_artifacts_render_job_uidx) remains the idempotency anchor.
