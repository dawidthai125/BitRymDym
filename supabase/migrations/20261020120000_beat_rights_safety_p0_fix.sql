-- Rights Safety P0 fix. Does not backfill legal basis and does not change existing PUBLISHED rows.
-- Lock order for publish, review open and review close: beat row, then checksum lock row, then asset.
-- Hash block/lift takes only the checksum lock row. It must not lock a beat first.
-- Event order is next_event_seq incremented while that row is locked, so the later commit gets the higher number.
-- now(), clock_timestamp() and random UUIDs are not the order.

ALTER TABLE public.beat_rights_hash_locks
  ADD COLUMN next_event_seq bigint NOT NULL DEFAULT 0;

ALTER TABLE public.beat_blocked_audio_hashes
  ADD COLUMN event_seq bigint;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY checksum_sha256
           ORDER BY created_at, id
         ) AS seq
  FROM public.beat_blocked_audio_hashes
)
UPDATE public.beat_blocked_audio_hashes AS event
SET event_seq = ranked.seq
FROM ranked
WHERE event.id = ranked.id
  AND event.event_seq IS NULL;

UPDATE public.beat_rights_hash_locks AS hash_lock
SET next_event_seq = COALESCE((
  SELECT max(event.event_seq)
  FROM public.beat_blocked_audio_hashes AS event
  WHERE event.checksum_sha256 = hash_lock.checksum_sha256
), 0);

ALTER TABLE public.beat_blocked_audio_hashes
  ALTER COLUMN event_seq SET NOT NULL;

CREATE UNIQUE INDEX beat_blocked_audio_hashes_event_seq_uidx
  ON public.beat_blocked_audio_hashes (checksum_sha256, event_seq);

COMMENT ON COLUMN public.beat_blocked_audio_hashes.event_seq IS
  'Monotonic per checksum. Assigned only after beat_rights_hash_locks is locked FOR UPDATE. Higher number is the later committed event.';

CREATE OR REPLACE FUNCTION public.assert_beat_moderation_actor(
  p_ownership public.beat_ownership_type,
  p_owner uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NOT public.is_profile_staff(auth.uid()) THEN
    RAISE EXCEPTION 'RIGHTS_ACTOR_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_ownership = 'USER' AND p_owner IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_ATTESTATION_OWNER_MISSING' USING ERRCODE = 'P0001';
  END IF;

  IF p_ownership = 'USER' AND p_owner = auth.uid() THEN
    RAISE EXCEPTION 'RIGHTS_SELF_MODERATION' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_beat_moderation_actor(public.beat_ownership_type, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_beat_moderation_actor(public.beat_ownership_type, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_beat_moderation_actor(public.beat_ownership_type, uuid) FROM authenticated;

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
BEGIN
  SELECT owner_id, ownership_type
  INTO v_owner, v_ownership
  FROM public.beats
  WHERE id = NEW.beat_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIGHTS_BEAT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.lock_beat_rights_checksum(NEW.checksum_sha256);

  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_ACTOR_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.basis_kind = 'user_attestation' THEN
    IF v_ownership IS DISTINCT FROM 'USER' OR v_owner IS NULL THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_OWNER_MISSING' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.actor_id IS DISTINCT FROM v_owner OR auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'RIGHTS_ATTESTATION_ACTOR' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.basis_kind = 'platform_license' THEN
    IF v_ownership IS DISTINCT FROM 'PLATFORM' THEN
      RAISE EXCEPTION 'RIGHTS_LICENSE_OWNERSHIP' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until <= now() THEN
      RAISE EXCEPTION 'RIGHTS_LICENSE_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
    IF auth.uid() IS DISTINCT FROM NEW.verifier_id
       OR NOT public.is_profile_staff(auth.uid()) THEN
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
    IF NOT FOUND
       OR v_license.beat_id IS DISTINCT FROM NEW.beat_id
       OR v_license.checksum_sha256 IS DISTINCT FROM NEW.checksum_sha256 THEN
      RAISE EXCEPTION 'RIGHTS_REVOCATION_TARGET' USING ERRCODE = 'P0001';
    END IF;
    IF auth.uid() IS DISTINCT FROM NEW.verifier_id
       OR NOT public.is_profile_staff(auth.uid()) THEN
      RAISE EXCEPTION 'RIGHTS_VERIFIER_NOT_CALLER' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.beat_blocked_audio_hashes_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.checksum_sha256 IS NULL OR NEW.checksum_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'RIGHTS_CHECKSUM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NEW.actor_id IS DISTINCT FROM auth.uid()
     OR NOT public.is_profile_staff(auth.uid()) THEN
    RAISE EXCEPTION 'RIGHTS_HASH_ACTOR_NOT_CALLER' USING ERRCODE = 'P0001';
  END IF;
  -- Checksum row only. Do not lock public.beats here.
  PERFORM public.lock_beat_rights_checksum(NEW.checksum_sha256);
  UPDATE public.beat_rights_hash_locks
  SET next_event_seq = next_event_seq + 1
  WHERE checksum_sha256 = NEW.checksum_sha256
  RETURNING next_event_seq INTO NEW.event_seq;
  IF NEW.event_seq IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_CHECKSUM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

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
      ORDER BY event_seq DESC
      LIMIT 1
    ) latest
    WHERE latest.event_kind = 'block'
  );
$$;

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

  SELECT owner_id
  INTO v_owner
  FROM public.beats
  WHERE id = NEW.beat_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIGHTS_BEAT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.lock_beat_rights_checksum(NEW.checksum_sha256);

  IF TG_OP = 'INSERT' THEN
    IF NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'RIGHTS_REVIEW_OPEN_INSERT' USING ERRCODE = 'P0001';
    END IF;
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'RIGHTS_REVIEW_ACTOR' USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.is_profile_staff(auth.uid())
       AND v_owner IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'RIGHTS_REVIEW_ACTOR' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.beat_id IS DISTINCT FROM OLD.beat_id
     OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_ALREADY_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.closed_at IS NULL OR NEW.closed_by IS NULL OR NEW.close_outcome IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_CLOSE_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;

  IF v_owner IS NOT NULL AND v_owner = NEW.closed_by THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_SELF' USING ERRCODE = 'P0001';
  END IF;
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM NEW.closed_by
     OR NOT public.is_profile_staff(auth.uid()) THEN
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
  v_owner uuid;
BEGIN
  IF p_previous_status IS NULL THEN
    RAISE EXCEPTION 'RIGHTS_PUBLISH_INSERT_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

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

  PERFORM public.lock_beat_rights_checksum(v_checksum);

  SELECT checksum_sha256
  INTO v_confirmed
  FROM public.beat_audio_assets
  WHERE id = v_asset_id
  FOR SHARE;

  IF v_confirmed IS DISTINCT FROM v_checksum THEN
    RAISE EXCEPTION 'RIGHTS_MASTER_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id
  INTO v_owner
  FROM public.beats
  WHERE id = p_beat_id;

  PERFORM public.assert_beat_moderation_actor(p_ownership, v_owner);

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

CREATE OR REPLACE FUNCTION public.close_beat_rights_review(
  p_review_id uuid,
  p_outcome public.beat_review_close_outcome,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_beat uuid;
  v_checksum text;
  v_owner uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NOT public.is_profile_staff(auth.uid()) THEN
    RAISE EXCEPTION 'RIGHTS_ACTOR_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_CLOSE_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;

  SELECT beat_id, checksum_sha256
  INTO v_beat, v_checksum
  FROM public.beat_rights_reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id
  INTO v_owner
  FROM public.beats
  WHERE id = v_beat
  FOR NO KEY UPDATE;

  PERFORM public.lock_beat_rights_checksum(v_checksum);

  IF v_owner IS NOT NULL AND v_owner = auth.uid() THEN
    RAISE EXCEPTION 'RIGHTS_SELF_MODERATION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.beat_moderation_decisions (
    beat_id, checksum_sha256, actor_id, decision, reason
  ) VALUES (
    v_beat, v_checksum, auth.uid(), p_outcome::text, btrim(p_reason)
  );

  UPDATE public.beat_rights_reviews
  SET closed_at = now(),
      closed_by = auth.uid(),
      close_outcome = p_outcome
  WHERE id = p_review_id
    AND closed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIGHTS_REVIEW_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_beat;
END;
$$;

REVOKE ALL ON FUNCTION public.close_beat_rights_review(uuid, public.beat_review_close_outcome, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_beat_rights_review(uuid, public.beat_review_close_outcome, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_beat_rights_review(uuid, public.beat_review_close_outcome, text) TO authenticated;

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
$$;

COMMENT ON FUNCTION public.assert_beat_publish_rights(uuid, public.beat_status, public.beat_ownership_type) IS
  'Publish gate for INSERT and UPDATE. INSERT has no previous status and is rejected. A block committed after this transaction does not unpublish the beat.';
