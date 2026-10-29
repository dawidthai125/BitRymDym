-- GO-PREMIUM-65 / H2-1 — Premium Retention scheduler singleton lease + fencing RPCs.
-- Source artifact only in this GO: DO NOT apply to local/staging/prod without OD-62-08.
-- Does NOT wire scheduler/executor/cron. Does NOT authorize activate/cleanup.
-- OD-62-06 TTL/heartbeat remain PROVISIONAL HOLD — RPCs take caller-supplied ttl seconds.
-- Atomicity lives inside these SECURITY DEFINER RPCs (single UPDATE CAS). App SELECT+UPDATE is forbidden.
-- G3-TCB (docs/decisions/PREMIUM_RETENTION_FENCING_CONTRACT.md): no app role holds DML on the lease row;
-- callers are service_role or premium_retention_worker (role + EXECUTE grants in 20261029130200).
-- clock_timestamp() is read only after the lease row lock is held (F5).

-- ---------------------------------------------------------------------------
-- Table: singleton lease row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.premium_retention_scheduler_lease (
  lock_key text PRIMARY KEY,
  fencing_token bigint NOT NULL DEFAULT 0
    CONSTRAINT premium_retention_scheduler_lease_token_nonneg_chk CHECK (fencing_token >= 0),
  holder_run_id uuid NULL,
  lease_expires_at timestamptz NULL,
  acquired_at timestamptz NULL,
  heartbeat_at timestamptz NULL,
  holder_meta jsonb NULL,
  CONSTRAINT premium_retention_scheduler_lease_free_consistency_chk CHECK (
    (
      holder_run_id IS NULL
      AND lease_expires_at IS NULL
      AND acquired_at IS NULL
      AND heartbeat_at IS NULL
    )
    OR (
      holder_run_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND acquired_at IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.premium_retention_scheduler_lease IS
  'H2/A3 singleton lease for premium retention cleanup. Mutations via SECURITY DEFINER lease RPCs only.';

INSERT INTO public.premium_retention_scheduler_lease (lock_key, fencing_token)
VALUES ('premium_retention_cleanup', 0)
ON CONFLICT (lock_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prevent_premium_retention_scheduler_lease_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only lease RPCs may mutate premium_retention_scheduler_lease';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS premium_retention_scheduler_lease_prevent_privilege_escalation
  ON public.premium_retention_scheduler_lease;
CREATE TRIGGER premium_retention_scheduler_lease_prevent_privilege_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.premium_retention_scheduler_lease
FOR EACH ROW
EXECUTE FUNCTION public.prevent_premium_retention_scheduler_lease_privilege_escalation();

ALTER TABLE public.premium_retention_scheduler_lease ENABLE ROW LEVEL SECURITY;

-- No policies. No role holds DML: the fencing token must not be writable by the actors it fences.
REVOKE ALL ON TABLE public.premium_retention_scheduler_lease
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.premium_retention_scheduler_lease TO service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_retention_scheduler_lease_privilege_escalation()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- acquire — idempotent for same run_id while unexpired; else CAS free/expired
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_retention_lease_acquire(
  p_run_id uuid,
  p_ttl_seconds integer
)
RETURNS TABLE (
  acquired boolean,
  reason text,
  fencing_token bigint,
  lease_expires_at timestamptz,
  holder_run_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_row public.premium_retention_scheduler_lease%ROWTYPE;
  v_updated public.premium_retention_scheduler_lease%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role or premium_retention_worker may call premium_retention_lease_acquire';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run_id required';
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 THEN
    RAISE EXCEPTION 'ttl_seconds must be positive';
  END IF;

  SELECT *
  INTO v_row
  FROM public.premium_retention_scheduler_lease
  WHERE lock_key = 'premium_retention_cleanup'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'premium_retention_scheduler_lease singleton missing';
  END IF;

  v_now := clock_timestamp();

  -- Idempotent: already held by this run and still unexpired — do not bump token.
  IF v_row.holder_run_id IS NOT DISTINCT FROM p_run_id
     AND v_row.lease_expires_at IS NOT NULL
     AND v_row.lease_expires_at > v_now THEN
    acquired := true;
    reason := 'ALREADY_HELD';
    fencing_token := v_row.fencing_token;
    lease_expires_at := v_row.lease_expires_at;
    holder_run_id := v_row.holder_run_id;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.premium_retention_scheduler_lease AS l
  SET
    fencing_token = l.fencing_token + 1,
    holder_run_id = p_run_id,
    acquired_at = v_now,
    heartbeat_at = v_now,
    lease_expires_at = v_now + make_interval(secs => p_ttl_seconds),
    holder_meta = NULL
  WHERE l.lock_key = 'premium_retention_cleanup'
    AND (
      l.holder_run_id IS NULL
      OR l.lease_expires_at IS NULL
      OR l.lease_expires_at <= v_now
    )
  RETURNING * INTO v_updated;

  IF FOUND THEN
    acquired := true;
    reason := 'ACQUIRED';
    fencing_token := v_updated.fencing_token;
    lease_expires_at := v_updated.lease_expires_at;
    holder_run_id := v_updated.holder_run_id;
    RETURN NEXT;
    RETURN;
  END IF;

  acquired := false;
  reason := 'HELD';
  fencing_token := NULL;
  lease_expires_at := v_row.lease_expires_at;
  holder_run_id := v_row.holder_run_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.premium_retention_lease_acquire(uuid, integer) IS
  'H2-1: atomic singleton lease acquire / steal. Idempotent for same run_id. service_role / premium_retention_worker.';

REVOKE ALL ON FUNCTION public.premium_retention_lease_acquire(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_acquire(uuid, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- renew — CAS holder + fencing token
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_retention_lease_renew(
  p_run_id uuid,
  p_fencing_token bigint,
  p_ttl_seconds integer
)
RETURNS TABLE (
  renewed boolean,
  reason text,
  fencing_token bigint,
  lease_expires_at timestamptz,
  holder_run_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_updated public.premium_retention_scheduler_lease%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role or premium_retention_worker may call premium_retention_lease_renew';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run_id required';
  END IF;

  IF p_fencing_token IS NULL OR p_fencing_token < 0 THEN
    RAISE EXCEPTION 'fencing_token required';
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 THEN
    RAISE EXCEPTION 'ttl_seconds must be positive';
  END IF;

  PERFORM 1
  FROM public.premium_retention_scheduler_lease
  WHERE lock_key = 'premium_retention_cleanup'
  FOR UPDATE;

  v_now := clock_timestamp();

  UPDATE public.premium_retention_scheduler_lease AS l
  SET
    heartbeat_at = v_now,
    lease_expires_at = v_now + make_interval(secs => p_ttl_seconds)
  WHERE l.lock_key = 'premium_retention_cleanup'
    AND l.holder_run_id IS NOT DISTINCT FROM p_run_id
    AND l.fencing_token = p_fencing_token
    AND l.lease_expires_at IS NOT NULL
    AND l.lease_expires_at > v_now
  RETURNING * INTO v_updated;

  IF FOUND THEN
    renewed := true;
    reason := 'RENEWED';
    fencing_token := v_updated.fencing_token;
    lease_expires_at := v_updated.lease_expires_at;
    holder_run_id := v_updated.holder_run_id;
    RETURN NEXT;
    RETURN;
  END IF;

  renewed := false;
  reason := 'LEASE_LOST';
  fencing_token := NULL;
  lease_expires_at := NULL;
  holder_run_id := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.premium_retention_lease_renew(uuid, bigint, integer) IS
  'H2-1: CAS renew of premium retention lease. service_role / premium_retention_worker.';

REVOKE ALL ON FUNCTION public.premium_retention_lease_renew(uuid, bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_renew(uuid, bigint, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- release — CAS holder + fencing token; keep fencing_token generation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_retention_lease_release(
  p_run_id uuid,
  p_fencing_token bigint
)
RETURNS TABLE (
  released boolean,
  reason text,
  fencing_token bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_updated public.premium_retention_scheduler_lease%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role or premium_retention_worker may call premium_retention_lease_release';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run_id required';
  END IF;

  IF p_fencing_token IS NULL OR p_fencing_token < 0 THEN
    RAISE EXCEPTION 'fencing_token required';
  END IF;

  UPDATE public.premium_retention_scheduler_lease AS l
  SET
    holder_run_id = NULL,
    lease_expires_at = NULL,
    acquired_at = NULL,
    heartbeat_at = NULL,
    holder_meta = NULL
  WHERE l.lock_key = 'premium_retention_cleanup'
    AND l.holder_run_id IS NOT DISTINCT FROM p_run_id
    AND l.fencing_token = p_fencing_token
  RETURNING * INTO v_updated;

  IF FOUND THEN
    released := true;
    reason := 'RELEASED';
    fencing_token := v_updated.fencing_token;
    RETURN NEXT;
    RETURN;
  END IF;

  released := false;
  reason := 'NOT_HOLDER';
  fencing_token := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.premium_retention_lease_release(uuid, bigint) IS
  'H2-1: CAS release of premium retention lease. Does not decrement fencing_token. service_role / premium_retention_worker.';

REVOKE ALL ON FUNCTION public.premium_retention_lease_release(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_release(uuid, bigint)
  TO service_role;

-- ---------------------------------------------------------------------------
-- get — read-only probe after ambiguous HTTP / timeout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_retention_lease_get()
RETURNS TABLE (
  lock_key text,
  fencing_token bigint,
  holder_run_id uuid,
  lease_expires_at timestamptz,
  acquired_at timestamptz,
  heartbeat_at timestamptz,
  is_expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row public.premium_retention_scheduler_lease%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role or premium_retention_worker may call premium_retention_lease_get';
  END IF;

  SELECT *
  INTO v_row
  FROM public.premium_retention_scheduler_lease
  WHERE premium_retention_scheduler_lease.lock_key = 'premium_retention_cleanup';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'premium_retention_scheduler_lease singleton missing';
  END IF;

  lock_key := v_row.lock_key;
  fencing_token := v_row.fencing_token;
  holder_run_id := v_row.holder_run_id;
  lease_expires_at := v_row.lease_expires_at;
  acquired_at := v_row.acquired_at;
  heartbeat_at := v_row.heartbeat_at;
  is_expired := (
    v_row.holder_run_id IS NOT NULL
    AND (
      v_row.lease_expires_at IS NULL
      OR v_row.lease_expires_at <= v_now
    )
  );
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.premium_retention_lease_get() IS
  'H2-1: read-only lease probe for ambiguous client outcomes. service_role / premium_retention_worker.';

REVOKE ALL ON FUNCTION public.premium_retention_lease_get()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_retention_lease_get()
  TO service_role;
