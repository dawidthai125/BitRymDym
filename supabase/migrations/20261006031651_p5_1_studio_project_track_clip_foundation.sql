-- P5.1 — Studio Project / Track / Clip foundation
-- Additive only. Does not alter takes / P3 / P4 / mix / render_jobs.

-- ---------------------------------------------------------------------------
-- studio_projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nowy projekt',
  status text NOT NULL DEFAULT 'DRAFT',
  tempo_bpm numeric(6, 2) NOT NULL DEFAULT 120,
  time_signature_num smallint NOT NULL DEFAULT 4,
  time_signature_den smallint NOT NULL DEFAULT 4,
  beat_id uuid NULL REFERENCES public.beats (id) ON DELETE SET NULL,
  timeline_length_ms integer NOT NULL DEFAULT 60000,
  master_gain_db numeric(6, 2) NOT NULL DEFAULT 0,
  master_pan numeric(4, 3) NOT NULL DEFAULT 0,
  master_fx_chain jsonb NULL,
  schema_version integer NOT NULL DEFAULT 1,
  document_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_projects_title_len_chk
    CHECK (char_length(title) >= 1 AND char_length(title) <= 120),
  CONSTRAINT studio_projects_status_chk
    CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  CONSTRAINT studio_projects_tempo_chk
    CHECK (tempo_bpm >= 20 AND tempo_bpm <= 400),
  CONSTRAINT studio_projects_time_sig_chk
    CHECK (
      time_signature_num BETWEEN 1 AND 16
      AND time_signature_den IN (1, 2, 4, 8, 16)
    ),
  CONSTRAINT studio_projects_timeline_len_chk
    CHECK (timeline_length_ms >= 1000 AND timeline_length_ms <= 3600000),
  CONSTRAINT studio_projects_master_pan_chk
    CHECK (master_pan >= -1 AND master_pan <= 1),
  CONSTRAINT studio_projects_schema_version_chk
    CHECK (schema_version >= 1),
  CONSTRAINT studio_projects_document_version_chk
    CHECK (document_version >= 1)
);

CREATE INDEX IF NOT EXISTS studio_projects_owner_updated_idx
  ON public.studio_projects (owner_id, updated_at DESC);

CREATE TRIGGER studio_projects_set_updated_at
BEFORE UPDATE ON public.studio_projects
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_studio_project_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_projects';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER studio_projects_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.studio_projects
FOR EACH ROW
EXECUTE FUNCTION public.prevent_studio_project_privilege_escalation();

ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_projects_select_own ON public.studio_projects;
CREATE POLICY studio_projects_select_own
  ON public.studio_projects
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.studio_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_projects TO authenticated;
GRANT ALL ON TABLE public.studio_projects TO service_role;

COMMENT ON TABLE public.studio_projects IS
  'P5.1 Studio Project container. Mutations service_role only.';

-- ---------------------------------------------------------------------------
-- studio_tracks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Ścieżka',
  track_type text NOT NULL DEFAULT 'VOCAL',
  sort_order integer NOT NULL DEFAULT 0,
  gain_db numeric(6, 2) NOT NULL DEFAULT 0,
  pan numeric(4, 3) NOT NULL DEFAULT 0,
  muted boolean NOT NULL DEFAULT false,
  solo boolean NOT NULL DEFAULT false,
  record_armed boolean NOT NULL DEFAULT false,
  input_device_hint text NULL,
  output_route text NOT NULL DEFAULT 'MASTER',
  effects_chain jsonb NULL,
  color text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_tracks_name_len_chk
    CHECK (char_length(name) >= 1 AND char_length(name) <= 80),
  CONSTRAINT studio_tracks_type_chk
    CHECK (
      track_type IN (
        'VOCAL',
        'BEAT',
        'SAMPLE',
        'SCRATCH',
        'INSTRUMENT',
        'GUITAR',
        'FX',
        'BUS',
        'OTHER'
      )
    ),
  CONSTRAINT studio_tracks_pan_chk
    CHECK (pan >= -1 AND pan <= 1),
  CONSTRAINT studio_tracks_output_route_chk
    CHECK (output_route IN ('MASTER'))
);

CREATE INDEX IF NOT EXISTS studio_tracks_project_sort_idx
  ON public.studio_tracks (project_id, sort_order);

CREATE TRIGGER studio_tracks_set_updated_at
BEFORE UPDATE ON public.studio_tracks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_studio_track_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_tracks';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER studio_tracks_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.studio_tracks
FOR EACH ROW
EXECUTE FUNCTION public.prevent_studio_track_privilege_escalation();

ALTER TABLE public.studio_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_tracks_select_own ON public.studio_tracks;
CREATE POLICY studio_tracks_select_own
  ON public.studio_tracks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_projects p
      WHERE p.id = studio_tracks.project_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.studio_tracks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_tracks TO authenticated;
GRANT ALL ON TABLE public.studio_tracks TO service_role;

COMMENT ON TABLE public.studio_tracks IS
  'P5.1 Studio Track channel. Extensible track_type; FX stubs for P6.';

-- ---------------------------------------------------------------------------
-- studio_clips
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.studio_tracks (id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_take_id uuid NULL REFERENCES public.takes (id) ON DELETE SET NULL,
  source_beat_id uuid NULL REFERENCES public.beats (id) ON DELETE SET NULL,
  source_artifact_id uuid NULL REFERENCES public.audio_artifacts (id) ON DELETE SET NULL,
  timeline_start_ms integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 1000,
  source_offset_ms integer NOT NULL DEFAULT 0,
  gain_db numeric(6, 2) NOT NULL DEFAULT 0,
  muted boolean NOT NULL DEFAULT false,
  fade_in_ms integer NOT NULL DEFAULT 0,
  fade_out_ms integer NOT NULL DEFAULT 0,
  pitch_cents integer NULL,
  stretch_ratio numeric(8, 6) NULL,
  effects jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_clips_source_kind_chk
    CHECK (source_kind IN ('TAKE', 'BEAT_REF', 'ARTIFACT')),
  CONSTRAINT studio_clips_source_xor_chk
    CHECK (
      (source_kind = 'TAKE' AND source_take_id IS NOT NULL AND source_beat_id IS NULL AND source_artifact_id IS NULL)
      OR (source_kind = 'BEAT_REF' AND source_beat_id IS NOT NULL AND source_take_id IS NULL AND source_artifact_id IS NULL)
      OR (source_kind = 'ARTIFACT' AND source_artifact_id IS NOT NULL AND source_take_id IS NULL AND source_beat_id IS NULL)
    ),
  CONSTRAINT studio_clips_timeline_start_chk
    CHECK (timeline_start_ms >= 0),
  CONSTRAINT studio_clips_duration_chk
    CHECK (duration_ms >= 1 AND duration_ms <= 3600000),
  CONSTRAINT studio_clips_source_offset_chk
    CHECK (source_offset_ms >= 0),
  CONSTRAINT studio_clips_fade_chk
    CHECK (fade_in_ms >= 0 AND fade_out_ms >= 0)
);

CREATE INDEX IF NOT EXISTS studio_clips_track_start_idx
  ON public.studio_clips (track_id, timeline_start_ms);

CREATE INDEX IF NOT EXISTS studio_clips_take_idx
  ON public.studio_clips (source_take_id)
  WHERE source_take_id IS NOT NULL;

CREATE TRIGGER studio_clips_set_updated_at
BEFORE UPDATE ON public.studio_clips
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_studio_clip_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_clips';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER studio_clips_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.studio_clips
FOR EACH ROW
EXECUTE FUNCTION public.prevent_studio_clip_privilege_escalation();

ALTER TABLE public.studio_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_clips_select_own ON public.studio_clips;
CREATE POLICY studio_clips_select_own
  ON public.studio_clips
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_tracks t
      JOIN public.studio_projects p ON p.id = t.project_id
      WHERE t.id = studio_clips.track_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.studio_clips FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_clips TO authenticated;
GRANT ALL ON TABLE public.studio_clips TO service_role;

COMMENT ON TABLE public.studio_clips IS
  'P5.1 Studio Clip — timeline placement. Source XOR TAKE|BEAT_REF|ARTIFACT. Integer ms SSOT.';

REVOKE EXECUTE ON FUNCTION public.prevent_studio_project_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_studio_track_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_studio_clip_privilege_escalation() FROM PUBLIC, anon, authenticated;
