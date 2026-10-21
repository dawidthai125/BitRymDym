-- PREMIUM local RPC gate — creates ONLY fixture users with email prefix gate_premium_
-- Cleanup at end deletes only those fixtures.
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE gate_result (
  area text,
  assertion text,
  ok boolean,
  detail text
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- Fixture users (auth.users + profiles)
DO $$
DECLARE
  u_free uuid := 'aaaaaaaa-0001-4000-8000-000000000001';
  u_bronze uuid := 'aaaaaaaa-0002-4000-8000-000000000002';
  u_silver uuid := 'aaaaaaaa-0003-4000-8000-000000000003';
  u_gold uuid := 'aaaaaaaa-0004-4000-8000-000000000004';
BEGIN
  -- cleanup leftovers from prior interrupted runs (events append-only; FK SET NULL also blocked)
  ALTER TABLE public.premium_unlock_events DISABLE TRIGGER USER;
  DELETE FROM public.premium_unlock_events WHERE user_id IN (u_free,u_bronze,u_silver,u_gold);
  DELETE FROM public.premium_track_unlocks WHERE user_id IN (u_free,u_bronze,u_silver,u_gold);
  DELETE FROM public.premium_credit_periods WHERE user_id IN (u_free,u_bronze,u_silver,u_gold);
  DELETE FROM public.premium_works WHERE owner_id IN (u_free,u_bronze,u_silver,u_gold);
  ALTER TABLE public.premium_unlock_events ENABLE TRIGGER USER;
  DELETE FROM public.profiles WHERE id IN (u_free,u_bronze,u_silver,u_gold);
  DELETE FROM auth.users WHERE id IN (u_free,u_bronze,u_silver,u_gold);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
  VALUES
    (u_free, 'authenticated', 'authenticated', 'gate_premium_free@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false),
    (u_bronze, 'authenticated', 'authenticated', 'gate_premium_bronze@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false),
    (u_silver, 'authenticated', 'authenticated', 'gate_premium_silver@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false),
    (u_gold, 'authenticated', 'authenticated', 'gate_premium_gold@local.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false);

  -- Trigger may auto-create profiles; upsert display names only.
  UPDATE public.profiles SET display_name = 'gate_free' WHERE id = u_free;
  UPDATE public.profiles SET display_name = 'gate_bronze' WHERE id = u_bronze;
  UPDATE public.profiles SET display_name = 'gate_silver' WHERE id = u_silver;
  UPDATE public.profiles SET display_name = 'gate_gold' WHERE id = u_gold;

  INSERT INTO public.profiles (id, display_name, role, account_level)
  SELECT v.id, v.dn, 'USER', 'BEGINNER_RAPPER'
  FROM (VALUES
    (u_free, 'gate_free'),
    (u_bronze, 'gate_bronze'),
    (u_silver, 'gate_silver'),
    (u_gold, 'gate_gold')
  ) AS v(id, dn)
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.id);
END $$;

-- Helper: assert RPC grant denied for authenticated role simulation
DO $$
DECLARE
  denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM * FROM public.premium_mark_work_ready(
      'aaaaaaaa-0002-4000-8000-000000000002'::uuid,
      'TAKE',
      'bbbbbbbb-0001-4000-8000-000000000001'::uuid,
      now(),
      7
    );
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  INSERT INTO gate_result VALUES (
    'security',
    'authenticated cannot call premium_mark_work_ready',
    denied,
    CASE WHEN denied THEN 'denied as expected' ELSE 'UNEXPECTED ALLOW' END
  );
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END $$;

-- Mark WORK_READY for bronze take
DO $$
DECLARE
  r record;
  w1 uuid;
  t0 timestamptz := timestamptz '2026-10-21 10:00:00+00';
  act timestamptz := timestamptz '2026-10-21 09:00:00+00';
  u uuid := 'aaaaaaaa-0002-4000-8000-000000000002';
  take uuid := 'bbbbbbbb-0001-4000-8000-000000000001';
  take2 uuid := 'bbbbbbbb-0002-4000-8000-000000000002';
  u_free uuid := 'aaaaaaaa-0001-4000-8000-000000000001';
  u_silver uuid := 'aaaaaaaa-0003-4000-8000-000000000003';
  u_gold uuid := 'aaaaaaaa-0004-4000-8000-000000000004';
  r2 record;
  r3 record;
  r4 record;
  r5 record;
  rem int;
  unlocked_count int;
  consumed int;
BEGIN
  SELECT * INTO r FROM public.premium_mark_work_ready(u, 'TAKE', take, t0, 7);
  INSERT INTO gate_result VALUES ('retention','mark WORK_READY creates row', r.created AND r.status='WORK_READY', r.work_id::text);
  INSERT INTO gate_result VALUES ('retention','retention +7d bronze',
    r.retention_expires_at = t0 + interval '7 days',
    r.retention_expires_at::text);

  -- tip re-mark does not restart
  SELECT * INTO r2 FROM public.premium_mark_work_ready(u, 'TAKE', take, t0 + interval '1 hour', 7);
  INSERT INTO gate_result VALUES ('retention','tip remake does not restart',
    (NOT r2.created) AND r2.retention_expires_at = r.retention_expires_at,
    format('created=%s expiry=%s', r2.created, r2.retention_expires_at));

  w1 := r.work_id;

  -- FREE 0 credits
  PERFORM public.premium_mark_work_ready(u_free, 'TAKE', 'bbbbbbbb-00f1-4000-8000-0000000000f1'::uuid, t0, 7);
  SELECT * INTO r3 FROM public.premium_unlock_work(
    u_free,
    (SELECT id FROM public.premium_works WHERE owner_id=u_free LIMIT 1),
    'free-unlock',
    0,
    act,
    t0 + interval '1 minute',
    7
  );
  INSERT INTO gate_result VALUES ('credits','FREE granted=0 denies',
    r3.denied_reason = 'NO_CREDITS', coalesce(r3.denied_reason,'null'));

  -- Bronze unlock consume 1
  SELECT * INTO r4 FROM public.premium_unlock_work(u, w1, 'bronze-unlock-1', 1, act, t0 + interval '2 minutes', 7);
  INSERT INTO gate_result VALUES ('unlock','bronze unlock ok',
    r4.denied_reason IS NULL AND r4.reused = false AND r4.unlock_id IS NOT NULL,
    format('denied=%s reused=%s rem=%s', r4.denied_reason, r4.reused, r4.credits_remaining));
  INSERT INTO gate_result VALUES ('retention','unlock renews retention from unlock time',
    r4.retention_expires_at = (t0 + interval '2 minutes') + interval '7 days',
    r4.retention_expires_at::text);

  -- Idempotent same key
  SELECT * INTO r5 FROM public.premium_unlock_work(u, w1, 'bronze-unlock-1', 1, act, t0 + interval '3 minutes', 7);
  INSERT INTO gate_result VALUES ('unlock','idempotent retry reused',
    r5.reused = true AND r5.unlock_id = r4.unlock_id,
    format('reused=%s', r5.reused));

  SELECT c.consumed INTO consumed FROM public.premium_credit_periods c WHERE c.user_id=u;
  INSERT INTO gate_result VALUES ('credits','idempotent does not double consume',
    consumed = 1, consumed::text);

  -- Sticky: second key same work -> reused without new credit
  SELECT * INTO r5 FROM public.premium_unlock_work(u, w1, 'bronze-unlock-2', 1, act, t0 + interval '4 minutes', 7);
  INSERT INTO gate_result VALUES ('unlock','sticky second key reused',
    r5.reused = true, format('reused=%s denied=%s', r5.reused, r5.denied_reason));
  SELECT c.consumed INTO consumed FROM public.premium_credit_periods c WHERE c.user_id=u;
  INSERT INTO gate_result VALUES ('credits','sticky does not consume again',
    consumed = 1, consumed::text);

  -- KEY_REUSE different work
  PERFORM public.premium_mark_work_ready(u, 'TAKE', take2, t0, 7);
  SELECT * INTO r5 FROM public.premium_unlock_work(
    u,
    (SELECT id FROM public.premium_works WHERE domain_ref=take2),
    'bronze-unlock-1',
    1, act, t0 + interval '5 minutes', 7
  );
  INSERT INTO gate_result VALUES ('unlock','KEY_REUSE different work',
    r5.denied_reason = 'KEY_REUSE', coalesce(r5.denied_reason,'null'));

  -- Expired cannot unlock (silver)
  PERFORM public.premium_mark_work_ready(u_silver, 'TAKE', 'bbbbbbbb-00a1-4000-8000-0000000000a1'::uuid, t0, 14);
  UPDATE public.premium_works
    SET retention_expires_at = t0 - interval '1 second'
    WHERE owner_id = u_silver;
  SELECT * INTO r5 FROM public.premium_unlock_work(
    u_silver,
    (SELECT id FROM public.premium_works WHERE owner_id=u_silver LIMIT 1),
    'silver-expired',
    2, act, t0 + interval '10 minutes', 14
  );
  INSERT INTO gate_result VALUES ('retention','expired cannot unlock',
    r5.denied_reason = 'EXPIRED_OR_NOT_READY', coalesce(r5.denied_reason,'null'));

  -- Gold credits 4: unlock one work uses 1
  PERFORM public.premium_mark_work_ready(u_gold, 'TAKE', 'bbbbbbbb-00c1-4000-8000-0000000000c1'::uuid, t0, 28);
  SELECT * INTO r5 FROM public.premium_unlock_work(
    u_gold,
    (SELECT id FROM public.premium_works WHERE owner_id=u_gold LIMIT 1),
    'gold-1',
    4, act, t0 + interval '1 minute', 28
  );
  INSERT INTO gate_result VALUES ('credits','gold granted=4 remaining=3',
    r5.denied_reason IS NULL AND r5.credits_remaining = 3,
    format('rem=%s denied=%s', r5.credits_remaining, r5.denied_reason));

  -- Parallel unlock simulation: bronze already unlocked; ensure only 1 unlock row
  SELECT count(*) INTO unlocked_count FROM public.premium_track_unlocks WHERE user_id=u AND work_id=w1;
  INSERT INTO gate_result VALUES ('concurrency','single unlock row after parallel-ish retries',
    unlocked_count = 1, unlocked_count::text);
END $$;

-- authenticated cannot INSERT into premium_track_unlocks (trigger/RLS)
DO $$
DECLARE
  denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    INSERT INTO public.premium_track_unlocks (user_id, work_id, retention_expires_at, idempotency_key)
    SELECT 'aaaaaaaa-0002-4000-8000-000000000002', id, now() + interval '7 days', 'hack'
    FROM public.premium_works WHERE owner_id='aaaaaaaa-0002-4000-8000-000000000002' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    denied := true;
  END;
  INSERT INTO gate_result VALUES (
    'security',
    'authenticated cannot mutate premium_track_unlocks',
    denied,
    CASE WHEN denied THEN 'denied' ELSE 'UNEXPECTED ALLOW' END
  );
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END $$;

-- Period is 7 days from activation (not calendar week): unlock in same 7d window
DO $$
DECLARE
  u uuid := 'aaaaaaaa-0003-4000-8000-000000000003';
  act timestamptz := timestamptz '2026-10-15 12:00:00+00'; -- mid-week
  t1 timestamptz := act + interval '6 days'; -- still period 0
  take uuid := 'bbbbbbbb-00a2-4000-8000-0000000000a2';
  r record;
  idx int;
BEGIN
  -- reset silver works from expired test (disable append-only so FK/events cleanup works)
  ALTER TABLE public.premium_unlock_events DISABLE TRIGGER USER;
  DELETE FROM public.premium_unlock_events WHERE user_id=u;
  DELETE FROM public.premium_track_unlocks WHERE user_id=u;
  DELETE FROM public.premium_credit_periods WHERE user_id=u;
  DELETE FROM public.premium_works WHERE owner_id=u;
  ALTER TABLE public.premium_unlock_events ENABLE TRIGGER USER;

  PERFORM public.premium_mark_work_ready(u, 'TAKE', take, t1, 14);
  SELECT * INTO r FROM public.premium_unlock_work(
    u,
    (SELECT id FROM public.premium_works WHERE domain_ref=take),
    'silver-period',
    2, act, t1, 14
  );
  SELECT period_index INTO idx FROM public.premium_credit_periods WHERE user_id=u;
  INSERT INTO gate_result VALUES ('credits','7d period from activation (index 0 mid-week)',
    r.denied_reason IS NULL AND idx = 0,
    format('idx=%s denied=%s', idx, r.denied_reason));
END $$;

SELECT area, assertion, ok, detail FROM gate_result ORDER BY area, assertion;

-- Fail the script if any assertion failed
DO $$
DECLARE
  fails int;
BEGIN
  SELECT count(*) INTO fails FROM gate_result WHERE ok IS NOT TRUE;
  IF fails > 0 THEN
    RAISE EXCEPTION 'GATE_ASSERTIONS_FAILED count=%', fails;
  END IF;
END $$;

-- Cleanup fixtures only (events append-only → disable trigger as superuser)
ALTER TABLE public.premium_unlock_events DISABLE TRIGGER USER;
DELETE FROM public.premium_unlock_events WHERE user_id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004'
);
ALTER TABLE public.premium_unlock_events ENABLE TRIGGER USER;

DELETE FROM public.premium_track_unlocks WHERE user_id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004'
);
DELETE FROM public.premium_credit_periods WHERE user_id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004'
);
DELETE FROM public.premium_works WHERE owner_id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004'
);
DELETE FROM public.profiles WHERE id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004'
);
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004'
);

COMMIT;

SELECT 'GATE_SQL_PASS' AS status;
