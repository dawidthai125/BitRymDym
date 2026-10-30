-- Recording P0 — take lanes (loop passes + comp) and per-device latency.
-- NOT applied to production yet (prepared + tested locally).
--
-- studio_take_lanes: one section of one track with N passes (each pass =
-- sub-range of an owned take) and the chosen comp. Bounded jsonb.
-- studio_device_latency: measured round trip per user + device key.
-- Writes go through service_role API routes (ownership checked there and
-- by the guard trigger); owners may SELECT their rows.

CREATE TABLE IF NOT EXISTS public.studio_take_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.studio_tracks (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  section_start_ms integer NOT NULL,
  section_end_ms integer NOT NULL,
  line_ms integer NOT NULL,
  passes jsonb NOT NULL DEFAULT '[]'::jsonb,
  comp jsonb NOT NULL DEFAULT '[]'::jsonb,
  clip_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_take_lanes_range_chk CHECK (
    section_start_ms >= 0 AND section_end_ms > section_start_ms AND section_end_ms <= 600000
  ),
  CONSTRAINT studio_take_lanes_line_chk CHECK (line_ms BETWEEN 100 AND 60000),
  CONSTRAINT studio_take_lanes_passes_chk CHECK (
    jsonb_typeof(passes) = 'array' AND jsonb_array_length(passes) <= 24 AND pg_column_size(passes) <= 16384
  ),
  CONSTRAINT studio_take_lanes_comp_chk CHECK (
    jsonb_typeof(comp) = 'array' AND jsonb_array_length(comp) <= 64 AND pg_column_size(comp) <= 8192
  ),
  CONSTRAINT studio_take_lanes_clips_chk CHECK (
    jsonb_typeof(clip_ids) = 'array' AND jsonb_array_length(clip_ids) <= 128 AND pg_column_size(clip_ids) <= 8192
  )
);

CREATE INDEX IF NOT EXISTS studio_take_lanes_project_idx
  ON public.studio_take_lanes (project_id, track_id, section_start_ms);
CREATE INDEX IF NOT EXISTS studio_take_lanes_owner_idx ON public.studio_take_lanes (owner_id);
CREATE INDEX IF NOT EXISTS studio_take_lanes_track_idx ON public.studio_take_lanes (track_id);

-- Owner must own the project and the track must belong to it; max 64 lanes/project.
CREATE OR REPLACE FUNCTION public.studio_take_lanes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_projects p
    WHERE p.id = NEW.project_id AND p.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'TAKE_LANE_PROJECT_OWNER_MISMATCH' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_tracks t
    WHERE t.id = NEW.track_id AND t.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'TAKE_LANE_TRACK_MISMATCH' USING errcode = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND (
    SELECT count(*) FROM public.studio_take_lanes l WHERE l.project_id = NEW.project_id
  ) >= 64 THEN
    RAISE EXCEPTION 'TAKE_LANE_LIMIT' USING errcode = '54000';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.project_id <> OLD.project_id OR NEW.owner_id <> OLD.owner_id
  ) THEN
    RAISE EXCEPTION 'TAKE_LANE_IMMUTABLE_OWNER' USING errcode = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_take_lanes_guard_trg ON public.studio_take_lanes;
CREATE TRIGGER studio_take_lanes_guard_trg
  BEFORE INSERT OR UPDATE ON public.studio_take_lanes
  FOR EACH ROW EXECUTE FUNCTION public.studio_take_lanes_guard();

REVOKE ALL ON FUNCTION public.studio_take_lanes_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_take_lanes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_take_lanes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_take_lanes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_take_lanes TO service_role;

DROP POLICY IF EXISTS studio_take_lanes_owner_select ON public.studio_take_lanes;
CREATE POLICY studio_take_lanes_owner_select
  ON public.studio_take_lanes FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

COMMENT ON TABLE public.studio_take_lanes IS
  'Recording P0: loop/punch passes per section + comp choice. Writes via service_role API only.';

CREATE TABLE IF NOT EXISTS public.studio_device_latency (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_key text NOT NULL,
  round_trip_ms numeric(6, 1),
  manual_offset_ms integer NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'click',
  spread_ms numeric(6, 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_key),
  CONSTRAINT studio_device_latency_key_chk CHECK (char_length(device_key) BETWEEN 1 AND 160),
  CONSTRAINT studio_device_latency_rt_chk CHECK (round_trip_ms IS NULL OR round_trip_ms BETWEEN -60 AND 700),
  CONSTRAINT studio_device_latency_manual_chk CHECK (manual_offset_ms BETWEEN -150 AND 300),
  CONSTRAINT studio_device_latency_method_chk CHECK (method IN ('click', 'clap', 'manual')),
  CONSTRAINT studio_device_latency_spread_chk CHECK (spread_ms IS NULL OR spread_ms BETWEEN 0 AND 1000)
);

-- Max 12 devices per user (oldest dropped by the API; hard cap here).
CREATE OR REPLACE FUNCTION public.studio_device_latency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.studio_device_latency d
    WHERE d.user_id = NEW.user_id AND d.device_key <> NEW.device_key
  ) >= 12 THEN
    RAISE EXCEPTION 'DEVICE_LATENCY_LIMIT' USING errcode = '54000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_device_latency_guard_trg ON public.studio_device_latency;
CREATE TRIGGER studio_device_latency_guard_trg
  BEFORE INSERT ON public.studio_device_latency
  FOR EACH ROW EXECUTE FUNCTION public.studio_device_latency_guard();

REVOKE ALL ON FUNCTION public.studio_device_latency_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_device_latency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_device_latency FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_device_latency TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_device_latency TO service_role;

DROP POLICY IF EXISTS studio_device_latency_owner_select ON public.studio_device_latency;
CREATE POLICY studio_device_latency_owner_select
  ON public.studio_device_latency FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.studio_device_latency IS
  'Recording P0: measured latency per user + device (input|output labels). Writes via service_role API only.';
