-- POST-RECORDING EDITING V1 — Clip Gain / Mute CAS write path.
-- ACL-only mutation of existing studio_clips.gain_db / muted + document_version.
-- No new tables/columns. service_role only (P0 pattern: REVOKE anon/authenticated).

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_gain_mute(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_gain_db double precision,
  p_muted boolean
)
RETURNS TABLE (
  document_version integer,
  gain_db double precision,
  muted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
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
    gain_db = p_gain_db,
    muted = p_muted
  FROM public.studio_tracks AS t
  WHERE c.id = p_clip_id
    AND c.track_id = t.id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new, p_gain_db, p_muted;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_gain_mute(
  uuid, uuid, uuid, integer, double precision, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_gain_mute(
  uuid, uuid, uuid, integer, double precision, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_gain_mute(
  uuid, uuid, uuid, integer, double precision, boolean
) TO service_role;
