-- Clip stretch and pitch. Columns already exist from the studio foundation.
-- service_role only, same CAS as fades.

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_playback(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_stretch_ratio numeric,
  p_pitch_cents integer
)
RETURNS TABLE (
  document_version integer,
  stretch_ratio numeric,
  pitch_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_stretch_ratio < 0.5 OR p_stretch_ratio > 2 THEN
    RAISE EXCEPTION 'PLAYBACK_RANGE';
  END IF;
  IF p_pitch_cents < -1200 OR p_pitch_cents > 1200 THEN
    RAISE EXCEPTION 'PLAYBACK_RANGE';
  END IF;

  UPDATE public.studio_projects
  SET document_version = studio_projects.document_version + 1
  WHERE id = p_project_id
    AND owner_id = p_owner_id
    AND studio_projects.document_version = p_expected
  RETURNING studio_projects.document_version INTO v_new;

  IF v_new IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.studio_clips AS c
  SET
    stretch_ratio = p_stretch_ratio,
    pitch_cents = p_pitch_cents
  FROM public.studio_tracks AS t
  WHERE c.id = p_clip_id
    AND c.track_id = t.id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new, p_stretch_ratio, p_pitch_cents;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_playback(
  uuid, uuid, uuid, integer, numeric, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_playback(
  uuid, uuid, uuid, integer, numeric, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_playback(
  uuid, uuid, uuid, integer, numeric, integer
) TO service_role;
