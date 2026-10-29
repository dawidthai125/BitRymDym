-- Rights Safety P0-C final hardening.
-- Finalization already re-checks rights before swapping a PUBLISHED master.
-- Privileged direct UPDATE/INSERT/DELETE on beat_audio_assets could still leave a
-- PUBLISHED beat with an active READY MASTER whose hash has no legal basis.
-- This deferred constraint trigger re-validates at transaction commit when the
-- active READY MASTER set or its checksum may have changed. Finalize
-- (deactivate + activate in one txn) still works; direct privileged mutation
-- cannot commit an invalid published master. Post-publish hash block does not
-- unpublish, so mutations that leave the active master unchanged do not
-- re-open the rights gate for that existing hash.

CREATE OR REPLACE FUNCTION public.enforce_published_beat_active_master_rights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_beat_id uuid;
  v_status public.beat_status;
  v_ownership public.beat_ownership_type;
  v_count integer;
  v_checksum text;
  v_active_changed boolean := false;
BEGIN
  -- Cosmetic updates (filename, created_by nullify, etc.) do not re-open rights.
  IF TG_OP = 'UPDATE'
     AND NEW.checksum_sha256 IS NOT DISTINCT FROM OLD.checksum_sha256
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.purpose IS NOT DISTINCT FROM OLD.purpose
     AND NEW.beat_id IS NOT DISTINCT FROM OLD.beat_id THEN
    RETURN NEW;
  END IF;

  -- Only re-assert rights when this row event can change which READY MASTER is
  -- active or what checksum that master carries.
  IF TG_OP = 'DELETE' THEN
    v_active_changed :=
      OLD.purpose = 'MASTER'
      AND OLD.is_active
      AND OLD.status = 'READY';
  ELSIF TG_OP = 'INSERT' THEN
    v_active_changed :=
      NEW.purpose = 'MASTER'
      AND NEW.is_active
      AND NEW.status = 'READY';
  ELSE
    v_active_changed :=
      (OLD.purpose = 'MASTER' AND OLD.is_active AND OLD.status = 'READY')
      OR (NEW.purpose = 'MASTER' AND NEW.is_active AND NEW.status = 'READY');
  END IF;

  FOR v_beat_id IN
    SELECT DISTINCT x
    FROM unnest(
      CASE TG_OP
        WHEN 'DELETE' THEN ARRAY[OLD.beat_id]
        WHEN 'INSERT' THEN ARRAY[NEW.beat_id]
        ELSE ARRAY[OLD.beat_id, NEW.beat_id]
      END
    ) AS t(x)
    WHERE x IS NOT NULL
  LOOP
    SELECT status, ownership_type
    INTO v_status, v_ownership
    FROM public.beats
    WHERE id = v_beat_id
    FOR NO KEY UPDATE;

    IF NOT FOUND OR v_status IS DISTINCT FROM 'PUBLISHED' THEN
      CONTINUE;
    END IF;

    SELECT count(*)
    INTO v_count
    FROM public.beat_audio_assets
    WHERE beat_id = v_beat_id
      AND purpose = 'MASTER'
      AND is_active
      AND status = 'READY';

    IF v_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'RIGHTS_PUBLISHED_MASTER_INVALID' USING ERRCODE = 'P0001';
    END IF;

    -- Leaving the existing published master untouched (e.g. inserting a pending
    -- row, or mutating a non-active asset) must not re-fail on a post-publish
    -- hash block. Only assert when this event changed the active master path.
    IF NOT v_active_changed THEN
      CONTINUE;
    END IF;

    -- beat_id reassignment: only assert for the beat whose active master
    -- identity is actually represented by this NEW/OLD row after the change.
    IF TG_OP = 'UPDATE'
       AND OLD.beat_id IS DISTINCT FROM NEW.beat_id THEN
      IF v_beat_id IS NOT DISTINCT FROM OLD.beat_id
         AND NOT (OLD.purpose = 'MASTER' AND OLD.is_active AND OLD.status = 'READY') THEN
        CONTINUE;
      END IF;
      IF v_beat_id IS NOT DISTINCT FROM NEW.beat_id
         AND NOT (NEW.purpose = 'MASTER' AND NEW.is_active AND NEW.status = 'READY') THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT checksum_sha256
    INTO v_checksum
    FROM public.beat_audio_assets
    WHERE beat_id = v_beat_id
      AND purpose = 'MASTER'
      AND is_active
      AND status = 'READY';

    -- Lock order after the beat row: checksum (inside assert) then asset reads.
    PERFORM public.assert_beat_checksum_rights(
      v_beat_id,
      v_checksum,
      v_ownership,
      true
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_published_beat_active_master_rights() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_published_beat_active_master_rights() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_published_beat_active_master_rights() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_published_beat_active_master_rights() FROM service_role;

COMMENT ON FUNCTION public.enforce_published_beat_active_master_rights() IS
  'Deferred guard: a PUBLISHED beat must commit with exactly one active READY MASTER. When that active master set or checksum changes, assert_beat_checksum_rights must pass. Covers direct privileged mutation as well as finalize.';

DROP TRIGGER IF EXISTS beat_audio_assets_published_master_rights ON public.beat_audio_assets;
CREATE CONSTRAINT TRIGGER beat_audio_assets_published_master_rights
AFTER INSERT OR UPDATE OR DELETE ON public.beat_audio_assets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_published_beat_active_master_rights();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.beat_audio_assets'::regclass
      AND tgname = 'beat_audio_assets_published_master_rights'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'beat_audio_assets_published_master_rights trigger missing';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.enforce_published_beat_active_master_rights()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.enforce_published_beat_active_master_rights()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.enforce_published_beat_active_master_rights()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'enforce_published_beat_active_master_rights must not be client-executable';
  END IF;
END;
$$;
