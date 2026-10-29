-- Stage 0 — Studio track role (wokal główny, adlib, dogrywka/podbicie, chórek,
-- bit, instrument, inne). One column + CHECK; studio_tracks keeps its existing
-- RLS policies (owner-scoped via project), so no new policy is needed.
-- Writes go through a CAS RPC (service_role only), same as track controls.
-- NOT applied to production by this change — review and apply manually.

ALTER TABLE public.studio_tracks
  ADD COLUMN IF NOT EXISTS track_role text;

-- Backfill from track_type (deterministic, idempotent).
UPDATE public.studio_tracks
SET track_role = CASE track_type
  WHEN 'VOCAL' THEN 'lead_vocal'
  WHEN 'BEAT' THEN 'beat'
  WHEN 'INSTRUMENT' THEN 'instrument'
  WHEN 'GUITAR' THEN 'instrument'
  ELSE 'other'
END
WHERE track_role IS NULL;

-- Default role for new tracks / recordings: derived from track_type when the
-- inserting RPC does not pass one (all existing insert RPCs).
CREATE OR REPLACE FUNCTION public.studio_tracks_default_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.track_role IS NULL THEN
    NEW.track_role := CASE NEW.track_type
      WHEN 'VOCAL' THEN 'lead_vocal'
      WHEN 'BEAT' THEN 'beat'
      WHEN 'INSTRUMENT' THEN 'instrument'
      WHEN 'GUITAR' THEN 'instrument'
      ELSE 'other'
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_tracks_default_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_tracks_default_role() FROM anon, authenticated;

DROP TRIGGER IF EXISTS studio_tracks_default_role ON public.studio_tracks;
CREATE TRIGGER studio_tracks_default_role
BEFORE INSERT ON public.studio_tracks
FOR EACH ROW EXECUTE FUNCTION public.studio_tracks_default_role();

ALTER TABLE public.studio_tracks
  ALTER COLUMN track_role SET NOT NULL;

ALTER TABLE public.studio_tracks
  DROP CONSTRAINT IF EXISTS studio_tracks_role_chk;
ALTER TABLE public.studio_tracks
  ADD CONSTRAINT studio_tracks_role_chk CHECK (
    track_role IN (
      'lead_vocal',
      'adlib',
      'double',
      'backing',
      'beat',
      'instrument',
      'other'
    )
  );

-- ---------------------------------------------------------------------------
-- SET TRACK ROLE — CAS bump + write role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_cas_set_track_role(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer,
  p_track_role text
)
RETURNS TABLE (
  document_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  PERFORM pg_advisory_xact_lock(87245130, hashtext(p_project_id::text));

  UPDATE public.studio_projects AS sp
  SET document_version = sp.document_version + 1
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version INTO v_new;

  IF v_new IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.studio_tracks AS t
  SET track_role = p_track_role
  WHERE t.id = p_track_id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_set_track_role(
  uuid, uuid, uuid, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_set_track_role(
  uuid, uuid, uuid, integer, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_set_track_role(
  uuid, uuid, uuid, integer, text
) TO service_role;
