-- POST-RECORDING EDITING V1 — Delete Clip CAS (atomic delete + document_version).
-- Deletes Clip row only. Take / Storage untouched.
-- service_role only (P0 pattern: REVOKE anon/authenticated).

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_delete(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer
)
RETURNS TABLE (
  document_version integer,
  deleted_clip_id uuid
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

  DELETE FROM public.studio_clips AS c
  USING public.studio_tracks AS t
  WHERE c.id = p_clip_id
    AND c.track_id = t.id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new, p_clip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_delete(
  uuid, uuid, uuid, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_delete(
  uuid, uuid, uuid, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_delete(
  uuid, uuid, uuid, integer
) TO service_role;
