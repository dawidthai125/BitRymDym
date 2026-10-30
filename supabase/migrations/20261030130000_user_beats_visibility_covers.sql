-- User beats: visibility (public/private), owner usage flags (download /
-- Studio use), covers (private bucket + moderation state), server-side key
-- detection. Owner may edit metadata + settings after publish (no
-- re-moderation, Owner decision 2026-10-30); cover/key fields are
-- server-managed (service_role only) so a user cannot self-approve a cover.
--
-- NOT APPLIED automatically. Apply before deploying the feat/user-beats code.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.beats
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allow_download boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_studio_use boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS cover_thumb_path text,
  ADD COLUMN IF NOT EXISTS cover_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cover_moderation jsonb,
  ADD COLUMN IF NOT EXISTS cover_rejection_reason text,
  ADD COLUMN IF NOT EXISTS cover_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_detected text,
  ADD COLUMN IF NOT EXISTS key_confidence real;

ALTER TABLE public.beats
  DROP CONSTRAINT IF EXISTS beats_visibility_chk,
  DROP CONSTRAINT IF EXISTS beats_platform_public_chk,
  DROP CONSTRAINT IF EXISTS beats_cover_status_chk,
  DROP CONSTRAINT IF EXISTS beats_cover_path_chk,
  DROP CONSTRAINT IF EXISTS beats_cover_reason_len_chk,
  DROP CONSTRAINT IF EXISTS beats_key_detected_len_chk,
  DROP CONSTRAINT IF EXISTS beats_key_confidence_chk;

ALTER TABLE public.beats
  ADD CONSTRAINT beats_visibility_chk
    CHECK (visibility IN ('public', 'private')),
  -- PLATFORM catalogue is always public; private is a USER-beat option.
  ADD CONSTRAINT beats_platform_public_chk
    CHECK (ownership_type = 'USER' OR visibility = 'public'),
  ADD CONSTRAINT beats_cover_status_chk
    CHECK (cover_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD CONSTRAINT beats_cover_path_chk
    CHECK (
      (cover_status = 'none' AND cover_path IS NULL AND cover_thumb_path IS NULL)
      OR (cover_status <> 'none' AND cover_path IS NOT NULL AND cover_thumb_path IS NOT NULL)
    ),
  ADD CONSTRAINT beats_cover_reason_len_chk
    CHECK (cover_rejection_reason IS NULL OR char_length(cover_rejection_reason) <= 500),
  ADD CONSTRAINT beats_key_detected_len_chk
    CHECK (key_detected IS NULL OR char_length(key_detected) <= 16),
  ADD CONSTRAINT beats_key_confidence_chk
    CHECK (key_confidence IS NULL OR (key_confidence >= 0 AND key_confidence <= 1));

CREATE INDEX IF NOT EXISTS beats_cover_pending_idx
  ON public.beats (cover_updated_at)
  WHERE cover_status = 'pending';

COMMENT ON COLUMN public.beats.visibility IS
  'public = catalogue (when PUBLISHED); private = owner + active grantees + staff only.';
COMMENT ON COLUMN public.beats.allow_download IS
  'Owner switch: other users may download the master (plan limits still apply). Default ON.';
COMMENT ON COLUMN public.beats.allow_studio_use IS
  'Owner switch: other users may attach the beat in Studio / record takes. Grants override.';
COMMENT ON COLUMN public.beats.cover_status IS
  'none | pending (moderator queue) | approved (shown) | rejected. service_role only.';

-- ---------------------------------------------------------------------------
-- 2. Grant helper for RLS (SECURITY DEFINER: beat_access_grants is closed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beat_has_active_grant_for_viewer(p_beat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beat_access_grants g
    WHERE g.beat_id = p_beat_id
      AND g.grantee_user_id = (SELECT auth.uid())
      AND g.revoked_at IS NULL
      AND g.can_record = true
      AND (g.expires_at IS NULL OR g.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.beat_has_active_grant_for_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beat_has_active_grant_for_viewer(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS: private beats leave the public catalogue
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS beats_select_published ON public.beats;
CREATE POLICY beats_select_published ON public.beats
  FOR SELECT TO anon, authenticated
  USING (status = 'PUBLISHED' AND visibility = 'public');

DROP POLICY IF EXISTS beats_select_granted ON public.beats;
CREATE POLICY beats_select_granted ON public.beats
  FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED'
    AND public.beat_has_active_grant_for_viewer(id)
  );

-- beat_audio_assets_select_published uses EXISTS (SELECT … FROM beats) under
-- the caller's RLS, so private beat assets follow the beats policies above.

-- ---------------------------------------------------------------------------
-- 4. Trigger: owner edits after publish; cover/key fields server-managed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_beat_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_svc boolean := auth.role() IS NOT DISTINCT FROM 'service_role';
  is_adm boolean := public.is_admin();
  is_mod boolean := public.is_moderator() AND NOT public.is_admin();
  uid uuid := auth.uid();
  meta_changed boolean;
  server_fields_changed boolean;
  submit_cooldown interval := interval '60 seconds';
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
        NEW.last_submitted_at := NULL;
        -- Cover / key detection are server-managed.
        NEW.cover_path := NULL;
        NEW.cover_thumb_path := NULL;
        NEW.cover_status := 'none';
        NEW.cover_moderation := NULL;
        NEW.cover_rejection_reason := NULL;
        NEW.cover_updated_at := NULL;
        NEW.key_detected := NULL;
        NEW.key_confidence := NULL;
      ELSE
        RAISE EXCEPTION 'Only ADMIN may insert PLATFORM beats; USER may insert own USER DRAFT only';
      END IF;
    END IF;

    IF NEW.status = 'PUBLISHED' THEN
      PERFORM public.assert_beat_publish_rights(NEW.id, NULL, NEW.ownership_type);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.ownership_type IS DISTINCT FROM OLD.ownership_type
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      IF NOT is_svc AND NOT is_adm THEN
        RAISE EXCEPTION 'Changing ownership is not allowed for this caller';
      END IF;
    END IF;

    server_fields_changed :=
      NEW.cover_path IS DISTINCT FROM OLD.cover_path
      OR NEW.cover_thumb_path IS DISTINCT FROM OLD.cover_thumb_path
      OR NEW.cover_status IS DISTINCT FROM OLD.cover_status
      OR NEW.cover_moderation IS DISTINCT FROM OLD.cover_moderation
      OR NEW.cover_rejection_reason IS DISTINCT FROM OLD.cover_rejection_reason
      OR NEW.cover_updated_at IS DISTINCT FROM OLD.cover_updated_at
      OR NEW.key_detected IS DISTINCT FROM OLD.key_detected
      OR NEW.key_confidence IS DISTINCT FROM OLD.key_confidence;

    IF server_fields_changed AND NOT is_svc AND NOT is_adm THEN
      RAISE EXCEPTION 'Cover and key detection fields are server-managed';
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
         OR NEW.visibility IS DISTINCT FROM OLD.visibility
         OR NEW.allow_download IS DISTINCT FROM OLD.allow_download
         OR NEW.allow_studio_use IS DISTINCT FROM OLD.allow_studio_use
         OR NEW.ownership_type IS DISTINCT FROM OLD.ownership_type
         OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'MODERATOR may not edit beat metadata';
      END IF;
    END IF;

    IF NOT is_svc AND NOT is_adm
       AND NEW.last_submitted_at IS DISTINCT FROM OLD.last_submitted_at
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'last_submitted_at is server-managed';
    END IF;

    meta_changed :=
      NEW.title IS DISTINCT FROM OLD.title
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
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason;

    -- Owner 2026-10-30: edits after publish save immediately (no
    -- re-moderation). PENDING_REVIEW stays frozen while a moderator reviews;
    -- ARCHIVED is read-only.
    IF NOT is_svc AND NOT is_adm AND NOT is_mod
       AND uid IS NOT NULL
       AND OLD.ownership_type = 'USER'
       AND OLD.owner_id = uid
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND meta_changed THEN
      IF OLD.status NOT IN ('DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED') THEN
        RAISE EXCEPTION 'USER may not edit beat metadata in status %', OLD.status;
      END IF;
    END IF;

    IF NOT is_svc AND NOT is_adm AND NOT is_mod
       AND OLD.status = 'ARCHIVED'
       AND (NEW.visibility IS DISTINCT FROM OLD.visibility
            OR NEW.allow_download IS DISTINCT FROM OLD.allow_download
            OR NEW.allow_studio_use IS DISTINCT FROM OLD.allow_studio_use) THEN
      RAISE EXCEPTION 'USER may not change settings of an ARCHIVED beat';
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
          NEW.last_submitted_at := NULL;
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

      IF OLD.status = 'DRAFT' AND NEW.status = 'PENDING_REVIEW' THEN
        IF OLD.last_submitted_at IS NOT NULL
           AND OLD.last_submitted_at > (now() - submit_cooldown) THEN
          RAISE EXCEPTION 'Submit cooldown active; wait before resubmitting';
        END IF;
        NEW.last_submitted_at := now();
      END IF;

      IF OLD.status = 'REJECTED' AND NEW.status = 'DRAFT' THEN
        NEW.last_submitted_at := NULL;
      END IF;

      IF NEW.status = 'APPROVED' THEN
        PERFORM public.assert_beat_moderation_actor(NEW.ownership_type, NEW.owner_id);
      END IF;

      IF NEW.status = 'PUBLISHED' THEN
        PERFORM public.assert_beat_moderation_actor(NEW.ownership_type, NEW.owner_id);
        PERFORM public.assert_beat_publish_rights(
          NEW.id,
          OLD.status,
          NEW.ownership_type
        );
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
$function$;

-- ---------------------------------------------------------------------------
-- 5. Storage: private beat-covers bucket (served via /api/beats/[id]/cover)
-- ---------------------------------------------------------------------------
-- No storage.objects policies: anon/authenticated have no direct access; the
-- app reads/writes with service_role after its own AuthZ.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('beat-covers', 'beat-covers', false, 2097152, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 6. Audit actions
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT IF EXISTS admin_audit_events_action_chk;

ALTER TABLE public.admin_audit_events
  ADD CONSTRAINT admin_audit_events_action_chk CHECK (
    action IN (
      'ROLE_CHANGE',
      'ADMIN_GRANT',
      'ADMIN_REVOKE',
      'MODERATOR_GRANT',
      'MODERATOR_REVOKE',
      'PREMIUM_TIER_CHANGE',
      'PREMIUM_EXPIRATION_CHANGE',
      'USER_ACCOUNT_DELETE',
      'SAMPLE_POLICY_UPDATE',
      'BEAT_METADATA_UPDATE',
      'SITE_MAINTENANCE_UPDATE',
      'PLAN_ADDON_GRANT',
      'PLAN_ADDON_REVOKE',
      'BEAT_COVER_REVIEW',
      'BEAT_OWNER_UPDATE'
    )
  );
