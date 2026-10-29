-- P4 — Recording Identity, Eligibility & Download Foundation
-- Additive only. Does not alter ownership XOR / P3 claim / take-audio paths.

-- 1) Take title (identity)
ALTER TABLE public.takes
  ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.takes
  DROP CONSTRAINT IF EXISTS takes_title_len_chk;

ALTER TABLE public.takes
  ADD CONSTRAINT takes_title_len_chk
  CHECK (title IS NULL OR char_length(title) <= 120);

COMMENT ON COLUMN public.takes.title IS
  'P4 optional user title; empty → UI falls back to beat title.';

-- 2) RAW own-take download ledger (GOLD daily C) — never beat_download_events
CREATE TABLE IF NOT EXISTS public.take_download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  take_id uuid NOT NULL REFERENCES public.takes (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS take_download_events_user_created_idx
  ON public.take_download_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS take_download_events_take_idx
  ON public.take_download_events (take_id);

ALTER TABLE public.take_download_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS take_download_events_select_own ON public.take_download_events;
CREATE POLICY take_download_events_select_own
  ON public.take_download_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client INSERT/UPDATE/DELETE — service_role only via admin client
REVOKE ALL ON TABLE public.take_download_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.take_download_events TO authenticated;
GRANT ALL ON TABLE public.take_download_events TO service_role;

COMMENT ON TABLE public.take_download_events IS
  'P4 RAW own-take download ledger (GOLD daily C). Distinct from beat_download_events.';

-- 3) TAKE_EXPORT kind on render_jobs + MP3_192 tier
ALTER TYPE public.render_job_tier ADD VALUE IF NOT EXISTS 'MP3_192';

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'MIX';

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS take_id uuid REFERENCES public.takes (id) ON DELETE CASCADE;

ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_kind_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_kind_chk
  CHECK (kind IN ('MIX', 'TAKE_EXPORT'));

-- Allow mix_session_id NULL for TAKE_EXPORT
ALTER TABLE public.render_jobs
  ALTER COLUMN mix_session_id DROP NOT NULL;

ALTER TABLE public.render_jobs
  DROP CONSTRAINT IF EXISTS render_jobs_source_xor_chk;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_source_xor_chk
  CHECK (
    (kind = 'MIX' AND mix_session_id IS NOT NULL AND take_id IS NULL)
    OR (kind = 'TAKE_EXPORT' AND take_id IS NOT NULL AND mix_session_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS render_jobs_take_id_idx
  ON public.render_jobs (take_id)
  WHERE take_id IS NOT NULL;

-- audio_artifacts: allow take-export without mix_session
ALTER TABLE public.audio_artifacts
  ADD COLUMN IF NOT EXISTS take_id uuid REFERENCES public.takes (id) ON DELETE CASCADE;

ALTER TABLE public.audio_artifacts
  ALTER COLUMN mix_session_id DROP NOT NULL;

ALTER TABLE public.audio_artifacts
  DROP CONSTRAINT IF EXISTS audio_artifacts_source_xor_chk;

ALTER TABLE public.audio_artifacts
  ADD CONSTRAINT audio_artifacts_source_xor_chk
  CHECK (
    (mix_session_id IS NOT NULL AND take_id IS NULL)
    OR (take_id IS NOT NULL AND mix_session_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS audio_artifacts_take_id_idx
  ON public.audio_artifacts (take_id)
  WHERE take_id IS NOT NULL;
