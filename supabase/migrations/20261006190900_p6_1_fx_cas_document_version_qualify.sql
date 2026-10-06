-- P6.1 hotfix — qualify document_version in studio_cas_apply_fx_chain.
-- RETURNS TABLE (document_version ...) makes unqualified document_version
-- ambiguous with the table column in UPDATE SET/WHERE (HTTP 400 on FX PATCH).
-- No schema/table/JSONB/AuthZ/CAS semantic changes.

CREATE OR REPLACE FUNCTION public.studio_cas_apply_fx_chain(
  p_project_id uuid,
  p_owner_id uuid,
  p_expected integer,
  p_chain jsonb,
  p_track_id uuid DEFAULT NULL
)
RETURNS TABLE (document_version integer, chain jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_track_id IS NULL THEN
    RETURN QUERY
    UPDATE public.studio_projects
    SET
      master_fx_chain = p_chain,
      document_version = studio_projects.document_version + 1
    WHERE id = p_project_id
      AND owner_id = p_owner_id
      AND studio_projects.document_version = p_expected
    RETURNING
      studio_projects.document_version,
      studio_projects.master_fx_chain;
    RETURN;
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

  UPDATE public.studio_tracks
  SET effects_chain = p_chain
  WHERE id = p_track_id
    AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new, p_chain;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_fx_chain(uuid, uuid, integer, jsonb, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_fx_chain(uuid, uuid, integer, jsonb, uuid)
  TO service_role;
