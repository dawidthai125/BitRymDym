-- Phase 1.5 — Private Audio Storage + Controlled Access Gate
-- Design Freeze: docs/phases/PHASE_1_5_DESIGN_FREEZE.md
-- Additive only. No changes to profiles / beats metadata columns.
-- OD-12 remains OPEN (interim MIME validation in application layer).

CREATE TYPE public.beat_audio_purpose AS ENUM (
  'MASTER',
  'PLAYBACK',
  'DOWNLOAD'
);

CREATE TYPE public.beat_audio_asset_status AS ENUM (
  'PENDING_UPLOAD',
  'READY',
  'FAILED',
  'ARCHIVED',
  'REPLACED'
);

CREATE TABLE public.beat_audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  purpose public.beat_audio_purpose NOT NULL,
  status public.beat_audio_asset_status NOT NULL DEFAULT 'PENDING_UPLOAD',
  storage_bucket text NOT NULL DEFAULT 'beat-audio',
  object_key text NOT NULL,
  content_type text,
  byte_size bigint,
  checksum_sha256 text,
  original_filename text,
  is_active boolean NOT NULL DEFAULT false,
  replaced_by_asset_id uuid REFERENCES public.beat_audio_assets (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beat_audio_assets_bucket_chk CHECK (storage_bucket = 'beat-audio'),
  CONSTRAINT beat_audio_assets_object_key_bin_chk CHECK (object_key LIKE '%.bin'),
  CONSTRAINT beat_audio_assets_ready_payload_chk CHECK (
    status <> 'READY'
    OR (
      content_type IS NOT NULL
      AND byte_size IS NOT NULL
      AND byte_size > 0
    )
  )
);

CREATE UNIQUE INDEX beat_audio_assets_bucket_object_key_uidx
  ON public.beat_audio_assets (storage_bucket, object_key);

CREATE UNIQUE INDEX beat_audio_assets_one_active_per_purpose_uidx
  ON public.beat_audio_assets (beat_id, purpose)
  WHERE is_active;

CREATE INDEX beat_audio_assets_beat_id_idx
  ON public.beat_audio_assets (beat_id);

CREATE INDEX beat_audio_assets_status_idx
  ON public.beat_audio_assets (status);

CREATE INDEX beat_audio_assets_beat_purpose_active_idx
  ON public.beat_audio_assets (beat_id, purpose, is_active);

CREATE TRIGGER beat_audio_assets_set_updated_at
BEFORE UPDATE ON public.beat_audio_assets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Privilege guard: only ADMIN (or service_role) may write assets;
-- product path is PLATFORM beats only.
CREATE OR REPLACE FUNCTION public.prevent_beat_audio_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beat_ownership public.beat_ownership_type;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only ADMIN may mutate beat audio assets';
    END IF;

    SELECT ownership_type INTO beat_ownership
    FROM public.beats
    WHERE id = NEW.beat_id;

    IF beat_ownership IS NULL THEN
      RAISE EXCEPTION 'Beat not found for audio asset';
    END IF;

    -- Phase 1.5 product path: PLATFORM only (schema may hold USER FK later).
    IF beat_ownership IS DISTINCT FROM 'PLATFORM' THEN
      RAISE EXCEPTION 'Phase 1.5 allows audio only for PLATFORM beats';
    END IF;

    IF NEW.storage_bucket IS DISTINCT FROM 'beat-audio' THEN
      RAISE EXCEPTION 'Invalid storage bucket';
    END IF;

    IF NEW.object_key IS NULL OR right(NEW.object_key, 4) IS DISTINCT FROM '.bin' THEN
      RAISE EXCEPTION 'Object key must end with .bin';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only ADMIN may delete beat audio assets';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER beat_audio_assets_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.beat_audio_assets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_beat_audio_privilege_escalation();

ALTER TABLE public.beat_audio_assets ENABLE ROW LEVEL SECURITY;

-- Catalog visibility: published beats' asset metadata (no broad storage access).
-- object_key may be present in row; Access Gate must not rely on clients reading it.
CREATE POLICY beat_audio_assets_select_published
  ON public.beat_audio_assets
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.beats b
      WHERE b.id = beat_id
        AND b.status = 'PUBLISHED'
    )
  );

CREATE POLICY beat_audio_assets_select_staff
  ON public.beat_audio_assets
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY beat_audio_assets_insert_admin
  ON public.beat_audio_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY beat_audio_assets_update_admin
  ON public.beat_audio_assets
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY beat_audio_assets_delete_admin
  ON public.beat_audio_assets
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.beat_audio_assets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.beat_audio_assets TO authenticated;
GRANT USAGE ON TYPE public.beat_audio_purpose TO anon, authenticated;
GRANT USAGE ON TYPE public.beat_audio_asset_status TO anon, authenticated;

-- Private Storage bucket (no public access).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'beat-audio',
  'beat-audio',
  false,
  52428800,
  ARRAY[
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/mp4',
    'audio/aac'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No permissive Storage policies for anon/authenticated on beat-audio.
-- Default deny + service_role bypass for server-mediated upload/signed URL creation.
-- Explicit revoke of accidental broad policies is not required when none exist.

DO $$
BEGIN
  -- Ensure no public read policy was left from prior experiments (idempotent drop).
  DROP POLICY IF EXISTS "beat_audio_public_read" ON storage.objects;
  DROP POLICY IF EXISTS "beat_audio_anon_select" ON storage.objects;
  DROP POLICY IF EXISTS "beat_audio_auth_select" ON storage.objects;
  DROP POLICY IF EXISTS "beat_audio_auth_insert" ON storage.objects;
END $$;
