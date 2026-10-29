-- Rights Safety P0. Append-only legal basis, hash events, reviews and decisions.
-- The publish gate runs for every transition into PUBLISHED, including admin and service_role.
-- A superuser who disables triggers or sets session_replication_role can bypass this.
-- Existing PUBLISHED rows are not backfilled and are not marked verified.

CREATE TYPE public.beat_rights_basis_kind AS ENUM (
  'user_attestation',
  'platform_license',
  'platform_license_revocation'
);

CREATE TYPE public.beat_hash_event_kind AS ENUM ('block', 'lift');

CREATE TYPE public.beat_rights_review_kind AS ENUM (
  'no_signal',
  'blocked_hash',
  'similar_signal',
  'error',
  'timeout',
  'uninterpretable',
  'not_run'
);

CREATE TYPE public.beat_review_close_outcome AS ENUM (
  'dismissed_no_publish',
  'still_blocked',
  'needs_new_master'
);

CREATE TABLE public.beat_rights_hash_locks (
  checksum_sha256 text PRIMARY KEY,
  CONSTRAINT beat_rights_hash_locks_checksum_chk
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.beat_rights_hash_locks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.beat_rights_hash_locks IS
  'Row lock keyed by the full SHA-256. Publication and block/lift take this row FOR UPDATE after the beat row lock. Not an advisory-lock hash, so unrelated checksums do not share a key.';

CREATE OR REPLACE FUNCTION public.lock_beat_rights_checksum(p_checksum text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_checksum IS NULL OR p_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'RIGHTS_CHECKSUM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.beat_rights_hash_locks (checksum_sha256)
  VALUES (p_checksum)
  ON CONFLICT (checksum_sha256) DO NOTHING;

  PERFORM 1
  FROM public.beat_rights_hash_locks
  WHERE checksum_sha256 = p_checksum
  FOR UPDATE;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_beat_rights_checksum(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_beat_rights_checksum(text) FROM anon;
REVOKE ALL ON FUNCTION public.lock_beat_rights_checksum(text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.is_profile_staff(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_profile_id
      AND role IN ('ADMIN', 'MODERATOR')
  );
$$;

REVOKE ALL ON FUNCTION public.is_profile_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_profile_staff(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_profile_staff(uuid) FROM authenticated;

CREATE TABLE public.beat_rights_basis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  basis_kind public.beat_rights_basis_kind NOT NULL,
  checksum_sha256 text NOT NULL,
  statement_version text NOT NULL,
  reference text,
  scope text,
  verifier_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  valid_until timestamptz,
  revokes_basis_id uuid REFERENCES public.beat_rights_basis (id) ON DELETE RESTRICT,
  CONSTRAINT beat_rights_basis_checksum_chk
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT beat_rights_basis_kind_shape_chk CHECK (
    (
      basis_kind = 'user_attestation'
      AND actor_id IS NOT NULL
      AND verifier_id IS NULL
      AND scope IS NULL
      AND reference IS NULL
      AND verified_at IS NULL
      AND valid_until IS NULL
      AND revokes_basis_id IS NULL
      AND statement_version = 'proposal-2026-10-19'
    )
    OR (
      basis_kind = 'platform_license'
      AND verifier_id IS NOT NULL
      AND verified_at IS NOT NULL
      AND actor_id IS NULL
      AND revokes_basis_id IS NULL
      AND scope = 'catalog_publication'
      AND statement_version = 'platform-license-2026-10-19'
      AND (valid_until IS NULL OR valid_until > verified_at)
    )
    OR (
      basis_kind = 'platform_license_revocation'
      AND revokes_basis_id IS NOT NULL
      AND verifier_id IS NOT NULL
      AND verified_at IS NOT NULL
      AND actor_id IS NULL
      AND scope IS NULL
      AND statement_version = 'platform-license-2026-10-19'
    )
  )
);

CREATE UNIQUE INDEX beat_rights_basis_attestation_uidx
  ON public.beat_rights_basis (beat_id, checksum_sha256, statement_version)
  WHERE basis_kind = 'user_attestation';

CREATE INDEX beat_rights_basis_license_idx
  ON public.beat_rights_basis (beat_id, checksum_sha256)
  WHERE basis_kind = 'platform_license';

CREATE INDEX beat_rights_basis_revokes_idx
  ON public.beat_rights_basis (revokes_basis_id)
  WHERE basis_kind = 'platform_license_revocation';

CREATE TABLE public.beat_blocked_audio_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checksum_sha256 text NOT NULL,
  event_kind public.beat_hash_event_kind NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beat_blocked_audio_hashes_checksum_chk
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT beat_blocked_audio_hashes_reason_chk
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000)
);

CREATE INDEX beat_blocked_audio_hashes_checksum_idx
  ON public.beat_blocked_audio_hashes (checksum_sha256, created_at DESC, id DESC);

CREATE TABLE public.beat_moderation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  checksum_sha256 text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  decision text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beat_moderation_decisions_checksum_chk
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT beat_moderation_decisions_decision_chk
    CHECK (decision IN (
      'dismissed_no_publish',
      'still_blocked',
      'needs_new_master',
      'hash_block',
      'hash_lift'
    ))
);

CREATE INDEX beat_moderation_decisions_beat_idx
  ON public.beat_moderation_decisions (beat_id, created_at DESC);

CREATE TABLE public.beat_rights_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  checksum_sha256 text NOT NULL,
  kind public.beat_rights_review_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  close_outcome public.beat_review_close_outcome,
  CONSTRAINT beat_rights_reviews_checksum_chk
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT beat_rights_reviews_close_shape_chk CHECK (
    (
      closed_at IS NULL
      AND closed_by IS NULL
      AND close_outcome IS NULL
    )
    OR (
      closed_at IS NOT NULL
      AND closed_by IS NOT NULL
      AND close_outcome IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX beat_rights_reviews_one_open_uidx
  ON public.beat_rights_reviews (beat_id, checksum_sha256)
  WHERE closed_at IS NULL;

CREATE OR REPLACE FUNCTION public.beat_rights_basis_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'RIGHTS_BASIS_IMMUTABLE' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER beat_rights_basis_no_update_delete
BEFORE UPDATE OR DELETE ON public.beat_rights_basis
FOR EACH ROW
EXECUTE FUNCTION public.beat_rights_basis_immutable();

CREATE OR REPLACE FUNCTION public.beat_blocked_audio_hashes_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'RIGHTS_HASH_HISTORY_IMMUTABLE' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER beat_blocked_audio_hashes_no_update_delete
BEFORE UPDATE OR DELETE ON public.beat_blocked_audio_hashes
FOR EACH ROW
EXECUTE FUNCTION public.beat_blocked_audio_hashes_immutable();

CREATE OR REPLACE FUNCTION public.beat_moderation_decisions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'RIGHTS_DECISION_IMMUTABLE' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER beat_moderation_decisions_no_update_delete
BEFORE UPDATE OR DELETE ON public.beat_moderation_decisions
FOR EACH ROW
EXECUTE FUNCTION public.beat_moderation_decisions_immutable();

CREATE OR REPLACE FUNCTION public.beat_rights_basis_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_ownership public.beat_ownership_type;
  v_license public.beat_rights_basis%ROWTYPE;
  v_role text := auth.role();
BEGIN
  SELECT owner_id, ownership_type
  INTO v_owner, v_ownership
  FROM public.beats
  WHERE id = NEW.beat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIGHTS_BEAT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.lock_beat_rights_checksum(NEW.checksum_sha256);

  IF NEW.basis_kind = 'user_attestation' THEN
    IF v_ownership IS DISTINCT FROM 'USER' OR v_owner IS NULL THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_OWNER_MISSING' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.actor_id IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_ACTOR' USING ERRCODE = 'P0001';
    END IF;
    IF v_role = 'authenticated' AND auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_ACTOR' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.basis_kind = 'platform_license' THEN
    IF v_ownership IS DISTINCT FROM 'PLATFORM' THEN
      RAISE EXCEPTION 'RIGHTS_LICENSE_OWNERSHIP' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until <= now() THEN
      RAISE EXCEPTION 'RIGHTS_LICENSE_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.is_profile_staff(NEW.verifier_id) THEN
      RAISE EXCEPTION 'RIGHTS_VERIFIER_NOT_STAFF' USING ERRCODE = 'P0001';
    END IF;
    IF v_role = 'authenticated' AND auth.uid() IS DISTINCT FROM NEW.verifier_id THEN
      RAISE EXCEPTION 'RIGHTS_VERIFIER_NOT_CALLER' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.reference IS NOT NULL AND btrim(NEW.reference) = '' THEN
      NEW.reference := NULL;
    END IF;
  ELSIF NEW.basis_kind = 'platform_license_revocation' THEN
    SELECT * INTO v_license
    FROM public.beat_rights_basis
    WHERE id = NEW.revokes_basis_id
      AND basis_kind = 'platform_license';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RIGHTS_REVOCATION_TARGET' USING ERRCODE = 'P0001';
    END IF;
    IF v_license.beat_id IS DISTINCT FROM NEW.beat_id
       OR v_license.checksum_sha256 IS DISTINCT FROM NEW.checksum_sha256 THEN
      RAISE EXCEPTION 'RIGHTS_REVOCATION_TARGET' USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.is_profile_staff(NEW.verifier_id) THEN
      RAISE EXCEPTION 'RIGHTS_VERIFIER_NOT_STAFF' USING ERRCODE = 'P0001';
    END IF;
    IF v_role = 'authenticated' AND auth.uid() IS DISTINCT FROM NEW.verifier_id THEN
      RAISE EXCEPTION 'RIGHTS_VERIFIER_NOT_CALLER' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER beat_rights_basis_insert_guard
BEFORE INSERT ON public.beat_rights_basis
FOR EACH ROW
EXECUTE FUNCTION public.beat_rights_basis_before_insert();

CREATE OR REPLACE FUNCTION public.beat_blocked_audio_hashes_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_profile_staff(NEW.actor_id) THEN
    RAISE EXCEPTION 'RIGHTS_HASH_ACTOR_NOT_STAFF' USING ERRCODE = 'P0001';
  END IF;
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'RIGHTS_HASH_ACTOR_NOT_CALLER' USING ERRCODE = 'P0001';
  END IF;
  -- Hash row only. Do not lock public.beats here.
  PERFORM public.lock_beat_rights_checksum(NEW.checksum_sha256);
  RETURN NEW;
END;
$$;

CREATE TRIGGER beat_blocked_audio_hashes_insert_guard
BEFORE INSERT ON public.beat_blocked_audio_hashes
FOR EACH ROW
EXECUTE FUNCTION public.beat_blocked_audio_hashes_before_insert();

CREATE OR REPLACE FUNCTION public.beat_rights_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'RIGHTS_REVIEW_OPEN_INSERT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.beat_id IS DISTINCT FROM OLD.beat_id
     OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_ALREADY_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.closed_at IS NULL OR NEW.closed_by IS NULL OR NEW.close_outcome IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_CLOSE_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id INTO v_owner FROM public.beats WHERE id = NEW.beat_id;
  IF v_owner IS NOT NULL AND v_owner = NEW.closed_by THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_SELF' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_profile_staff(NEW.closed_by) THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_CLOSER_NOT_STAFF' USING ERRCODE = 'P0001';
  END IF;
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM NEW.closed_by THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_CLOSER_NOT_CALLER' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.beat_moderation_decisions d
    WHERE d.beat_id = NEW.beat_id
      AND d.checksum_sha256 = NEW.checksum_sha256
      AND d.actor_id = NEW.closed_by
      AND d.decision = NEW.close_outcome::text
  ) THEN
    RAISE EXCEPTION 'RIGHTS_CLOSE_REQUIRES_DECISION' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER beat_rights_reviews_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.beat_rights_reviews
FOR EACH ROW
EXECUTE FUNCTION public.beat_rights_reviews_guard();

CREATE OR REPLACE FUNCTION public.hash_event_blocks_publish(p_checksum text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT event_kind
      FROM public.beat_blocked_audio_hashes
      WHERE checksum_sha256 = p_checksum
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) latest
    WHERE latest.event_kind = 'block'
  );
$$;

REVOKE ALL ON FUNCTION public.hash_event_blocks_publish(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_event_blocks_publish(text) FROM anon;
REVOKE ALL ON FUNCTION public.hash_event_blocks_publish(text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.assert_beat_publish_rights(
  p_beat_id uuid,
  p_previous_status public.beat_status,
  p_ownership public.beat_ownership_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_asset_id uuid;
  v_checksum text;
  v_confirmed text;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.beat_audio_assets
  WHERE beat_id = p_beat_id
    AND purpose = 'MASTER'
    AND is_active
    AND status = 'READY';

  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'RIGHTS_MASTER_NOT_READY' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, checksum_sha256
  INTO v_asset_id, v_checksum
  FROM public.beat_audio_assets
  WHERE beat_id = p_beat_id
    AND purpose = 'MASTER'
    AND is_active
    AND status = 'READY';

  IF v_checksum IS NULL OR v_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'RIGHTS_CHECKSUM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Beat row is already locked by the publishing UPDATE.
  PERFORM public.lock_beat_rights_checksum(v_checksum);

  SELECT checksum_sha256
  INTO v_confirmed
  FROM public.beat_audio_assets
  WHERE id = v_asset_id
  FOR SHARE;

  IF v_confirmed IS DISTINCT FROM v_checksum THEN
    RAISE EXCEPTION 'RIGHTS_MASTER_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  IF public.hash_event_blocks_publish(v_checksum) THEN
    RAISE EXCEPTION 'RIGHTS_HASH_BLOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.beat_rights_reviews
    WHERE beat_id = p_beat_id
      AND checksum_sha256 = v_checksum
      AND closed_at IS NULL
      AND kind IS DISTINCT FROM 'no_signal'
  ) THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_OPEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_ownership = 'USER' THEN
    IF p_previous_status IS DISTINCT FROM 'APPROVED' THEN
      RAISE EXCEPTION 'RIGHTS_USER_NOT_APPROVED' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.beat_rights_basis
      WHERE beat_id = p_beat_id
        AND basis_kind = 'user_attestation'
        AND checksum_sha256 = v_checksum
        AND statement_version = 'proposal-2026-10-19'
    ) THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_ownership = 'PLATFORM' THEN
    IF p_previous_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'RIGHTS_PLATFORM_NOT_DRAFT' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.beat_rights_basis license
      WHERE license.beat_id = p_beat_id
        AND license.basis_kind = 'platform_license'
        AND license.checksum_sha256 = v_checksum
        AND license.scope = 'catalog_publication'
        AND license.statement_version = 'platform-license-2026-10-19'
        AND license.verifier_id IS NOT NULL
        AND license.verified_at IS NOT NULL
        AND (license.valid_until IS NULL OR license.valid_until > now())
        AND NOT EXISTS (
          SELECT 1
          FROM public.beat_rights_basis revocation
          WHERE revocation.basis_kind = 'platform_license_revocation'
            AND revocation.revokes_basis_id = license.id
        )
    ) THEN
      RAISE EXCEPTION 'RIGHTS_LICENSE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'RIGHTS_OWNERSHIP' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_beat_publish_rights(uuid, public.beat_status, public.beat_ownership_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_beat_publish_rights(uuid, public.beat_status, public.beat_ownership_type) FROM anon;
REVOKE ALL ON FUNCTION public.assert_beat_publish_rights(uuid, public.beat_status, public.beat_ownership_type) FROM authenticated;

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
  meta_changed boolean;
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

    IF NOT is_svc AND NOT is_adm AND NOT is_mod
       AND uid IS NOT NULL
       AND OLD.ownership_type = 'USER'
       AND OLD.owner_id = uid
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND meta_changed THEN
      IF OLD.status NOT IN ('DRAFT', 'REJECTED') THEN
        RAISE EXCEPTION 'USER may not edit beat metadata in status %', OLD.status;
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

      IF NEW.status = 'PUBLISHED' THEN
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
$$;

ALTER TABLE public.beat_rights_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_blocked_audio_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_moderation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_rights_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY beat_rights_basis_select_own
  ON public.beat_rights_basis
  FOR SELECT
  TO authenticated
  USING (
    actor_id = (SELECT auth.uid())
    OR public.is_staff()
  );

CREATE POLICY beat_rights_basis_insert_own_attestation
  ON public.beat_rights_basis
  FOR INSERT
  TO authenticated
  WITH CHECK (
    basis_kind = 'user_attestation'
    AND actor_id = (SELECT auth.uid())
  );

CREATE POLICY beat_rights_basis_insert_staff_license
  ON public.beat_rights_basis
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff()
    AND basis_kind IN ('platform_license', 'platform_license_revocation')
    AND verifier_id = (SELECT auth.uid())
  );

CREATE POLICY beat_hash_events_select_staff
  ON public.beat_blocked_audio_hashes
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY beat_hash_events_insert_staff
  ON public.beat_blocked_audio_hashes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff()
    AND actor_id = (SELECT auth.uid())
  );

CREATE POLICY beat_decisions_select_staff
  ON public.beat_moderation_decisions
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY beat_decisions_insert_staff
  ON public.beat_moderation_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff()
    AND actor_id = (SELECT auth.uid())
  );

CREATE POLICY beat_reviews_select_staff
  ON public.beat_rights_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY beat_reviews_insert_staff
  ON public.beat_rights_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY beat_reviews_close_staff
  ON public.beat_rights_reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (
    public.is_staff()
    AND closed_by = (SELECT auth.uid())
  );

GRANT SELECT, INSERT ON public.beat_rights_basis TO authenticated;
GRANT SELECT, INSERT ON public.beat_blocked_audio_hashes TO authenticated;
GRANT SELECT, INSERT ON public.beat_moderation_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beat_rights_reviews TO authenticated;

COMMENT ON FUNCTION public.assert_beat_publish_rights(uuid, public.beat_status, public.beat_ownership_type) IS
  'Authoritative publish gate. A committed block after this transaction commits does not unpublish the beat; takedown is a separate action. Trigger bypass via session_replication_role is an infrastructure-owner limitation.';
