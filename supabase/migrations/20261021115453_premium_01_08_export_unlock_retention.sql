-- PREMIUM-01…08 foundation (local migration file — do NOT apply to production).
-- Additive: render_job_tier values, premium_works, credit periods, unlocks, audit.
-- SFM matrices / grants intentionally untouched (D-4).
-- RLS: mutations service_role only; authenticated SELECT own rows.

-- ---------------------------------------------------------------------------
-- render_job_tier extensions (PREMIUM-05)
-- ---------------------------------------------------------------------------
ALTER TYPE public.render_job_tier ADD VALUE IF NOT EXISTS 'MP3_256';
ALTER TYPE public.render_job_tier ADD VALUE IF NOT EXISTS 'WAV_PRO';
ALTER TYPE public.render_job_tier ADD VALUE IF NOT EXISTS 'WAV_MASTER';

-- ---------------------------------------------------------------------------
-- premium_works — R1 WORK_READY + single retention_expires_at
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.premium_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  domain text NOT NULL,
  domain_ref uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  work_ready_at timestamptz,
  retention_expires_at timestamptz,
  unlock_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_works_domain_chk
    CHECK (domain IN ('TAKE', 'STUDIO_PROJECT')),
  CONSTRAINT premium_works_status_chk
    CHECK (status IN ('DRAFT', 'WORK_READY', 'EXPIRED', 'DELETED')),
  CONSTRAINT premium_works_unlock_count_chk
    CHECK (unlock_count >= 0 AND unlock_count <= 1),
  CONSTRAINT premium_works_ready_retention_chk
    CHECK (
      (status <> 'WORK_READY')
      OR (work_ready_at IS NOT NULL AND retention_expires_at IS NOT NULL)
    ),
  CONSTRAINT premium_works_domain_ref_uidx UNIQUE (domain, domain_ref)
);

CREATE INDEX IF NOT EXISTS premium_works_owner_idx
  ON public.premium_works (owner_id);

CREATE INDEX IF NOT EXISTS premium_works_retention_idx
  ON public.premium_works (retention_expires_at)
  WHERE status = 'WORK_READY' AND retention_expires_at IS NOT NULL;

CREATE TRIGGER premium_works_set_updated_at
BEFORE UPDATE ON public.premium_works
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_premium_works_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may mutate premium_works';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER premium_works_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.premium_works
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_works_privilege_escalation();

ALTER TABLE public.premium_works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_works_select_own ON public.premium_works;
CREATE POLICY premium_works_select_own
  ON public.premium_works
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.premium_works FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.premium_works TO authenticated;
GRANT ALL ON TABLE public.premium_works TO service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_works_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- premium_credit_periods — 7d from activation (not calendar week)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.premium_credit_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  period_index integer NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  granted integer NOT NULL,
  consumed integer NOT NULL DEFAULT 0,
  activated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_credit_periods_counts_chk
    CHECK (granted >= 0 AND consumed >= 0 AND consumed <= granted),
  CONSTRAINT premium_credit_periods_window_chk
    CHECK (period_end > period_start),
  CONSTRAINT premium_credit_periods_user_period_uidx
    UNIQUE (user_id, period_index, activated_at)
);

CREATE INDEX IF NOT EXISTS premium_credit_periods_user_window_idx
  ON public.premium_credit_periods (user_id, period_start, period_end);

CREATE TRIGGER premium_credit_periods_set_updated_at
BEFORE UPDATE ON public.premium_credit_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_premium_credit_periods_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may mutate premium_credit_periods';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER premium_credit_periods_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.premium_credit_periods
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_credit_periods_privilege_escalation();

ALTER TABLE public.premium_credit_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_credit_periods_select_own
  ON public.premium_credit_periods;
CREATE POLICY premium_credit_periods_select_own
  ON public.premium_credit_periods
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.premium_credit_periods
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.premium_credit_periods TO authenticated;
GRANT ALL ON TABLE public.premium_credit_periods TO service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_credit_periods_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- premium_track_unlocks — sticky unlock (max 1 / work)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.premium_track_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.premium_works (id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  retention_expires_at timestamptz NOT NULL,
  credit_period_id uuid REFERENCES public.premium_credit_periods (id)
    ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_track_unlocks_user_work_uidx UNIQUE (user_id, work_id),
  CONSTRAINT premium_track_unlocks_user_idem_uidx
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS premium_track_unlocks_work_idx
  ON public.premium_track_unlocks (work_id);

CREATE OR REPLACE FUNCTION public.prevent_premium_track_unlocks_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may mutate premium_track_unlocks';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER premium_track_unlocks_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.premium_track_unlocks
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_track_unlocks_privilege_escalation();

ALTER TABLE public.premium_track_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_track_unlocks_select_own
  ON public.premium_track_unlocks;
CREATE POLICY premium_track_unlocks_select_own
  ON public.premium_track_unlocks
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.premium_track_unlocks
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.premium_track_unlocks TO authenticated;
GRANT ALL ON TABLE public.premium_track_unlocks TO service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_track_unlocks_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- premium_unlock_events — audit (append-only via service_role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.premium_unlock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  work_id uuid REFERENCES public.premium_works (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_unlock_events_type_chk
    CHECK (
      event_type IN (
        'UNLOCK_OK',
        'UNLOCK_REUSED',
        'UNLOCK_DENIED',
        'CREDIT_CONSUMED',
        'RETENTION_RENEWED',
        'MARK_WORK_READY',
        'EXPIRE_WORK'
      )
    )
);

CREATE INDEX IF NOT EXISTS premium_unlock_events_user_idx
  ON public.premium_unlock_events (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_premium_unlock_events_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may mutate premium_unlock_events';
  END IF;
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'premium_unlock_events is append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER premium_unlock_events_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.premium_unlock_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_unlock_events_privilege_escalation();

ALTER TABLE public.premium_unlock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_unlock_events_select_own
  ON public.premium_unlock_events;
CREATE POLICY premium_unlock_events_select_own
  ON public.premium_unlock_events
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.premium_unlock_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.premium_unlock_events TO authenticated;
GRANT ALL ON TABLE public.premium_unlock_events TO service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_unlock_events_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic unlock RPC (PREMIUM-02)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_unlock_work(
  p_user_id uuid,
  p_work_id uuid,
  p_idempotency_key text,
  p_granted integer,
  p_activated_at timestamptz,
  p_now timestamptz,
  p_retention_days integer
)
RETURNS TABLE (
  unlock_id uuid,
  work_id uuid,
  reused boolean,
  retention_expires_at timestamptz,
  credits_remaining integer,
  denied_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work public.premium_works%ROWTYPE;
  v_existing public.premium_track_unlocks%ROWTYPE;
  v_period public.premium_credit_periods%ROWTYPE;
  v_period_ms bigint := 7::bigint * 24 * 60 * 60 * 1000;
  v_elapsed bigint;
  v_period_index integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_new_expiry timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may call premium_unlock_work';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key required';
  END IF;

  IF p_granted < 0 OR p_retention_days <= 0 THEN
    RAISE EXCEPTION 'invalid granted/retention';
  END IF;

  SELECT * INTO v_work
  FROM public.premium_works w
  WHERE w.id = p_work_id
  FOR UPDATE;

  IF NOT FOUND THEN
    unlock_id := NULL;
    work_id := p_work_id;
    reused := false;
    retention_expires_at := NULL;
    credits_remaining := NULL;
    denied_reason := 'WORK_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_work.owner_id IS DISTINCT FROM p_user_id THEN
    unlock_id := NULL;
    work_id := p_work_id;
    reused := false;
    retention_expires_at := v_work.retention_expires_at;
    credits_remaining := NULL;
    denied_reason := 'NOT_OWNER';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_work.status <> 'WORK_READY'
     OR v_work.retention_expires_at IS NULL
     OR v_work.retention_expires_at <= p_now THEN
    unlock_id := NULL;
    work_id := p_work_id;
    reused := false;
    retention_expires_at := v_work.retention_expires_at;
    credits_remaining := NULL;
    denied_reason := 'EXPIRED_OR_NOT_READY';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Idempotent unlock by key
  SELECT * INTO v_existing
  FROM public.premium_track_unlocks u
  WHERE u.user_id = p_user_id AND u.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.work_id IS DISTINCT FROM p_work_id THEN
      unlock_id := NULL;
      work_id := p_work_id;
      reused := false;
      retention_expires_at := v_work.retention_expires_at;
      credits_remaining := NULL;
      denied_reason := 'KEY_REUSE';
      RETURN NEXT;
      RETURN;
    END IF;
    unlock_id := v_existing.id;
    work_id := v_existing.work_id;
    reused := true;
    retention_expires_at := v_existing.retention_expires_at;
    credits_remaining := NULL;
    denied_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Sticky: already unlocked this work
  SELECT * INTO v_existing
  FROM public.premium_track_unlocks u
  WHERE u.user_id = p_user_id AND u.work_id = p_work_id;

  IF FOUND THEN
    unlock_id := v_existing.id;
    work_id := v_existing.work_id;
    reused := true;
    retention_expires_at := v_existing.retention_expires_at;
    credits_remaining := NULL;
    denied_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_work.unlock_count >= 1 THEN
    unlock_id := NULL;
    work_id := p_work_id;
    reused := false;
    retention_expires_at := v_work.retention_expires_at;
    credits_remaining := NULL;
    denied_reason := 'ALREADY_UNLOCKED';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_granted <= 0 THEN
    unlock_id := NULL;
    work_id := p_work_id;
    reused := false;
    retention_expires_at := v_work.retention_expires_at;
    credits_remaining := 0;
    denied_reason := 'NO_CREDITS';
    RETURN NEXT;
    RETURN;
  END IF;

  v_elapsed := GREATEST(
    0,
    (EXTRACT(EPOCH FROM (p_now - p_activated_at)) * 1000)::bigint
  );
  v_period_index := (v_elapsed / v_period_ms)::integer;
  v_period_start := p_activated_at + (v_period_index * (v_period_ms || ' milliseconds')::interval);
  v_period_end := v_period_start + (v_period_ms || ' milliseconds')::interval;

  INSERT INTO public.premium_credit_periods (
    user_id, period_index, period_start, period_end, granted, consumed, activated_at
  ) VALUES (
    p_user_id, v_period_index, v_period_start, v_period_end, p_granted, 0, p_activated_at
  )
  ON CONFLICT (user_id, period_index, activated_at) DO NOTHING;

  SELECT * INTO v_period
  FROM public.premium_credit_periods c
  WHERE c.user_id = p_user_id
    AND c.period_index = v_period_index
    AND c.activated_at = p_activated_at
  FOR UPDATE;

  IF v_period.consumed >= v_period.granted THEN
    unlock_id := NULL;
    work_id := p_work_id;
    reused := false;
    retention_expires_at := v_work.retention_expires_at;
    credits_remaining := 0;
    denied_reason := 'NO_CREDITS';
    RETURN NEXT;
    RETURN;
  END IF;

  v_new_expiry := p_now + make_interval(days => p_retention_days);

  UPDATE public.premium_credit_periods
  SET consumed = consumed + 1
  WHERE id = v_period.id;

  INSERT INTO public.premium_track_unlocks (
    user_id, work_id, unlocked_at, retention_expires_at, credit_period_id, idempotency_key
  ) VALUES (
    p_user_id, p_work_id, p_now, v_new_expiry, v_period.id, p_idempotency_key
  )
  RETURNING * INTO v_existing;

  UPDATE public.premium_works
  SET unlock_count = 1,
      retention_expires_at = v_new_expiry
  WHERE id = p_work_id;

  INSERT INTO public.premium_unlock_events (user_id, work_id, event_type, detail)
  VALUES (
    p_user_id,
    p_work_id,
    'UNLOCK_OK',
    jsonb_build_object(
      'unlock_id', v_existing.id,
      'retention_expires_at', v_new_expiry,
      'credit_period_id', v_period.id
    )
  );

  unlock_id := v_existing.id;
  work_id := p_work_id;
  reused := false;
  retention_expires_at := v_new_expiry;
  credits_remaining := v_period.granted - (v_period.consumed + 1);
  denied_reason := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.premium_unlock_work(
  uuid, uuid, text, integer, timestamptz, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_unlock_work(
  uuid, uuid, text, integer, timestamptz, timestamptz, integer
) TO service_role;

-- ---------------------------------------------------------------------------
-- Mark WORK_READY once (tip edits must not call this again to restart)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_mark_work_ready(
  p_user_id uuid,
  p_domain text,
  p_domain_ref uuid,
  p_now timestamptz,
  p_retention_days integer
)
RETURNS TABLE (
  work_id uuid,
  status text,
  work_ready_at timestamptz,
  retention_expires_at timestamptz,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work public.premium_works%ROWTYPE;
  v_expiry timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may call premium_mark_work_ready';
  END IF;

  IF p_domain NOT IN ('TAKE', 'STUDIO_PROJECT') THEN
    RAISE EXCEPTION 'invalid domain';
  END IF;

  IF p_retention_days <= 0 THEN
    RAISE EXCEPTION 'invalid retention';
  END IF;

  SELECT * INTO v_work
  FROM public.premium_works w
  WHERE w.domain = p_domain AND w.domain_ref = p_domain_ref
  FOR UPDATE;

  IF FOUND THEN
    IF v_work.owner_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'not owner';
    END IF;
    -- Tip edits / retries: do not restart retention
    work_id := v_work.id;
    status := v_work.status;
    work_ready_at := v_work.work_ready_at;
    retention_expires_at := v_work.retention_expires_at;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  v_expiry := p_now + make_interval(days => p_retention_days);

  INSERT INTO public.premium_works (
    owner_id, domain, domain_ref, status, work_ready_at, retention_expires_at
  ) VALUES (
    p_user_id, p_domain, p_domain_ref, 'WORK_READY', p_now, v_expiry
  )
  RETURNING * INTO v_work;

  INSERT INTO public.premium_unlock_events (user_id, work_id, event_type, detail)
  VALUES (
    p_user_id,
    v_work.id,
    'MARK_WORK_READY',
    jsonb_build_object('retention_days', p_retention_days)
  );

  work_id := v_work.id;
  status := v_work.status;
  work_ready_at := v_work.work_ready_at;
  retention_expires_at := v_work.retention_expires_at;
  created := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.premium_mark_work_ready(
  uuid, text, uuid, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_mark_work_ready(
  uuid, text, uuid, timestamptz, integer
) TO service_role;

COMMENT ON TABLE public.premium_works IS
  'PREMIUM R1 — one WORK_READY + retention_expires_at per work (TAKE|STUDIO_PROJECT).';
COMMENT ON TABLE public.premium_track_unlocks IS
  'PREMIUM — sticky track unlock; max one per (user, work); multi download free.';
COMMENT ON FUNCTION public.premium_unlock_work IS
  'Atomic credit consume + unlock + retention renew; KEY_REUSE protected.';
