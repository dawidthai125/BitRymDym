-- Phase 7.1.6 — CAS completeness for track controls, reorder, add clip.
-- service_role only (P0 pattern). No schema shape changes.

-- ---------------------------------------------------------------------------
-- UPDATE TRACK CONTROLS — CAS bump + write controls (+ exclusive record arm)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_cas_update_track_controls(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer,
  p_name text,
  p_muted boolean,
  p_solo boolean,
  p_gain_db double precision,
  p_pan double precision,
  p_record_armed boolean
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

  IF p_record_armed IS TRUE THEN
    UPDATE public.studio_tracks AS t
    SET record_armed = false
    WHERE t.project_id = p_project_id
      AND t.id IS DISTINCT FROM p_track_id;
  END IF;

  UPDATE public.studio_tracks AS t
  SET
    name = p_name,
    muted = p_muted,
    solo = p_solo,
    gain_db = p_gain_db,
    pan = p_pan,
    record_armed = p_record_armed
  WHERE t.id = p_track_id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_update_track_controls(
  uuid, uuid, uuid, integer, text, boolean, boolean, double precision, double precision, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_update_track_controls(
  uuid, uuid, uuid, integer, text, boolean, boolean, double precision, double precision, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_update_track_controls(
  uuid, uuid, uuid, integer, text, boolean, boolean, double precision, double precision, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- REORDER TRACK — swap sort_order with neighbor + CAS bump
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_cas_reorder_track(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer,
  p_direction text
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
  v_ids uuid[];
  v_idx integer;
  v_swap integer;
  v_tmp uuid;
  v_i integer;
BEGIN
  IF p_direction IS DISTINCT FROM 'up' AND p_direction IS DISTINCT FROM 'down' THEN
    RAISE EXCEPTION 'REORDER_DIRECTION_INVALID';
  END IF;

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

  SELECT ARRAY_AGG(t.id ORDER BY t.sort_order ASC)
  INTO v_ids
  FROM public.studio_tracks AS t
  WHERE t.project_id = p_project_id;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  v_idx := NULL;
  FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
    IF v_ids[v_i] = p_track_id THEN
      v_idx := v_i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  v_swap := CASE WHEN p_direction = 'up' THEN v_idx - 1 ELSE v_idx + 1 END;
  IF v_swap >= 1 AND v_swap <= array_length(v_ids, 1) THEN
    v_tmp := v_ids[v_idx];
    v_ids[v_idx] := v_ids[v_swap];
    v_ids[v_swap] := v_tmp;

    FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
      UPDATE public.studio_tracks AS t
      SET sort_order = v_i - 1
      WHERE t.id = v_ids[v_i]
        AND t.project_id = p_project_id;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_reorder_track(
  uuid, uuid, uuid, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_reorder_track(
  uuid, uuid, uuid, integer, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_reorder_track(
  uuid, uuid, uuid, integer, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- ADD CLIP — insert clip + CAS bump (Take bytes untouched)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_cas_add_clip(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer,
  p_source_kind text,
  p_source_take_id uuid,
  p_source_beat_id uuid,
  p_source_artifact_id uuid,
  p_timeline_start_ms integer,
  p_duration_ms integer,
  p_source_offset_ms integer
)
RETURNS TABLE (
  document_version integer,
  clip_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
  v_clip_id uuid;
  v_track_ok boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(87245130, hashtext(p_project_id::text));

  SELECT EXISTS (
    SELECT 1
    FROM public.studio_tracks AS t
    WHERE t.id = p_track_id
      AND t.project_id = p_project_id
  ) INTO v_track_ok;

  IF NOT v_track_ok THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  UPDATE public.studio_projects AS sp
  SET document_version = sp.document_version + 1
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version INTO v_new;

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
    source_offset_ms
  )
  VALUES (
    p_track_id,
    p_source_kind,
    p_source_take_id,
    p_source_beat_id,
    p_source_artifact_id,
    p_timeline_start_ms,
    p_duration_ms,
    COALESCE(p_source_offset_ms, 0)
  )
  RETURNING id INTO v_clip_id;

  RETURN QUERY SELECT v_new, v_clip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_add_clip(
  uuid, uuid, uuid, integer, text, uuid, uuid, uuid, integer, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_add_clip(
  uuid, uuid, uuid, integer, text, uuid, uuid, uuid, integer, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_add_clip(
  uuid, uuid, uuid, integer, text, uuid, uuid, uuid, integer, integer, integer
) TO service_role;
