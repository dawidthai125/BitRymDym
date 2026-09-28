-- E3.1 — Full Audio foundation
-- SSOT: docs/architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md
-- Plan: docs/architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md (wave E3.1)
-- Additive only. Does not modify takes / D02 / beat-audio / grants / community.
-- STEMS deferred: no kind column in E3 v1. Premium = overlay table, not role / account_level.

CREATE TYPE public.mix_session_status AS ENUM (
  'DRAFT',
  'READY_TO_RENDER',
  'SOURCE_UNAVAILABLE'
);

CREATE TYPE public.render_job_status AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'TIMEOUT'
);

CREATE TYPE public.render_job_tier AS ENUM (
  'BASIC_MP3',
  'HQ_MP3',
  'WAV'
);

CREATE TYPE public.audio_artifact_status AS ENUM (
  'READY',
  'FAILED',
  'EXPIRED',
  'DELETED'
);

-- ---------------------------------------------------------------------------
-- premium_entitlements (OAD-01)
-- ---------------------------------------------------------------------------
CREATE TABLE public.premium_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_entitlements_source_nonempty_chk CHECK (
    char_length(trim(source)) > 0
  )
);

CREATE INDEX premium_entitlements_user_id_idx
  ON public.premium_entitlements (user_id);

CREATE UNIQUE INDEX premium_entitlements_one_active_per_user_uidx
  ON public.premium_entitlements (user_id)
  WHERE active;

CREATE TRIGGER premium_entitlements_set_updated_at
BEFORE UPDATE ON public.premium_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_premium_entitlement_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate premium_entitlements';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER premium_entitlements_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.premium_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_entitlement_privilege_escalation();

ALTER TABLE public.premium_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY premium_entitlements_select_own
  ON public.premium_entitlements
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.premium_entitlements TO authenticated;

-- ---------------------------------------------------------------------------
-- mix_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE public.mix_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  source_take_id uuid NOT NULL REFERENCES public.takes (id) ON DELETE RESTRICT,
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  params_version integer NOT NULL DEFAULT 1,
  preview_engine_id text,
  status public.mix_session_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mix_sessions_params_version_chk CHECK (params_version > 0)
);

CREATE INDEX mix_sessions_owner_updated_idx
  ON public.mix_sessions (owner_id, updated_at DESC);

CREATE INDEX mix_sessions_source_take_id_idx
  ON public.mix_sessions (source_take_id);

CREATE INDEX mix_sessions_beat_id_idx
  ON public.mix_sessions (beat_id);

CREATE TRIGGER mix_sessions_set_updated_at
BEFORE UPDATE ON public.mix_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_mix_session_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate mix_sessions';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER mix_sessions_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.mix_sessions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_mix_session_privilege_escalation();

ALTER TABLE public.mix_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY mix_sessions_select_own
  ON public.mix_sessions
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

GRANT SELECT ON public.mix_sessions TO authenticated;
GRANT USAGE ON TYPE public.mix_session_status TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- render_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  mix_session_id uuid NOT NULL REFERENCES public.mix_sessions (id) ON DELETE RESTRICT,
  requested_tier public.render_job_tier NOT NULL,
  idempotency_key text NOT NULL,
  status public.render_job_status NOT NULL DEFAULT 'QUEUED',
  progress integer,
  attempt integer NOT NULL DEFAULT 1,
  entitlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  timeout_at timestamptz,
  worker_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT render_jobs_attempt_chk CHECK (attempt >= 1 AND attempt <= 3),
  CONSTRAINT render_jobs_progress_chk CHECK (
    progress IS NULL OR (progress >= 0 AND progress <= 100)
  ),
  CONSTRAINT render_jobs_idempotency_nonempty_chk CHECK (
    char_length(trim(idempotency_key)) > 0
  )
);

CREATE UNIQUE INDEX render_jobs_owner_idempotency_uidx
  ON public.render_jobs (owner_id, idempotency_key);

CREATE INDEX render_jobs_owner_created_idx
  ON public.render_jobs (owner_id, created_at DESC);

CREATE INDEX render_jobs_status_queued_idx
  ON public.render_jobs (status, queued_at);

CREATE INDEX render_jobs_mix_session_id_idx
  ON public.render_jobs (mix_session_id);

CREATE TRIGGER render_jobs_set_updated_at
BEFORE UPDATE ON public.render_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_render_job_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate render_jobs';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER render_jobs_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.render_jobs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_render_job_privilege_escalation();

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY render_jobs_select_own
  ON public.render_jobs
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

GRANT SELECT ON public.render_jobs TO authenticated;
GRANT USAGE ON TYPE public.render_job_status TO authenticated, anon;
GRANT USAGE ON TYPE public.render_job_tier TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- audio_artifacts + private bucket audio-artifacts (OAD-07)
-- ---------------------------------------------------------------------------
CREATE TABLE public.audio_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  mix_session_id uuid NOT NULL REFERENCES public.mix_sessions (id) ON DELETE RESTRICT,
  render_job_id uuid NOT NULL REFERENCES public.render_jobs (id) ON DELETE RESTRICT,
  format text NOT NULL,
  quality_tier public.render_job_tier NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'audio-artifacts',
  object_key text NOT NULL,
  byte_size bigint,
  duration_ms integer,
  checksum text,
  sample_rate integer,
  bitrate_kbps integer,
  status public.audio_artifact_status NOT NULL DEFAULT 'FAILED',
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audio_artifacts_bucket_chk CHECK (storage_bucket = 'audio-artifacts'),
  CONSTRAINT audio_artifacts_object_key_ext_chk CHECK (
    object_key LIKE '%.mp3' OR object_key LIKE '%.wav'
  ),
  CONSTRAINT audio_artifacts_format_nonempty_chk CHECK (
    char_length(trim(format)) > 0
  ),
  CONSTRAINT audio_artifacts_ready_payload_chk CHECK (
    status <> 'READY'
    OR (
      byte_size IS NOT NULL
      AND byte_size > 0
      AND expires_at IS NOT NULL
    )
  ),
  CONSTRAINT audio_artifacts_deleted_consistency_chk CHECK (
    (status = 'DELETED' AND deleted_at IS NOT NULL)
    OR (status <> 'DELETED' AND deleted_at IS NULL)
  )
);

CREATE UNIQUE INDEX audio_artifacts_bucket_object_key_uidx
  ON public.audio_artifacts (storage_bucket, object_key);

CREATE UNIQUE INDEX audio_artifacts_render_job_uidx
  ON public.audio_artifacts (render_job_id);

CREATE INDEX audio_artifacts_owner_status_idx
  ON public.audio_artifacts (owner_id, status);

CREATE INDEX audio_artifacts_expires_at_idx
  ON public.audio_artifacts (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TRIGGER audio_artifacts_set_updated_at
BEFORE UPDATE ON public.audio_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_audio_artifact_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate audio_artifacts';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.storage_bucket IS DISTINCT FROM 'audio-artifacts' THEN
      RAISE EXCEPTION 'Invalid audio artifact storage bucket';
    END IF;
    IF NEW.object_key IS NULL
       OR (
         NEW.object_key NOT LIKE '%.mp3'
         AND NEW.object_key NOT LIKE '%.wav'
       ) THEN
      RAISE EXCEPTION 'Invalid audio artifact object key';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audio_artifacts_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.audio_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audio_artifact_privilege_escalation();

ALTER TABLE public.audio_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY audio_artifacts_select_own
  ON public.audio_artifacts
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND deleted_at IS NULL
  );

GRANT SELECT ON public.audio_artifacts TO authenticated;
GRANT USAGE ON TYPE public.audio_artifact_status TO authenticated, anon;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-artifacts',
  'audio-artifacts',
  false,
  52428800,
  ARRAY[
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No permissive Storage policies for anon/authenticated on audio-artifacts.
DO $$
BEGIN
  DROP POLICY IF EXISTS "audio_artifacts_public_read" ON storage.objects;
  DROP POLICY IF EXISTS "audio_artifacts_anon_select" ON storage.objects;
  DROP POLICY IF EXISTS "audio_artifacts_auth_select" ON storage.objects;
  DROP POLICY IF EXISTS "audio_artifacts_auth_insert" ON storage.objects;
  DROP POLICY IF EXISTS "audio_artifacts_auth_update" ON storage.objects;
  DROP POLICY IF EXISTS "audio_artifacts_auth_delete" ON storage.objects;
END $$;

REVOKE ALL ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_render_job_privilege_escalation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM PUBLIC;
