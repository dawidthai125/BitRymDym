-- Phase 5 — Track CRUD CAS (add / delete) with atomic capacity.
-- No table/schema shape changes. Reuses studio_tracks + ON DELETE CASCADE clips.
-- Capacity: COUNT(studio_tracks) vs p_max_tracks (Premium SSOT passed by service).
-- BEAT counts toward capacity; Master is not a studio_tracks row.
-- service_role only (P0 pattern: REVOKE anon/authenticated).

CREATE OR REPLACE FUNCTION public.studio_cas_add_track(
  p_project_id uuid,
  p_owner_id uuid,
  p_expected integer,
  p_max_tracks integer,
  p_name text,
  p_track_type text DEFAULT 'VOCAL'
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
  v_track_id uuid;
  v_new integer;
BEGIN
  IF p_max_tracks IS NULL OR p_max_tracks < 1 THEN
    RAISE EXCEPTION 'TRACK_CAPACITY_INVALID';
  END IF;

  IF p_track_type IS DISTINCT FROM 'VOCAL' THEN
    RAISE EXCEPTION 'TRACK_TYPE_INVALID';
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
    record_armed
  )
  VALUES (
    p_project_id,
    btrim(p_name),
    'VOCAL',
    v_sort,
    false
  )
  RETURNING id INTO v_track_id;

  UPDATE public.studio_projects AS sp
  SET document_version = sp.document_version + 1
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'TRACK_CAS_LOST';
  END IF;

  RETURN QUERY SELECT v_new, v_track_id, v_sort;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_add_track(
  uuid, uuid, integer, integer, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_add_track(
  uuid, uuid, integer, integer, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_add_track(
  uuid, uuid, integer, integer, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.studio_cas_delete_track(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer
)
RETURNS TABLE (
  document_version integer,
  deleted_track_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur integer;
  v_type text;
  v_new integer;
BEGIN
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

  SELECT t.track_type
  INTO v_type
  FROM public.studio_tracks AS t
  WHERE t.id = p_track_id
    AND t.project_id = p_project_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  IF v_type = 'BEAT' THEN
    RAISE EXCEPTION 'BEAT_TRACK_PROTECTED';
  END IF;

  DELETE FROM public.studio_tracks AS t
  WHERE t.id = p_track_id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND';
  END IF;

  UPDATE public.studio_projects AS sp
  SET document_version = sp.document_version + 1
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'TRACK_CAS_LOST';
  END IF;

  RETURN QUERY SELECT v_new, p_track_id;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_delete_track(
  uuid, uuid, uuid, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_delete_track(
  uuid, uuid, uuid, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_delete_track(
  uuid, uuid, uuid, integer
) TO service_role;
