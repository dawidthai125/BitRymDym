-- Studio gaps P0 — lyrics (teleprompter) and own vocal FX presets.
-- NOT applied to production yet (prepared + tested locally).
--
-- studio_project_lyrics: one lyrics document per project (sections with an
-- optional timeline anchor + lines). Optimistic CAS via `version`.
-- studio_fx_presets: user-saved FX chains ("chain") and role sets
-- ("set" = lead / doubles / adlibs). Plan limits (Silver+ save, Gold sets)
-- are enforced by the API via src/config/plan-policy.ts; the trigger keeps a
-- hard cap. Writes go through service_role API routes; owners may SELECT.

CREATE TABLE IF NOT EXISTS public.studio_project_lyrics (
  project_id uuid PRIMARY KEY REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_project_lyrics_body_chk CHECK (
    jsonb_typeof(body) = 'object'
    AND jsonb_typeof(body -> 'sections') = 'array'
    AND jsonb_array_length(body -> 'sections') <= 40
    AND pg_column_size(body) <= 65536
  ),
  CONSTRAINT studio_project_lyrics_version_chk CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS studio_project_lyrics_owner_idx ON public.studio_project_lyrics (owner_id);

CREATE OR REPLACE FUNCTION public.studio_project_lyrics_guard()
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
    RAISE EXCEPTION 'LYRICS_PROJECT_OWNER_MISMATCH' USING errcode = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.project_id <> OLD.project_id OR NEW.owner_id <> OLD.owner_id) THEN
    RAISE EXCEPTION 'LYRICS_IMMUTABLE_OWNER' USING errcode = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_project_lyrics_guard_trg ON public.studio_project_lyrics;
CREATE TRIGGER studio_project_lyrics_guard_trg
  BEFORE INSERT OR UPDATE ON public.studio_project_lyrics
  FOR EACH ROW EXECUTE FUNCTION public.studio_project_lyrics_guard();

REVOKE ALL ON FUNCTION public.studio_project_lyrics_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_project_lyrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_project_lyrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_project_lyrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_project_lyrics TO service_role;

DROP POLICY IF EXISTS studio_project_lyrics_owner_select ON public.studio_project_lyrics;
CREATE POLICY studio_project_lyrics_owner_select
  ON public.studio_project_lyrics FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

COMMENT ON TABLE public.studio_project_lyrics IS
  'Studio gaps P0: per-project lyrics for the recording teleprompter. Writes via service_role API only.';

CREATE TABLE IF NOT EXISTS public.studio_fx_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_fx_presets_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT studio_fx_presets_kind_chk CHECK (kind IN ('chain', 'set')),
  CONSTRAINT studio_fx_presets_payload_chk CHECK (
    jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 32768
  )
);

CREATE INDEX IF NOT EXISTS studio_fx_presets_owner_idx ON public.studio_fx_presets (owner_id, created_at DESC);

-- Hard cap 50 per user (plan-policy GOLD max); plan limits are checked by the API.
CREATE OR REPLACE FUNCTION public.studio_fx_presets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (
    SELECT count(*) FROM public.studio_fx_presets x WHERE x.owner_id = NEW.owner_id
  ) >= 50 THEN
    RAISE EXCEPTION 'FX_PRESET_LIMIT' USING errcode = '54000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_id <> OLD.owner_id THEN
    RAISE EXCEPTION 'FX_PRESET_IMMUTABLE_OWNER' USING errcode = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_fx_presets_guard_trg ON public.studio_fx_presets;
CREATE TRIGGER studio_fx_presets_guard_trg
  BEFORE INSERT OR UPDATE ON public.studio_fx_presets
  FOR EACH ROW EXECUTE FUNCTION public.studio_fx_presets_guard();

REVOKE ALL ON FUNCTION public.studio_fx_presets_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_fx_presets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_fx_presets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_fx_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_fx_presets TO service_role;

DROP POLICY IF EXISTS studio_fx_presets_owner_select ON public.studio_fx_presets;
CREATE POLICY studio_fx_presets_owner_select
  ON public.studio_fx_presets FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

COMMENT ON TABLE public.studio_fx_presets IS
  'Studio gaps P0: own vocal FX presets (chain) and role sets (set). Writes via service_role API only.';
