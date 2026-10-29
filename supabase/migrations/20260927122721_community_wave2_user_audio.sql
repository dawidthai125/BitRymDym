-- Community Wave 2: allow beat_audio_assets for USER-owned beats (server/admin path)
-- Storage INSERT remains deny; mutations still ADMIN or service_role only.
-- Object key must match ownership prefix.

CREATE OR REPLACE FUNCTION public.prevent_beat_audio_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beat_ownership public.beat_ownership_type;
  beat_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
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

COMMENT ON FUNCTION public.prevent_beat_audio_privilege_escalation() IS
  'Wave 2: PLATFORM platform/ keys + USER user/{ownerId}/ keys; ADMIN/service_role writes only.';
