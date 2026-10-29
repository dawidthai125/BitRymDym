-- GO-PREMIUM-68 / H2-4 — L2 atomic WORK_READY→EXPIRED fenced by retention lease.
-- Source artifact only: DO NOT apply to local/staging/prod without separate OD-62-08 GO.
-- Does NOT authorize activate, cleanup, cron wiring, or Storage fencing.
-- Requires prior lease table/RPCs from 20261029130000_premium_retention_scheduler_lease.sql.

-- Atomically: lock lease row → verify holder+token+unexpired → lock work → CAS EXPIRED.
-- App SELECT lease then separate UPDATE is forbidden as L2.
-- clock_timestamp() is read only after the lease row lock is held (F5).

CREATE OR REPLACE FUNCTION public.premium_retention_mark_expired_if_lease(
  p_work_id uuid,
  p_run_id uuid,
  p_fencing_token bigint
)
RETURNS TABLE (
  ok boolean,
  reason text,
  work_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_lease public.premium_retention_scheduler_lease%ROWTYPE;
  v_work public.premium_works%ROWTYPE;
  v_updated_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'premium_retention_worker') THEN
    RAISE EXCEPTION 'Only service_role or premium_retention_worker may call premium_retention_mark_expired_if_lease';
  END IF;

  IF p_work_id IS NULL THEN
    RAISE EXCEPTION 'work_id required';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run_id required';
  END IF;

  IF p_fencing_token IS NULL OR p_fencing_token < 0 THEN
    RAISE EXCEPTION 'fencing_token required';
  END IF;

  -- Lock singleton lease first (stable lock order: lease then work).
  SELECT *
  INTO v_lease
  FROM public.premium_retention_scheduler_lease
  WHERE lock_key = 'premium_retention_cleanup'
  FOR UPDATE;

  IF NOT FOUND THEN
    ok := false;
    reason := 'LEASE_MISSING';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  v_now := clock_timestamp();

  IF v_lease.holder_run_id IS NULL
     OR v_lease.lease_expires_at IS NULL THEN
    ok := false;
    reason := 'LEASE_MISSING';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_lease.lease_expires_at <= v_now THEN
    ok := false;
    reason := 'LEASE_EXPIRED';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_lease.holder_run_id IS DISTINCT FROM p_run_id THEN
    ok := false;
    reason := 'LEASE_MISMATCH';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_lease.fencing_token IS DISTINCT FROM p_fencing_token THEN
    ok := false;
    reason := 'STALE_TOKEN';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_work
  FROM public.premium_works
  WHERE id = p_work_id
  FOR UPDATE;

  IF NOT FOUND THEN
    ok := false;
    reason := 'WORK_NOT_FOUND';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_work.status = 'EXPIRED' THEN
    -- Do NOT treat as success of this caller's mark (safe ambiguous-retry honesty).
    ok := false;
    reason := 'ALREADY_EXPIRED';
    work_id := v_work.id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_work.status IS DISTINCT FROM 'WORK_READY' THEN
    ok := false;
    reason := 'NOT_WORK_READY';
    work_id := v_work.id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_work.retention_expires_at IS NULL
     OR v_work.retention_expires_at > v_now THEN
    ok := false;
    reason := 'RETENTION_NOT_DUE';
    work_id := v_work.id;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.premium_works AS w
  SET
    status = 'EXPIRED',
    updated_at = v_now
  WHERE w.id = p_work_id
    AND w.status = 'WORK_READY'
  RETURNING w.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    ok := false;
    reason := 'CAS_CONFLICT';
    work_id := p_work_id;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.premium_unlock_events (user_id, work_id, event_type, detail)
  VALUES (
    v_work.owner_id,
    v_work.id,
    'EXPIRE_WORK',
    jsonb_build_object(
      'source', 'premium_retention_mark_expired_if_lease',
      'fencing_token', p_fencing_token,
      'run_id', p_run_id
    )
  );

  ok := true;
  reason := 'MARKED_EXPIRED';
  work_id := v_updated_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.premium_retention_mark_expired_if_lease(uuid, uuid, bigint) IS
  'H2-4 L2: atomic lease+token fence then CAS premium_works WORK_READY→EXPIRED. service_role / premium_retention_worker. Does not fence Storage DELETE (G4-P).';

REVOKE ALL ON FUNCTION public.premium_retention_mark_expired_if_lease(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_retention_mark_expired_if_lease(uuid, uuid, bigint)
  TO service_role;
