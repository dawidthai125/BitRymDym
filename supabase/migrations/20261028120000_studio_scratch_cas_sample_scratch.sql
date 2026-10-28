-- Scratch DJ v1 CAS: allow SAMPLE/SCRATCH add-track + persist approved clip scratch.
-- Additive columns with defaults. Replaces studio_cas_add_track body only.
-- service_role only (P0: REVOKE anon/authenticated). Do not db push.

-- ---------------------------------------------------------------------------
-- Approved Scratch fields on existing studio_clips
-- ---------------------------------------------------------------------------
ALTER TABLE public.studio_clips
  ADD COLUMN IF NOT EXISTS scratch_cue_ms integer NOT NULL DEFAULT 0;

ALTER TABLE public.studio_clips
  ADD COLUMN IF NOT EXISTS scratch_reverse boolean NOT NULL DEFAULT false;

ALTER TABLE public.studio_clips
  ADD COLUMN IF NOT EXISTS scratch_rate double precision NOT NULL DEFAULT 1;

ALTER TABLE public.studio_clips
  DROP CONSTRAINT IF EXISTS studio_clips_scratch_cue_chk;

ALTER TABLE public.studio_clips
  ADD CONSTRAINT studio_clips_scratch_cue_chk
  CHECK (scratch_cue_ms >= 0);

ALTER TABLE public.studio_clips
  DROP CONSTRAINT IF EXISTS studio_clips_scratch_rate_chk;

ALTER TABLE public.studio_clips
  ADD CONSTRAINT studio_clips_scratch_rate_chk
  CHECK (scratch_rate >= 0.25 AND scratch_rate <= 4);

COMMENT ON COLUMN public.studio_clips.scratch_cue_ms IS
  'Approved Scratch cue in source ms. Live jog is not persisted.';
COMMENT ON COLUMN public.studio_clips.scratch_reverse IS
  'Approved Scratch reverse. Live BufferSource uses this flag.';
COMMENT ON COLUMN public.studio_clips.scratch_rate IS
  'Approved linked Scratch rate/pitch (0.25–4).';

-- ---------------------------------------------------------------------------
-- ADD TRACK — VOCAL | SAMPLE | SCRATCH (BEAT still protected / not creatable)
-- ---------------------------------------------------------------------------
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

  IF p_track_type IS DISTINCT FROM 'VOCAL'
     AND p_track_type IS DISTINCT FROM 'SAMPLE'
     AND p_track_type IS DISTINCT FROM 'SCRATCH' THEN
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
    p_track_type,
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

-- ---------------------------------------------------------------------------
-- APPLY CLIP SCRATCH — approved cue / reverse / rate + document_version
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_cas_apply_clip_scratch(
  p_project_id uuid,
  p_owner_id uuid,
  p_clip_id uuid,
  p_expected integer,
  p_scratch_cue_ms integer,
  p_scratch_reverse boolean,
  p_scratch_rate double precision
)
RETURNS TABLE (
  document_version integer,
  scratch_cue_ms integer,
  scratch_reverse boolean,
  scratch_rate double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_scratch_cue_ms IS NULL OR p_scratch_cue_ms < 0 THEN
    RAISE EXCEPTION 'SCRATCH_CUE_INVALID';
  END IF;

  IF p_scratch_reverse IS NULL THEN
    RAISE EXCEPTION 'SCRATCH_REVERSE_INVALID';
  END IF;

  IF p_scratch_rate IS NULL OR p_scratch_rate < 0.25 OR p_scratch_rate > 4 THEN
    RAISE EXCEPTION 'SCRATCH_RATE_INVALID';
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

  UPDATE public.studio_clips AS c
  SET
    scratch_cue_ms = p_scratch_cue_ms,
    scratch_reverse = p_scratch_reverse,
    scratch_rate = p_scratch_rate
  FROM public.studio_tracks AS t
  WHERE c.id = p_clip_id
    AND c.track_id = t.id
    AND t.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIP_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT
    v_new,
    p_scratch_cue_ms,
    p_scratch_reverse,
    p_scratch_rate;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_scratch(
  uuid, uuid, uuid, integer, integer, boolean, double precision
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_scratch(
  uuid, uuid, uuid, integer, integer, boolean, double precision
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_scratch(
  uuid, uuid, uuid, integer, integer, boolean, double precision
) TO service_role;
