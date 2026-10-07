-- P6.7.2 — Atomic CAS apply for clip fade_in_ms / fade_out_ms + document_version.
-- Reuses P6.1 CAS pattern (service_role RPC). No new tables/columns.
-- Qualifies studio_projects.document_version (RETURNS TABLE ambiguity lesson).

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_fades(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_fade_in_ms integer,
  p_fade_out_ms integer
)
RETURNS TABLE (
  document_version integer,
  fade_in_ms integer,
  fade_out_ms integer
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
    fade_in_ms = p_fade_in_ms,
    fade_out_ms = p_fade_out_ms
  FROM public.studio_tracks AS t
  WHERE c.id = p_clip_id
    AND c.track_id = t.id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new, p_fade_in_ms, p_fade_out_ms;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_fades(
  uuid, uuid, uuid, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_fades(
  uuid, uuid, uuid, integer, integer, integer
) TO service_role;
