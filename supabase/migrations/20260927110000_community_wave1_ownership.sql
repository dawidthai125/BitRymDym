-- Community Wave 1: USER ownership foundation + moderation AuthZ
-- Design Freeze: PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md
-- Scope: rejection_reason, permissions, RLS, trigger — NO Storage INSERT open

-- ---------------------------------------------------------------------------
-- 1. Column: rejection_reason
-- ---------------------------------------------------------------------------
ALTER TABLE public.beats
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.beats.rejection_reason IS
  'Required on PENDING_REVIEW → REJECTED; cleared on REJECTED → DRAFT and on APPROVE/PUBLISH. Not for public catalog exposure.';

-- ---------------------------------------------------------------------------
-- 2. Permissions: beats.publish + USER beats.create
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, description)
VALUES ('beats.publish', 'Publish approved beats (staff)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'ADMIN'::public.system_role, p.id
FROM public.permissions p
WHERE p.key = 'beats.publish'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'MODERATOR'::public.system_role, p.id
FROM public.permissions p
WHERE p.key = 'beats.publish'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'USER'::public.system_role, p.id
FROM public.permissions p
WHERE p.key = 'beats.create'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Trigger: prevent_beat_privilege_escalation (revised)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_beat_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_svc boolean := auth.role() IS NOT DISTINCT FROM 'service_role';
  is_adm boolean := public.is_admin();
  is_mod boolean := public.is_moderator() AND NOT public.is_admin();
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ownership_type = 'PLATFORM' AND NEW.owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'PLATFORM beats must have owner_id NULL';
    END IF;
    IF NEW.ownership_type = 'USER' AND NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'USER beats must have owner_id set';
    END IF;

    IF NOT is_svc THEN
      IF is_adm THEN
        NULL;
      ELSIF uid IS NOT NULL
            AND NEW.ownership_type = 'USER'
            AND NEW.owner_id = uid
            AND NEW.status = 'DRAFT' THEN
        NEW.rejection_reason := NULL;
      ELSE
        RAISE EXCEPTION 'Only ADMIN may insert PLATFORM beats; USER may insert own USER DRAFT only';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.ownership_type IS DISTINCT FROM OLD.ownership_type
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      IF NOT is_svc AND NOT is_adm THEN
        RAISE EXCEPTION 'Changing ownership is not allowed for this caller';
      END IF;
    END IF;

    IF is_mod THEN
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
      IF is_svc OR is_adm THEN
        NULL;
      ELSIF is_mod THEN
        IF OLD.status = 'PENDING_REVIEW' AND NEW.status = 'APPROVED' THEN
          NEW.rejection_reason := NULL;
        ELSIF OLD.status = 'PENDING_REVIEW' AND NEW.status = 'REJECTED' THEN
          IF NEW.rejection_reason IS NULL
             OR btrim(NEW.rejection_reason) = '' THEN
            RAISE EXCEPTION 'rejection_reason is required when rejecting';
          END IF;
          IF char_length(btrim(NEW.rejection_reason)) > 2000 THEN
            RAISE EXCEPTION 'rejection_reason is too long';
          END IF;
          NEW.rejection_reason := btrim(NEW.rejection_reason);
        ELSIF OLD.status = 'APPROVED'
              AND NEW.status = 'PUBLISHED'
              AND OLD.ownership_type = 'USER' THEN
          NEW.rejection_reason := NULL;
        ELSE
          RAISE EXCEPTION 'Status change is not allowed for this caller';
        END IF;
      ELSIF uid IS NOT NULL
            AND OLD.ownership_type = 'USER'
            AND OLD.owner_id = uid
            AND NEW.owner_id = uid
            AND NEW.ownership_type = 'USER' THEN
        IF OLD.status = 'DRAFT' AND NEW.status = 'PENDING_REVIEW' THEN
          NEW.rejection_reason := NULL;
        ELSIF OLD.status = 'REJECTED' AND NEW.status = 'DRAFT' THEN
          NEW.rejection_reason := NULL;
        ELSIF OLD.status IN ('DRAFT', 'REJECTED', 'PUBLISHED')
              AND NEW.status = 'ARCHIVED' THEN
          NULL;
        ELSE
          RAISE EXCEPTION 'Status change is not allowed for this caller';
        END IF;
      ELSE
        RAISE EXCEPTION 'Status change is not allowed for this caller';
      END IF;

      IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' THEN
        RAISE EXCEPTION 'PUBLISHED to DRAFT transition is not allowed';
      END IF;
    END IF;

    IF NOT is_svc AND NOT is_adm AND NOT is_mod THEN
      IF uid IS NOT NULL
         AND OLD.owner_id = uid
         AND NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
         AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'USER may not edit rejection_reason directly';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS beats_insert_admin ON public.beats;
CREATE POLICY beats_insert_admin
  ON public.beats
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS beats_insert_user_own_draft ON public.beats;
CREATE POLICY beats_insert_user_own_draft
  ON public.beats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ownership_type = 'USER'
    AND owner_id = (SELECT auth.uid())
    AND status = 'DRAFT'
  );

DROP POLICY IF EXISTS beats_update_user_own ON public.beats;
CREATE POLICY beats_update_user_own
  ON public.beats
  FOR UPDATE
  TO authenticated
  USING (
    ownership_type = 'USER'
    AND owner_id = (SELECT auth.uid())
  )
  WITH CHECK (
    ownership_type = 'USER'
    AND owner_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS beats_update_moderator_review ON public.beats;
CREATE POLICY beats_update_moderator_review
  ON public.beats
  FOR UPDATE
  TO authenticated
  USING (
    public.is_moderator()
    AND status = 'PENDING_REVIEW'
  )
  WITH CHECK (
    public.is_moderator()
    AND status IN ('APPROVED', 'REJECTED')
  );

DROP POLICY IF EXISTS beats_update_moderator_publish_user ON public.beats;
CREATE POLICY beats_update_moderator_publish_user
  ON public.beats
  FOR UPDATE
  TO authenticated
  USING (
    public.is_moderator()
    AND ownership_type = 'USER'
    AND status = 'APPROVED'
  )
  WITH CHECK (
    public.is_moderator()
    AND ownership_type = 'USER'
    AND status = 'PUBLISHED'
  );

DROP POLICY IF EXISTS beats_update_admin ON public.beats;
CREATE POLICY beats_update_admin
  ON public.beats
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
