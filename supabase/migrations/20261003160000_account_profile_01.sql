-- ACCOUNT/PROFILE-01
-- 1) Allow retained anonymized USER beats after Auth/profile delete (OTD-ACCOUNT-01 C)
-- 2) Public author display_name lookup for catalog (OTD-ACCOUNT-02)
-- 3) Audio trigger: allow retained USER+NULL owner for service_role/admin maintenance
--    and created_by-only nullification (delete-account orchestrator)
-- Does NOT change user_number / USER-ID-01.
-- Does NOT UNIQUE display_name.

-- USER beats may keep ownership_type=USER with owner_id NULL after anonymized retain.
ALTER TABLE public.beats
  DROP CONSTRAINT IF EXISTS beats_ownership_integrity_chk;

ALTER TABLE public.beats
  ADD CONSTRAINT beats_ownership_integrity_chk CHECK (
    (ownership_type = 'PLATFORM'::public.beat_ownership_type AND owner_id IS NULL)
    OR (ownership_type = 'USER'::public.beat_ownership_type)
  );

ALTER TABLE public.beats
  DROP CONSTRAINT IF EXISTS beats_owner_id_fkey;

ALTER TABLE public.beats
  ADD CONSTRAINT beats_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Retained public assets may keep object_key after creator profile is gone.
ALTER TABLE public.beat_audio_assets
  DROP CONSTRAINT IF EXISTS beat_audio_assets_created_by_fkey;

ALTER TABLE public.beat_audio_assets
  ADD CONSTRAINT beat_audio_assets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Audio privilege trigger: keep USER/ADMIN/service_role gates.
-- INSERT on USER still requires living owner_id.
-- UPDATE: created_by-only → NULL allowed for service_role/admin (delete orchestrator).
-- UPDATE on retained USER (owner_id NULL): service_role/admin may keep historical user/ keys.
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
  created_by_nullify_only boolean := false;
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

    -- Ordinary USER/authenticated cannot mutate assets (RLS + this gate).
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

    -- Account-delete safety: service_role/admin may null created_by with no other changes.
    IF TG_OP = 'UPDATE'
       AND NEW.created_by IS NULL
       AND OLD.created_by IS DISTINCT FROM NEW.created_by
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.beat_id IS NOT DISTINCT FROM OLD.beat_id
       AND NEW.purpose IS NOT DISTINCT FROM OLD.purpose
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.storage_bucket IS NOT DISTINCT FROM OLD.storage_bucket
       AND NEW.object_key IS NOT DISTINCT FROM OLD.object_key
       AND NEW.content_type IS NOT DISTINCT FROM OLD.content_type
       AND NEW.byte_size IS NOT DISTINCT FROM OLD.byte_size
       AND NEW.checksum_sha256 IS NOT DISTINCT FROM OLD.checksum_sha256
       AND NEW.original_filename IS NOT DISTINCT FROM OLD.original_filename
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.replaced_by_asset_id IS NOT DISTINCT FROM OLD.replaced_by_asset_id
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      created_by_nullify_only := true;
    END IF;

    IF beat_ownership = 'PLATFORM' THEN
      IF left(NEW.object_key, 9) IS DISTINCT FROM 'platform/' THEN
        RAISE EXCEPTION 'PLATFORM audio object key must start with platform/';
      END IF;
    ELSIF beat_ownership = 'USER' THEN
      IF created_by_nullify_only THEN
        -- Allowed: orchestrator clears creator before Auth delete / anonymize.
        NULL;
      ELSIF beat_owner IS NULL THEN
        -- Retained anonymized USER beat: no INSERT; UPDATE may keep historical user/ keys.
        IF TG_OP = 'INSERT' THEN
          RAISE EXCEPTION 'USER beat missing owner_id for audio asset';
        END IF;
        IF left(NEW.object_key, 5) IS DISTINCT FROM 'user/' THEN
          RAISE EXCEPTION 'USER audio object key must start with user/';
        END IF;
      ELSE
        IF left(NEW.object_key, 5) IS DISTINCT FROM 'user/' THEN
          RAISE EXCEPTION 'USER audio object key must start with user/';
        END IF;
        IF left(NEW.object_key, 5 + length(beat_owner::text) + 1)
           IS DISTINCT FROM ('user/' || beat_owner::text || '/') THEN
          RAISE EXCEPTION 'USER audio object key must be under user/{ownerId}/';
        END IF;
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
  'ADMIN/service_role writes; far01_live_mutator object_key-only UPDATE on living USER assets; ACCOUNT-01 allows created_by nullify + retained USER+NULL owner historical keys.';

-- Public-safe batch lookup of ksywka (display_name only — never email/role/user_number).
CREATE OR REPLACE FUNCTION public.public_author_display_names(p_ids uuid[])
RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.id = ANY (p_ids);
$$;

REVOKE ALL ON FUNCTION public.public_author_display_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_author_display_names(uuid[]) TO anon, authenticated;
