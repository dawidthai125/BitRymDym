-- Studio markers A3/P7 lite: verse/hook at integer ms on the project document.
-- Additive jsonb column with default. service_role only (P0: REVOKE anon/authenticated).
-- Do not db push. Apply via MCP apply_migration. Drift OK, do not repair.

-- ---------------------------------------------------------------------------
-- Document field on existing studio_projects
-- ---------------------------------------------------------------------------
ALTER TABLE public.studio_projects
  ADD COLUMN IF NOT EXISTS markers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.studio_projects
  DROP CONSTRAINT IF EXISTS studio_projects_markers_array_chk;

ALTER TABLE public.studio_projects
  ADD CONSTRAINT studio_projects_markers_array_chk
  CHECK (jsonb_typeof(markers) = 'array');

COMMENT ON COLUMN public.studio_projects.markers IS
  'A3/P7 lite arrangement markers (verse|hook) at integer ms. CAS via studio_cas_apply_markers.';

-- ---------------------------------------------------------------------------
-- APPLY MARKERS — add verse/hook or remove by id + document_version
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_cas_apply_markers(
  p_project_id uuid,
  p_owner_id uuid,
  p_expected integer,
  p_op text,
  p_kind text DEFAULT NULL,
  p_position_ms integer DEFAULT NULL,
  p_marker_id uuid DEFAULT NULL
)
RETURNS TABLE (
  document_version integer,
  markers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cur integer;
  v_markers jsonb;
  v_new integer;
  v_id uuid;
  v_count integer;
  v_found boolean;
  v_item jsonb;
BEGIN
  IF p_op IS DISTINCT FROM 'add' AND p_op IS DISTINCT FROM 'remove' THEN
    RAISE EXCEPTION 'MARKERS_OP_INVALID';
  END IF;

  IF p_op = 'add' THEN
    IF p_kind IS DISTINCT FROM 'verse' AND p_kind IS DISTINCT FROM 'hook' THEN
      RAISE EXCEPTION 'MARKER_KIND_INVALID';
    END IF;
    IF p_position_ms IS NULL OR p_position_ms < 0 OR p_position_ms > 86400000 THEN
      RAISE EXCEPTION 'MARKER_POSITION_INVALID';
    END IF;
  ELSE
    IF p_marker_id IS NULL THEN
      RAISE EXCEPTION 'MARKER_ID_INVALID';
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(87245130, pg_catalog.hashtext(p_project_id::text));

  SELECT sp.document_version, sp.markers
  INTO v_cur, v_markers
  FROM public.studio_projects AS sp
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id;

  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND';
  END IF;

  IF v_cur IS DISTINCT FROM p_expected THEN
    RETURN;
  END IF;

  IF v_markers IS NULL OR jsonb_typeof(v_markers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'MARKERS_INVALID';
  END IF;

  v_count := jsonb_array_length(v_markers);

  IF p_op = 'add' THEN
    IF v_count >= 24 THEN
      RAISE EXCEPTION 'MARKERS_CAPACITY';
    END IF;

    v_id := pg_catalog.gen_random_uuid();
    v_markers := v_markers || jsonb_build_array(
      jsonb_build_object(
        'id', v_id,
        'kind', p_kind,
        'positionMs', p_position_ms
      )
    );
  ELSE
    v_found := false;
    v_item := NULL;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_markers) AS value
    LOOP
      IF (v_item ->> 'id') = p_marker_id::text THEN
        v_found := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_found THEN
      RAISE EXCEPTION 'MARKER_NOT_FOUND';
    END IF;

    SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
    INTO v_markers
    FROM jsonb_array_elements(v_markers) AS value
    WHERE (value ->> 'id') IS DISTINCT FROM p_marker_id::text;
  END IF;

  UPDATE public.studio_projects AS sp
  SET
    document_version = sp.document_version + 1,
    markers = v_markers
  WHERE sp.id = p_project_id
    AND sp.owner_id = p_owner_id
    AND sp.document_version = p_expected
  RETURNING sp.document_version, sp.markers INTO v_new, v_markers;

  IF v_new IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT v_new, v_markers;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_cas_apply_markers(
  uuid, uuid, integer, text, text, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_markers(
  uuid, uuid, integer, text, text, integer, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_markers(
  uuid, uuid, integer, text, text, integer, uuid
) TO service_role;

COMMENT ON FUNCTION public.studio_cas_apply_markers(
  uuid, uuid, integer, text, text, integer, uuid
) IS
  'A3/P7 lite CAS write for project markers. service_role only. Empty row = version conflict.';
