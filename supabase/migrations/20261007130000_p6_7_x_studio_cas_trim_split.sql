-- P6.7.x — Atomic CAS for Trim (geometry+fades) and Split (left/right+fades).
-- Reuses P6.1 / P6.7.2 CAS pattern (service_role RPC). No new tables/columns.
-- Qualifies studio_projects.document_version (RETURNS TABLE ambiguity lesson).

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_geometry_fades(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_timeline_start_ms integer,
  p_duration_ms integer,
  p_source_offset_ms integer,
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
    timeline_start_ms = p_timeline_start_ms,
    duration_ms = p_duration_ms,
    source_offset_ms = p_source_offset_ms,
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

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_geometry_fades(
  uuid, uuid, uuid, integer, integer, integer, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_geometry_fades(
  uuid, uuid, uuid, integer, integer, integer, integer, integer, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_split(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_left_timeline_start_ms integer,
  p_left_duration_ms integer,
  p_left_source_offset_ms integer,
  p_left_fade_in_ms integer,
  p_left_fade_out_ms integer,
  p_right_timeline_start_ms integer,
  p_right_duration_ms integer,
  p_right_source_offset_ms integer,
  p_right_fade_in_ms integer,
  p_right_fade_out_ms integer
)
RETURNS TABLE (
  document_version integer,
  right_clip_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
  v_track_id uuid;
  v_source_kind text;
  v_source_take_id uuid;
  v_source_beat_id uuid;
  v_source_artifact_id uuid;
  v_gain_db double precision;
  v_muted boolean;
  v_right_id uuid;
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

  SELECT
    c.track_id,
    c.source_kind,
    c.source_take_id,
    c.source_beat_id,
    c.source_artifact_id,
    c.gain_db,
    c.muted
  INTO
    v_track_id,
    v_source_kind,
    v_source_take_id,
    v_source_beat_id,
    v_source_artifact_id,
    v_gain_db,
    v_muted
  FROM public.studio_clips AS c
  INNER JOIN public.studio_tracks AS t
    ON t.id = c.track_id
  WHERE c.id = p_clip_id
    AND t.project_id = p_project_id;

  IF v_track_id IS NULL THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  UPDATE public.studio_clips
  SET
    timeline_start_ms = p_left_timeline_start_ms,
    duration_ms = p_left_duration_ms,
    source_offset_ms = p_left_source_offset_ms,
    fade_in_ms = p_left_fade_in_ms,
    fade_out_ms = p_left_fade_out_ms
  WHERE id = p_clip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
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
  VALUES (
    v_track_id,
    v_source_kind,
    v_source_take_id,
    v_source_beat_id,
    v_source_artifact_id,
    p_right_timeline_start_ms,
    p_right_duration_ms,
    p_right_source_offset_ms,
    v_gain_db,
    v_muted,
    p_right_fade_in_ms,
    p_right_fade_out_ms
  )
  RETURNING id INTO v_right_id;

  RETURN QUERY SELECT v_new, v_right_id;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) TO service_role;
