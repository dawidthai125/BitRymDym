-- POST-RECORDING EDITING V1 — Duplicate Clip CAS (atomic insert + document_version).
-- Copies Clip row fields only. Does NOT copy Take bytes / Storage objects.
-- service_role only (P0 pattern: REVOKE anon/authenticated).

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_duplicate(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_timeline_start_ms integer
)
RETURNS TABLE (
  document_version integer,
  new_clip_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
  v_new_clip_id uuid;
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

  INSERT INTO public.studio_clips (
    track_id,
    source_kind,
    source_take_id,
    source_beat_id,
    source_artifact_id,
    timeline_start_ms,
    duration_ms,
    source_offset_ms,
    gain_db,
    muted,
    fade_in_ms,
    fade_out_ms
  )
  SELECT
    c.track_id,
    c.source_kind,
    c.source_take_id,
    c.source_beat_id,
    c.source_artifact_id,
    p_timeline_start_ms,
    c.duration_ms,
    c.source_offset_ms,
    c.gain_db,
    c.muted,
    c.fade_in_ms,
    c.fade_out_ms
  FROM public.studio_clips AS c
  INNER JOIN public.studio_tracks AS t
    ON t.id = c.track_id
  WHERE c.id = p_clip_id
    AND t.project_id = p_project_id
  RETURNING id INTO v_new_clip_id;

  IF v_new_clip_id IS NULL THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new, v_new_clip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_duplicate(
  uuid, uuid, uuid, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_duplicate(
  uuid, uuid, uuid, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_duplicate(
  uuid, uuid, uuid, integer, integer
) TO service_role;
