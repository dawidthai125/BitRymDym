-- FAR-01 LIVE mutator role (GC-LIVE-CRED-01).
-- Architect GO: LIVE MUTATOR CREDENTIAL PROVISIONING only.
-- Not Canary / Backfill / Fleet / Retirement.
-- Service-role is NOT the LIVE credential. NOBYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'far01_live_mutator') THEN
    CREATE ROLE far01_live_mutator
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT far01_live_mutator TO authenticator;

GRANT USAGE ON SCHEMA public TO far01_live_mutator;
GRANT USAGE ON SCHEMA storage TO far01_live_mutator;

GRANT USAGE ON TYPE public.beat_status TO far01_live_mutator;
GRANT USAGE ON TYPE public.beat_ownership_type TO far01_live_mutator;
GRANT USAGE ON TYPE public.beat_audio_purpose TO far01_live_mutator;
GRANT USAGE ON TYPE public.beat_audio_asset_status TO far01_live_mutator;

-- DB: SELECT for re-read/verify; UPDATE object_key only (no INSERT/DELETE).
GRANT SELECT ON TABLE public.beat_audio_assets TO far01_live_mutator;
GRANT UPDATE (object_key) ON TABLE public.beat_audio_assets TO far01_live_mutator;

REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.beat_audio_assets FROM far01_live_mutator;
REVOKE ALL ON TABLE public.beats FROM far01_live_mutator;
GRANT SELECT ON TABLE public.beats TO far01_live_mutator; -- trigger/identity join safety; no write

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.beats FROM far01_live_mutator;

-- Storage: HEAD/list (SELECT) + COPY create (INSERT). No UPDATE/DELETE (no overwrite/delete).
GRANT SELECT ON TABLE storage.buckets TO far01_live_mutator;
GRANT SELECT, INSERT ON TABLE storage.objects TO far01_live_mutator;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE storage.objects FROM far01_live_mutator;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.buckets FROM far01_live_mutator;

-- RLS: beat_audio_assets
DROP POLICY IF EXISTS far01_live_mutator_select_beat_audio_assets ON public.beat_audio_assets;
CREATE POLICY far01_live_mutator_select_beat_audio_assets
  ON public.beat_audio_assets
  FOR SELECT
  TO far01_live_mutator
  USING (storage_bucket = 'beat-audio');

DROP POLICY IF EXISTS far01_live_mutator_update_object_key ON public.beat_audio_assets;
CREATE POLICY far01_live_mutator_update_object_key
  ON public.beat_audio_assets
  FOR UPDATE
  TO far01_live_mutator
  USING (
    storage_bucket = 'beat-audio'
    AND id IS DISTINCT FROM '000d406d-265e-4e49-bd3f-a542d5dd0b41'::uuid
  )
  WITH CHECK (
    storage_bucket = 'beat-audio'
    AND id IS DISTINCT FROM '000d406d-265e-4e49-bd3f-a542d5dd0b41'::uuid
  );

-- RLS: beats SELECT (read-only identity join)
DROP POLICY IF EXISTS far01_live_mutator_select_beats ON public.beats;
CREATE POLICY far01_live_mutator_select_beats
  ON public.beats
  FOR SELECT
  TO far01_live_mutator
  USING (true);

-- RLS: storage.objects — SELECT + INSERT for canonical USER MASTER destinations only
DROP POLICY IF EXISTS far01_live_mutator_select_beat_audio_objects ON storage.objects;
CREATE POLICY far01_live_mutator_select_beat_audio_objects
  ON storage.objects
  FOR SELECT
  TO far01_live_mutator
  USING (bucket_id = 'beat-audio');

DROP POLICY IF EXISTS far01_live_mutator_insert_canonical_master ON storage.objects;
CREATE POLICY far01_live_mutator_insert_canonical_master
  ON storage.objects
  FOR INSERT
  TO far01_live_mutator
  WITH CHECK (
    bucket_id = 'beat-audio'
    AND name ~* '^user/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/master\.bin$'
  );

-- Privilege trigger: allow far01_live_mutator ONLY for object_key-only UPDATE (not admin/service-role).
CREATE OR REPLACE FUNCTION public.prevent_beat_audio_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beat_ownership public.beat_ownership_type;
  beat_owner uuid;
  is_live_mutator boolean := (auth.role() = 'far01_live_mutator');
BEGIN
  IF TG_OP = 'UPDATE' AND is_live_mutator THEN
    IF OLD.id = '000d406d-265e-4e49-bd3f-a542d5dd0b41'::uuid THEN
      RAISE EXCEPTION 'LOCKED QUARANTINE: far01_live_mutator cannot mutate this asset';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.beat_id IS DISTINCT FROM OLD.beat_id
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.content_type IS DISTINCT FROM OLD.content_type
       OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.replaced_by_asset_id IS DISTINCT FROM OLD.replaced_by_asset_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'far01_live_mutator may only UPDATE object_key';
    END IF;

    IF NEW.object_key IS NOT DISTINCT FROM OLD.object_key THEN
      RAISE EXCEPTION 'far01_live_mutator UPDATE requires object_key change';
    END IF;

    SELECT ownership_type, owner_id INTO beat_ownership, beat_owner
    FROM public.beats
    WHERE id = NEW.beat_id;

    IF beat_ownership IS DISTINCT FROM 'USER' THEN
      RAISE EXCEPTION 'far01_live_mutator may only UPDATE USER beat audio assets';
    END IF;
    IF beat_owner IS NULL THEN
      RAISE EXCEPTION 'USER beat missing owner_id for audio asset';
    END IF;
    IF NEW.storage_bucket IS DISTINCT FROM 'beat-audio' THEN
      RAISE EXCEPTION 'Invalid storage bucket';
    END IF;
    IF NEW.object_key IS NULL OR right(NEW.object_key, 4) IS DISTINCT FROM '.bin' THEN
      RAISE EXCEPTION 'Object key must end with .bin';
    END IF;
    IF position('..' in NEW.object_key) > 0 OR position('//' in NEW.object_key) > 0 THEN
      RAISE EXCEPTION 'Object key must not contain path traversal';
    END IF;
    IF left(NEW.object_key, 5) IS DISTINCT FROM 'user/' THEN
      RAISE EXCEPTION 'USER audio object key must start with user/';
    END IF;
    IF left(NEW.object_key, 5 + length(beat_owner::text) + 1)
       IS DISTINCT FROM ('user/' || beat_owner::text || '/') THEN
      RAISE EXCEPTION 'USER audio object key must be under user/{ownerId}/';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF is_live_mutator THEN
      RAISE EXCEPTION 'far01_live_mutator cannot INSERT beat audio assets';
    END IF;

    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only ADMIN may mutate beat audio assets';
    END IF;

    SELECT ownership_type, owner_id INTO beat_ownership, beat_owner
    FROM public.beats
    WHERE id = NEW.beat_id;

    IF beat_ownership IS NULL THEN
      RAISE EXCEPTION 'Beat not found for audio asset';
    END IF;

    IF NEW.storage_bucket IS DISTINCT FROM 'beat-audio' THEN
      RAISE EXCEPTION 'Invalid storage bucket';
    END IF;

    IF NEW.object_key IS NULL OR right(NEW.object_key, 4) IS DISTINCT FROM '.bin' THEN
      RAISE EXCEPTION 'Object key must end with .bin';
    END IF;

    IF position('..' in NEW.object_key) > 0 OR position('//' in NEW.object_key) > 0 THEN
      RAISE EXCEPTION 'Object key must not contain path traversal';
    END IF;

    IF beat_ownership = 'PLATFORM' THEN
      IF left(NEW.object_key, 9) IS DISTINCT FROM 'platform/' THEN
        RAISE EXCEPTION 'PLATFORM audio object key must start with platform/';
      END IF;
    ELSIF beat_ownership = 'USER' THEN
      IF beat_owner IS NULL THEN
        RAISE EXCEPTION 'USER beat missing owner_id for audio asset';
      END IF;
      IF left(NEW.object_key, 5) IS DISTINCT FROM 'user/' THEN
        RAISE EXCEPTION 'USER audio object key must start with user/';
      END IF;
      IF left(NEW.object_key, 5 + length(beat_owner::text) + 1)
         IS DISTINCT FROM ('user/' || beat_owner::text || '/') THEN
        RAISE EXCEPTION 'USER audio object key must be under user/{ownerId}/';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported beat ownership for audio assets';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF is_live_mutator THEN
      RAISE EXCEPTION 'far01_live_mutator cannot DELETE beat audio assets';
    END IF;
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only ADMIN may delete beat audio assets';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_beat_audio_privilege_escalation() IS
  'ADMIN/service_role writes; far01_live_mutator object_key-only UPDATE on USER assets (FAR-01 LIVE).';

COMMENT ON ROLE far01_live_mutator IS
  'FAR-01 LIVE mutator: SELECT + object_key UPDATE on beat_audio_assets; Storage SELECT+INSERT beat-audio canonical MASTER only. Not R1. Not service_role.';
