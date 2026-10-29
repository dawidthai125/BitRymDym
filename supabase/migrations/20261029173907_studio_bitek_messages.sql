-- Stage 2b — BITEK per project: chat history, BITEK notes (fixes, tips,
-- welcome) and the bubble state. Applied to production 2026-10-29.
--
-- Access: owner of the project (read) and service_role (read/write via API
-- routes, which check ownership). Bounded: CHECKs on size + trim trigger
-- keeps the newest 200 rows per project and one "state" row.

CREATE TABLE IF NOT EXISTS public.studio_bitek_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  kind text NOT NULL,
  content text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_bitek_messages_role_chk CHECK (role IN ('user', 'assistant')),
  CONSTRAINT studio_bitek_messages_kind_chk CHECK (kind IN ('chat', 'welcome', 'note', 'fix', 'state')),
  CONSTRAINT studio_bitek_messages_content_len_chk CHECK (char_length(content) BETWEEN 1 AND 4000),
  CONSTRAINT studio_bitek_messages_meta_chk CHECK (
    jsonb_typeof(meta) = 'object' AND pg_column_size(meta) <= 8192
  ),
  CONSTRAINT studio_bitek_messages_user_chat_chk CHECK (role = 'assistant' OR kind = 'chat')
);

CREATE INDEX IF NOT EXISTS studio_bitek_messages_project_created_idx
  ON public.studio_bitek_messages (project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS studio_bitek_messages_owner_idx
  ON public.studio_bitek_messages (owner_id);

-- Owner must match the project owner (no cross-project writes even via service_role bugs).
CREATE OR REPLACE FUNCTION public.studio_bitek_messages_guard()
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
    RAISE EXCEPTION 'BITEK_PROJECT_OWNER_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.studio_bitek_messages_trim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind = 'state' THEN
    DELETE FROM public.studio_bitek_messages m
    WHERE m.project_id = NEW.project_id
      AND m.kind = 'state'
      AND m.id IN (
        SELECT x.id FROM public.studio_bitek_messages x
        WHERE x.project_id = NEW.project_id AND x.kind = 'state'
        ORDER BY x.created_at DESC, x.id DESC
        OFFSET 1
      );
  END IF;
  DELETE FROM public.studio_bitek_messages m
  WHERE m.project_id = NEW.project_id
    AND m.kind <> 'state'
    AND m.id IN (
      SELECT x.id FROM public.studio_bitek_messages x
      WHERE x.project_id = NEW.project_id AND x.kind <> 'state'
      ORDER BY x.created_at DESC, x.id DESC
      OFFSET 200
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS studio_bitek_messages_guard_trg ON public.studio_bitek_messages;
CREATE TRIGGER studio_bitek_messages_guard_trg
  BEFORE INSERT ON public.studio_bitek_messages
  FOR EACH ROW EXECUTE FUNCTION public.studio_bitek_messages_guard();

DROP TRIGGER IF EXISTS studio_bitek_messages_trim_trg ON public.studio_bitek_messages;
CREATE TRIGGER studio_bitek_messages_trim_trg
  AFTER INSERT ON public.studio_bitek_messages
  FOR EACH ROW EXECUTE FUNCTION public.studio_bitek_messages_trim();

REVOKE ALL ON FUNCTION public.studio_bitek_messages_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.studio_bitek_messages_trim() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.studio_bitek_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_bitek_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_bitek_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.studio_bitek_messages TO service_role;

DROP POLICY IF EXISTS studio_bitek_messages_owner_select ON public.studio_bitek_messages;
CREATE POLICY studio_bitek_messages_owner_select
  ON public.studio_bitek_messages
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.studio_projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.studio_bitek_messages IS
  'Stage 2b BITEK per project (chat, notes, welcome, bubble state). Writes via service_role API only; trimmed to 200 rows/project.';
