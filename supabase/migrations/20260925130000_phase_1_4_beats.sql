-- Phase 1.4 — Beats Domain Foundation (metadata only)
-- ROLE ≠ ACCOUNT LEVEL.
-- Audio Storage / player / downloads = OUT OF SCOPE (Phase 1.5+).
-- OD-12 (encoding) remains OPEN.

CREATE TYPE public.beat_status AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TYPE public.beat_ownership_type AS ENUM (
  'PLATFORM',
  'USER'
);

CREATE TABLE public.beats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  ownership_type public.beat_ownership_type NOT NULL,
  title text NOT NULL,
  producer text,
  description text,
  genre text,
  style text,
  bpm integer NOT NULL,
  key text,
  scale text,
  duration_seconds integer NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  cover_ref text,
  status public.beat_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beats_title_length_chk CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 200
  ),
  CONSTRAINT beats_bpm_range_chk CHECK (bpm BETWEEN 1 AND 300),
  CONSTRAINT beats_duration_range_chk CHECK (duration_seconds BETWEEN 1 AND 180),
  CONSTRAINT beats_ownership_integrity_chk CHECK (
    (
      ownership_type = 'PLATFORM'
      AND owner_id IS NULL
    )
    OR (
      ownership_type = 'USER'
      AND owner_id IS NOT NULL
    )
  )
);

CREATE INDEX beats_status_idx ON public.beats (status);
CREATE INDEX beats_owner_id_idx ON public.beats (owner_id);
CREATE INDEX beats_status_created_at_idx ON public.beats (status, created_at DESC);

CREATE TRIGGER beats_set_updated_at
BEFORE UPDATE ON public.beats
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Staff helpers (Phase 1.3 had is_admin / current_user_role only).
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'MODERATOR'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_moderator();
$$;

-- Block unauthorized ownership / status privilege changes for non-service callers.
CREATE OR REPLACE FUNCTION public.prevent_beat_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only ADMIN may insert beats';
    END IF;
    IF NEW.ownership_type = 'PLATFORM' AND NEW.owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'PLATFORM beats must have owner_id NULL';
    END IF;
    IF NEW.ownership_type = 'USER' AND NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'USER beats must have owner_id set';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.ownership_type IS DISTINCT FROM OLD.ownership_type
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Changing ownership is not allowed for this caller';
      END IF;
    END IF;

    -- Moderators may change status only (approve/reject); no metadata edit.
    IF public.is_moderator() AND NOT public.is_admin() THEN
      IF NEW.title IS DISTINCT FROM OLD.title
         OR NEW.producer IS DISTINCT FROM OLD.producer
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.genre IS DISTINCT FROM OLD.genre
         OR NEW.style IS DISTINCT FROM OLD.style
         OR NEW.bpm IS DISTINCT FROM OLD.bpm
         OR NEW.key IS DISTINCT FROM OLD.key
         OR NEW.scale IS DISTINCT FROM OLD.scale
         OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
         OR NEW.tags IS DISTINCT FROM OLD.tags
         OR NEW.cover_ref IS DISTINCT FROM OLD.cover_ref
         OR NEW.ownership_type IS DISTINCT FROM OLD.ownership_type
         OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'MODERATOR may not edit beat metadata';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
        -- Moderators may only approve/reject (future workflow); Phase 1.4 active
        -- transitions are ADMIN-only (DRAFT↔PUBLISHED↔ARCHIVED).
        IF NOT (
          public.is_moderator()
          AND OLD.status = 'PENDING_REVIEW'
          AND NEW.status IN ('APPROVED', 'REJECTED')
        ) THEN
          RAISE EXCEPTION 'Status change is not allowed for this caller';
        END IF;
      END IF;

      -- Phase 1.4: forbid PUBLISHED → DRAFT
      IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' THEN
        RAISE EXCEPTION 'PUBLISHED to DRAFT transition is not allowed';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER beats_prevent_privilege_escalation
BEFORE INSERT OR UPDATE ON public.beats
FOR EACH ROW
EXECUTE FUNCTION public.prevent_beat_privilege_escalation();

ALTER TABLE public.beats ENABLE ROW LEVEL SECURITY;

-- Public catalog: PUBLISHED only (anon + authenticated).
CREATE POLICY beats_select_published
  ON public.beats
  FOR SELECT
  TO anon, authenticated
  USING (status = 'PUBLISHED');

-- Own rows (schema-ready for future USER-owned beats).
CREATE POLICY beats_select_own
  ON public.beats
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Staff: non-public visibility for moderation / admin.
CREATE POLICY beats_select_staff
  ON public.beats
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY beats_insert_admin
  ON public.beats
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY beats_update_admin
  ON public.beats
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Moderator may update status only for approve/reject path (enforced also by trigger).
CREATE POLICY beats_update_moderator_review
  ON public.beats
  FOR UPDATE
  TO authenticated
  USING (public.is_moderator() AND status = 'PENDING_REVIEW')
  WITH CHECK (
    public.is_moderator()
    AND status IN ('APPROVED', 'REJECTED')
  );

CREATE POLICY beats_delete_admin
  ON public.beats
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.beats TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.beats TO authenticated;
GRANT USAGE ON TYPE public.beat_status TO anon, authenticated;
GRANT USAGE ON TYPE public.beat_ownership_type TO anon, authenticated;
