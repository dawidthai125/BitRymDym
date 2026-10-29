-- Upload filter (auto check) for USER beats: own-catalog Chromaprint match,
-- AcoustID lookup, vocal detection. Worker = service_role on the E3 host.
-- Never auto-publishes. Approve/Publish of USER beats requires a cleared
-- (passed or overridden) check bound to the CURRENT active master.

CREATE TYPE public.beat_auto_check_status AS ENUM (
  'pending',
  'running',
  'passed',
  'rejected_vocals',
  'rejected_match',
  'error'
);

CREATE TABLE public.beat_auto_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  master_asset_id uuid NOT NULL REFERENCES public.beat_audio_assets (id) ON DELETE RESTRICT,
  checksum_sha256 text NOT NULL,
  status public.beat_auto_check_status NOT NULL DEFAULT 'pending',
  providers jsonb NOT NULL DEFAULT '{}'::jsonb,
  recognition_score numeric(5,4),
  vocal_ratio numeric(5,4),
  vocal_confidence numeric(5,4),
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_pl text,
  error_code text,
  attempt integer NOT NULL DEFAULT 0,
  worker_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  timeout_at timestamptz,
  appeal_requested_at timestamptz,
  appeal_note text,
  overridden_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  overridden_at timestamptz,
  override_decision_id uuid REFERENCES public.beat_moderation_decisions (id) ON DELETE RESTRICT,
  CONSTRAINT beat_auto_checks_checksum_chk CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT beat_auto_checks_attempt_chk CHECK (attempt BETWEEN 0 AND 3),
  CONSTRAINT beat_auto_checks_scores_chk CHECK (
    (recognition_score IS NULL OR recognition_score BETWEEN 0 AND 1)
    AND (vocal_ratio IS NULL OR vocal_ratio BETWEEN 0 AND 1)
    AND (vocal_confidence IS NULL OR vocal_confidence BETWEEN 0 AND 1)
  ),
  CONSTRAINT beat_auto_checks_appeal_note_chk CHECK (
    appeal_note IS NULL OR char_length(btrim(appeal_note)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT beat_auto_checks_override_shape_chk CHECK (
    (overridden_at IS NULL AND overridden_by IS NULL AND override_decision_id IS NULL)
    OR (overridden_at IS NOT NULL AND overridden_by IS NOT NULL AND override_decision_id IS NOT NULL)
  )
);

CREATE INDEX beat_auto_checks_beat_idx ON public.beat_auto_checks (beat_id, created_at DESC);
CREATE INDEX beat_auto_checks_queue_idx ON public.beat_auto_checks (status, created_at)
  WHERE status IN ('pending', 'running');
CREATE UNIQUE INDEX beat_auto_checks_one_open_uidx
  ON public.beat_auto_checks (beat_id, checksum_sha256)
  WHERE status IN ('pending', 'running');

CREATE TABLE public.beat_audio_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats (id) ON DELETE RESTRICT,
  master_asset_id uuid NOT NULL REFERENCES public.beat_audio_assets (id) ON DELETE RESTRICT,
  checksum_sha256 text NOT NULL,
  algorithm text NOT NULL DEFAULT 'chromaprint-raw-v1',
  duration_seconds numeric(8,2) NOT NULL,
  fingerprint integer[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beat_audio_fingerprints_checksum_chk CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT beat_audio_fingerprints_nonempty_chk CHECK (cardinality(fingerprint) > 0),
  CONSTRAINT beat_audio_fingerprints_asset_uq UNIQUE (master_asset_id, algorithm)
);
CREATE INDEX beat_audio_fingerprints_beat_idx ON public.beat_audio_fingerprints (beat_id);

ALTER TABLE public.beat_moderation_decisions
  DROP CONSTRAINT beat_moderation_decisions_decision_chk;
ALTER TABLE public.beat_moderation_decisions
  ADD CONSTRAINT beat_moderation_decisions_decision_chk CHECK (decision IN (
    'dismissed_no_publish',
    'still_blocked',
    'needs_new_master',
    'hash_block',
    'hash_lift',
    'auto_check_override'
  ));

-- ---------------------------------------------------------------------------
-- Grants: prod default privileges give anon/authenticated ALL on new tables.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.beat_auto_checks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beat_audio_fingerprints FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, beat_id, status, summary_pl, created_at, finished_at,
  appeal_requested_at, overridden_at
) ON public.beat_auto_checks TO authenticated;
GRANT ALL ON public.beat_auto_checks TO service_role;
GRANT ALL ON public.beat_audio_fingerprints TO service_role;
REVOKE ALL ON TYPE public.beat_auto_check_status FROM PUBLIC, anon;
GRANT USAGE ON TYPE public.beat_auto_check_status TO authenticated, service_role;

ALTER TABLE public.beat_auto_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_audio_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY beat_auto_checks_select_owner_or_staff
  ON public.beat_auto_checks
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.beats b
      WHERE b.id = beat_auto_checks.beat_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );
-- beat_audio_fingerprints: no policies → service_role only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beat_auto_check_cleared(p_beat_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset_id uuid;
  v_checksum text;
  v_n integer;
  v_status public.beat_auto_check_status;
  v_overridden timestamptz;
BEGIN
  SELECT count(*), max(a.id::text)::uuid, max(a.checksum_sha256)
  INTO v_n, v_asset_id, v_checksum
  FROM public.beat_audio_assets a
  WHERE a.beat_id = p_beat_id
    AND a.purpose = 'MASTER'
    AND a.is_active
    AND a.status = 'READY';
  IF v_n IS DISTINCT FROM 1 OR v_checksum IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.status, c.overridden_at
  INTO v_status, v_overridden
  FROM public.beat_auto_checks c
  WHERE c.beat_id = p_beat_id
    AND c.master_asset_id = v_asset_id
    AND c.checksum_sha256 = v_checksum
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN v_status = 'passed'
    OR (v_overridden IS NOT NULL AND v_status IN ('rejected_vocals', 'rejected_match'));
END;
$$;

CREATE OR REPLACE FUNCTION public.beats_auto_check_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.ownership_type = 'USER'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('APPROVED', 'PUBLISHED')
     AND NOT public.beat_auto_check_cleared(NEW.id) THEN
    RAISE EXCEPTION 'AUTO_CHECK_NOT_CLEARED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER beats_auto_check_gate
BEFORE UPDATE OF status ON public.beats
FOR EACH ROW
EXECUTE FUNCTION public.beats_auto_check_gate();

-- Enqueue for the current active master (service_role; called from submitUserBeat).
CREATE OR REPLACE FUNCTION public.enqueue_beat_auto_check(p_beat_id uuid)
RETURNS public.beat_auto_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset_id uuid;
  v_checksum text;
  v_n integer;
  v_row public.beat_auto_checks;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may enqueue_beat_auto_check';
  END IF;
  SELECT count(*), max(a.id::text)::uuid, max(a.checksum_sha256)
  INTO v_n, v_asset_id, v_checksum
  FROM public.beat_audio_assets a
  WHERE a.beat_id = p_beat_id AND a.purpose = 'MASTER' AND a.is_active AND a.status = 'READY';
  IF v_n IS DISTINCT FROM 1 OR v_checksum IS NULL THEN
    RAISE EXCEPTION 'AUTO_CHECK_NO_ACTIVE_MASTER' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.beat_auto_checks c
  WHERE c.beat_id = p_beat_id AND c.checksum_sha256 = v_checksum
    AND c.status IN ('pending', 'running')
  LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.beat_auto_checks (beat_id, master_asset_id, checksum_sha256)
  VALUES (p_beat_id, v_asset_id, v_checksum)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Claim next (service_role). Reclaims timed-out running checks up to 3 attempts.
CREATE OR REPLACE FUNCTION public.claim_next_beat_auto_check(
  p_worker_ref text,
  p_timeout_seconds integer DEFAULT 1800
)
RETURNS SETOF public.beat_auto_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_ref text := nullif(btrim(p_worker_ref), '');
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may claim_next_beat_auto_check';
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'worker_ref required';
  END IF;

  -- Exhausted attempts → error (beat stays PENDING_REVIEW, never passes).
  UPDATE public.beat_auto_checks
  SET status = 'error', error_code = 'timeout', finished_at = v_now,
      summary_pl = 'Automatyczne sprawdzenie nie powiodło się. Bit czeka na moderację.'
  WHERE status = 'running' AND timeout_at < v_now AND attempt >= 3;

  SELECT c.id INTO v_id
  FROM public.beat_auto_checks c
  WHERE c.status = 'pending'
     OR (c.status = 'running' AND c.timeout_at < v_now AND c.attempt < 3)
  ORDER BY c.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.beat_auto_checks c
  SET status = 'running', attempt = c.attempt + 1, worker_ref = v_ref,
      started_at = v_now,
      timeout_at = v_now + make_interval(secs => greatest(60, least(p_timeout_seconds, 7200)))
  WHERE c.id = v_id
  RETURNING c.*;
END;
$$;

-- Complete (service_role). Auto-rejects the beat only if still PENDING_REVIEW
-- and the check is bound to the current active master.
CREATE OR REPLACE FUNCTION public.complete_beat_auto_check(
  p_check_id uuid,
  p_worker_ref text,
  p_status public.beat_auto_check_status,
  p_providers jsonb,
  p_results jsonb,
  p_recognition_score numeric,
  p_vocal_ratio numeric,
  p_vocal_confidence numeric,
  p_summary_pl text,
  p_error_code text
)
RETURNS public.beat_auto_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.beat_auto_checks;
  v_active boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may complete_beat_auto_check';
  END IF;
  IF p_status NOT IN ('passed', 'rejected_vocals', 'rejected_match', 'error') THEN
    RAISE EXCEPTION 'AUTO_CHECK_BAD_FINAL_STATUS';
  END IF;

  UPDATE public.beat_auto_checks c
  SET status = p_status,
      providers = coalesce(p_providers, '{}'::jsonb),
      results = coalesce(p_results, '{}'::jsonb),
      recognition_score = p_recognition_score,
      vocal_ratio = p_vocal_ratio,
      vocal_confidence = p_vocal_confidence,
      summary_pl = p_summary_pl,
      error_code = p_error_code,
      finished_at = clock_timestamp()
  WHERE c.id = p_check_id AND c.status = 'running' AND c.worker_ref = p_worker_ref
  RETURNING c.* INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTO_CHECK_NOT_CLAIMED' USING ERRCODE = 'P0001';
  END IF;

  IF p_status IN ('rejected_vocals', 'rejected_match') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.beat_audio_assets a
      WHERE a.id = v_row.master_asset_id AND a.is_active AND a.status = 'READY'
        AND a.checksum_sha256 = v_row.checksum_sha256
    ) INTO v_active;
    IF v_active THEN
      UPDATE public.beats b
      SET status = 'REJECTED',
          rejection_reason = left(coalesce(p_summary_pl, 'Odrzucone przez filtr automatyczny.'), 2000)
      WHERE b.id = v_row.beat_id AND b.status = 'PENDING_REVIEW' AND b.ownership_type = 'USER';
    END IF;
  END IF;
  RETURN v_row;
END;
$$;

-- Owner appeal of an auto-reject (authenticated owner).
CREATE OR REPLACE FUNCTION public.request_beat_auto_check_appeal(p_check_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  UPDATE public.beat_auto_checks c
  SET appeal_requested_at = clock_timestamp(),
      appeal_note = nullif(btrim(left(coalesce(p_note, ''), 2000)), '')
  FROM public.beats b
  WHERE c.id = p_check_id
    AND b.id = c.beat_id
    AND b.owner_id = v_uid
    AND c.status IN ('rejected_vocals', 'rejected_match')
    AND c.overridden_at IS NULL
    AND c.appeal_requested_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTO_CHECK_APPEAL_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Moderator override of an auto-reject (service_role on behalf of a verified
-- staff actor; app layer enforces beats.approve + not own beat). Logged.
CREATE OR REPLACE FUNCTION public.override_beat_auto_check(
  p_check_id uuid,
  p_actor_id uuid,
  p_reason text
)
RETURNS public.beat_auto_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.beat_auto_checks;
  v_owner uuid;
  v_decision uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may override_beat_auto_check';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'AUTO_CHECK_OVERRIDE_REASON_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_actor_id AND p.role IN ('ADMIN', 'MODERATOR')
  ) THEN
    RAISE EXCEPTION 'AUTO_CHECK_OVERRIDE_FORBIDDEN';
  END IF;

  SELECT c.* INTO v_row FROM public.beat_auto_checks c WHERE c.id = p_check_id FOR UPDATE;
  IF NOT FOUND OR v_row.status NOT IN ('rejected_vocals', 'rejected_match')
     OR v_row.overridden_at IS NOT NULL THEN
    RAISE EXCEPTION 'AUTO_CHECK_OVERRIDE_NOT_ALLOWED';
  END IF;
  SELECT b.owner_id INTO v_owner FROM public.beats b WHERE b.id = v_row.beat_id;
  IF v_owner = p_actor_id THEN
    RAISE EXCEPTION 'AUTO_CHECK_OVERRIDE_OWN_BEAT';
  END IF;

  INSERT INTO public.beat_moderation_decisions (beat_id, checksum_sha256, actor_id, decision, reason)
  VALUES (v_row.beat_id, v_row.checksum_sha256, p_actor_id, 'auto_check_override', btrim(p_reason))
  RETURNING id INTO v_decision;

  UPDATE public.beat_auto_checks c
  SET overridden_at = clock_timestamp(), overridden_by = p_actor_id, override_decision_id = v_decision
  WHERE c.id = p_check_id
  RETURNING c.* INTO v_row;

  -- Back to the moderation queue (never published here).
  UPDATE public.beats b
  SET status = 'PENDING_REVIEW', rejection_reason = NULL
  WHERE b.id = v_row.beat_id AND b.status = 'REJECTED'
    AND public.beat_auto_check_cleared(b.id);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.beat_auto_check_cleared(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.beats_auto_check_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_beat_auto_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_beat_auto_check(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_beat_auto_check(uuid, text, public.beat_auto_check_status, jsonb, jsonb, numeric, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_beat_auto_check_appeal(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.override_beat_auto_check(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beat_auto_check_cleared(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_beat_auto_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_beat_auto_check(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_beat_auto_check(uuid, text, public.beat_auto_check_status, jsonb, jsonb, numeric, numeric, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_beat_auto_check_appeal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_beat_auto_check(uuid, uuid, text) TO service_role;

COMMENT ON TABLE public.beat_auto_checks IS
  'Upload filter results per master checksum. Owner sees status/summary columns only; full results via service_role (staff UI). Never auto-publishes.';
