-- Recording Wave 1 — Take domain foundation
-- Design Freeze: docs/phases/PHASE_RECORDING_DESIGN_FREEZE.md
-- Audit: docs/audits/RECORDING_WAVE1_IMPLEMENTATION_AUDIT.md
-- Additive only. Does not modify beats / beat-audio / community / downloads.

CREATE TYPE public.take_status AS ENUM (
  'PENDING_UPLOAD',
  'READY',
  'FAILED',
  'EXPIRED',
  'DELETED'
);

CREATE TYPE public.take_recording_mode AS ENUM (
  'QUICK',
  'FULL'
);

CREATE TABLE public.takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  anonymous_token_hash text,
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  status public.take_status NOT NULL DEFAULT 'PENDING_UPLOAD',
  recording_mode public.take_recording_mode NOT NULL,
  duration_seconds integer,
  byte_size bigint,
  content_type text,
  storage_bucket text NOT NULL DEFAULT 'take-audio',
  object_key text NOT NULL,
  beat_duration_seconds_snapshot integer NOT NULL,
  recording_max_seconds_snapshot integer NOT NULL,
  beat_bpm_snapshot integer,
  audio_offset_ms integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takes_owner_xor_anon_chk CHECK (
    (owner_id IS NOT NULL AND anonymous_token_hash IS NULL)
    OR (owner_id IS NULL AND anonymous_token_hash IS NOT NULL)
  ),
  CONSTRAINT takes_bucket_chk CHECK (storage_bucket = 'take-audio'),
  CONSTRAINT takes_object_key_bin_chk CHECK (object_key LIKE '%.bin'),
  CONSTRAINT takes_expires_after_created_chk CHECK (expires_at > created_at),
  CONSTRAINT takes_duration_range_chk CHECK (
    duration_seconds IS NULL
    OR (duration_seconds >= 0 AND duration_seconds <= 180)
  ),
  CONSTRAINT takes_recording_max_snapshot_chk CHECK (
    recording_max_seconds_snapshot > 0
    AND recording_max_seconds_snapshot <= 180
  ),
  CONSTRAINT takes_beat_duration_snapshot_chk CHECK (
    beat_duration_seconds_snapshot > 0
  ),
  CONSTRAINT takes_ready_payload_chk CHECK (
    status <> 'READY'
    OR (
      duration_seconds IS NOT NULL
      AND byte_size IS NOT NULL
      AND byte_size > 0
      AND content_type IS NOT NULL
    )
  ),
  CONSTRAINT takes_deleted_consistency_chk CHECK (
    (status = 'DELETED' AND deleted_at IS NOT NULL)
    OR (status <> 'DELETED' AND deleted_at IS NULL)
  )
);

CREATE UNIQUE INDEX takes_bucket_object_key_uidx
  ON public.takes (storage_bucket, object_key);

CREATE INDEX takes_owner_id_idx
  ON public.takes (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX takes_anon_hash_idx
  ON public.takes (anonymous_token_hash)
  WHERE anonymous_token_hash IS NOT NULL;

CREATE INDEX takes_beat_id_idx
  ON public.takes (beat_id);

CREATE INDEX takes_status_idx
  ON public.takes (status);

CREATE INDEX takes_expires_at_idx
  ON public.takes (expires_at);

CREATE INDEX takes_owner_status_idx
  ON public.takes (owner_id, status)
  WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER takes_set_updated_at
BEFORE UPDATE ON public.takes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Client mutations DENY: only service_role may write (Wave 2+ server AuthZ path).
CREATE OR REPLACE FUNCTION public.prevent_take_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate takes';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.storage_bucket IS DISTINCT FROM 'take-audio' THEN
      RAISE EXCEPTION 'Invalid take storage bucket';
    END IF;
    IF NEW.object_key IS NULL OR NEW.object_key NOT LIKE '%.bin' THEN
      RAISE EXCEPTION 'Invalid take object key';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER takes_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.takes
FOR EACH ROW
EXECUTE FUNCTION public.prevent_take_privilege_escalation();

ALTER TABLE public.takes ENABLE ROW LEVEL SECURITY;

-- Owner isolation: SELECT own non-deleted only. No staff blanket access.
CREATE POLICY takes_select_own
  ON public.takes
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND deleted_at IS NULL
  );

-- No INSERT / UPDATE / DELETE policies for authenticated or anon → DENY.
-- service_role bypasses RLS.

GRANT SELECT ON public.takes TO authenticated;
GRANT USAGE ON TYPE public.take_status TO authenticated, anon;
GRANT USAGE ON TYPE public.take_recording_mode TO authenticated, anon;

-- Private Storage bucket (mirror beat-audio security model).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'take-audio',
  'take-audio',
  false,
  20971520,
  ARRAY[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/aac'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No permissive Storage policies for anon/authenticated on take-audio.
DO $$
BEGIN
  DROP POLICY IF EXISTS "take_audio_public_read" ON storage.objects;
  DROP POLICY IF EXISTS "take_audio_anon_select" ON storage.objects;
  DROP POLICY IF EXISTS "take_audio_auth_select" ON storage.objects;
  DROP POLICY IF EXISTS "take_audio_auth_insert" ON storage.objects;
  DROP POLICY IF EXISTS "take_audio_auth_update" ON storage.objects;
  DROP POLICY IF EXISTS "take_audio_auth_delete" ON storage.objects;
END $$;
