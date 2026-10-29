-- Phase 6 — Duplicate Track CAS (atomic capacity + copy clips, share Takes).

CREATE OR REPLACE FUNCTION public.studio_cas_duplicate_track(
  p_project_id uuid,
  p_owner_id uuid,
  p_source_track_id uuid,
  p_expected integer,
  p_max_tracks integer,
  p_name text
)
RETURNS TABLE (
  document_version integer,
  track_id uuid,
  sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur integer;
  v_count integer;
  v_sort integer;
  v_new_track_id uuid;
  v_new integer;
  v_src public.studio_tracks%ROWTYPE;
BEGIN
  IF p_max_tracks IS NULL OR p_max_tracks < 1 THEN
    RAISE EXCEPTION 'TRACK_CAPACITY_INVALID';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) < 1 OR char_length(p_name) > 80 THEN
    RAISE EXCEPTION 'TRACK_NAME_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(87245130, hashtext(p_project_id::text));

  SELECT sp.document_version
  INTO v_cur
  FROM public.studio_projects AS sp
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id;

  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND';
  END IF;

  IF v_cur IS DISTINCT FROM p_expected THEN
    RETURN;
  END IF;

  SELECT t.*
  INTO v_src
  FROM public.studio_tracks AS t
  WHERE t.id = p_source_track_id
    AND t.project_id = p_project_id;

  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  IF v_src.track_type = 'BEAT' THEN
    RAISE EXCEPTION 'BEAT_TRACK_PROTECTED';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.studio_tracks AS t
  WHERE t.project_id = p_project_id;

  IF v_count >= p_max_tracks THEN
    RAISE EXCEPTION 'TRACK_CAPACITY_REACHED';
  END IF;

  SELECT COALESCE(MAX(t.sort_order), -1) + 1
  INTO v_sort
  FROM public.studio_tracks AS t
  WHERE t.project_id = p_project_id;

  INSERT INTO public.studio_tracks (
    project_id,
    name,
    track_type,
    sort_order,
    gain_db,
    pan,
    muted,
    solo,
    record_armed,
    input_device_hint,
    output_route,
    effects_chain,
    color
  )
  VALUES (
    p_project_id,
    btrim(p_name),
    v_src.track_type,
    v_sort,
    v_src.gain_db,
    v_src.pan,
    v_src.muted,
    v_src.solo,
    false,
    v_src.input_device_hint,
    v_src.output_route,
    v_src.effects_chain,
    v_src.color
  )
  RETURNING id INTO v_new_track_id;

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
    v_new_track_id,
    c.source_kind,
    c.source_take_id,
    c.source_beat_id,
    c.source_artifact_id,
    c.timeline_start_ms,
    c.duration_ms,
    c.source_offset_ms,
    c.gain_db,
    c.muted,
    c.fade_in_ms,
    c.fade_out_ms
  FROM public.studio_clips AS c
  WHERE c.track_id = p_source_track_id
  ORDER BY c.timeline_start_ms ASC, c.id ASC;

  UPDATE public.studio_projects AS sp
  SET document_version = sp.document_version + 1
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'TRACK_CAS_LOST';
  END IF;

  RETURN QUERY SELECT v_new, v_new_track_id, v_sort;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_duplicate_track(
  uuid, uuid, uuid, integer, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_duplicate_track(
  uuid, uuid, uuid, integer, integer, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_duplicate_track(
  uuid, uuid, uuid, integer, integer, text
) TO service_role;
