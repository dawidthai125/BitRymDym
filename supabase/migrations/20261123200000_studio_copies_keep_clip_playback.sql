-- Studio: split clip, duplicate clip and duplicate track keep the clip's pitch, tempo and
-- reverse (scratch) settings; duplicate track also keeps its notes and automation.
-- Bodies are the latest definitions with only these columns added:
--   studio_cas_apply_clip_split      <- 20261007061049_p6_7_x_studio_cas_trim_split.sql
--   studio_cas_apply_clip_duplicate  <- 20261007080758_pr_v1_studio_cas_clip_duplicate.sql
--   studio_cas_duplicate_track       <- 20261029114247_studio_track_role.sql
-- Signatures, CAS, ownership checks, capacity checks and grants are unchanged.
-- No new tables or columns. Do not apply to production without the Owner apply process.

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
  v_scratch_cue_ms integer;
  v_scratch_reverse boolean;
  v_scratch_rate double precision;
  v_stretch_ratio numeric;
  v_pitch_cents integer;
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
    c.muted,
    c.scratch_cue_ms,
    c.scratch_reverse,
    c.scratch_rate,
    c.stretch_ratio,
    c.pitch_cents
  INTO
    v_track_id,
    v_source_kind,
    v_source_take_id,
    v_source_beat_id,
    v_source_artifact_id,
    v_gain_db,
    v_muted,
    v_scratch_cue_ms,
    v_scratch_reverse,
    v_scratch_rate,
    v_stretch_ratio,
    v_pitch_cents
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
    fade_out_ms,
    scratch_cue_ms,
    scratch_reverse,
    scratch_rate,
    stretch_ratio,
    pitch_cents
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
    p_right_fade_out_ms,
    v_scratch_cue_ms,
    v_scratch_reverse,
    v_scratch_rate,
    v_stretch_ratio,
    v_pitch_cents
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
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) TO service_role;

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
    fade_out_ms,
    scratch_cue_ms,
    scratch_reverse,
    scratch_rate,
    stretch_ratio,
    pitch_cents
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
    c.fade_out_ms,
    c.scratch_cue_ms,
    c.scratch_reverse,
    c.scratch_rate,
    c.stretch_ratio,
    c.pitch_cents
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
    color,
    track_role,
    automation,
    midi
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
    v_src.color,
    v_src.track_role,
    v_src.automation,
    v_src.midi
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
    fade_out_ms,
    scratch_cue_ms,
    scratch_reverse,
    scratch_rate,
    stretch_ratio,
    pitch_cents
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
    c.fade_out_ms,
    c.scratch_cue_ms,
    c.scratch_reverse,
    c.scratch_rate,
    c.stretch_ratio,
    c.pitch_cents
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
