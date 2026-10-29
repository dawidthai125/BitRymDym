-- Local verification for 20261029044811_beat_auto_checks.sql (disposable DB only).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/beat-auto-checks.sql  → prints PASS lines, rolls back.
\set beat '00000000-0000-0000-0000-000000000500'
\set owner '00000000-0000-0000-0000-000000000011'
\set stranger '00000000-0000-0000-0000-000000000022'
\set admin '00000000-0000-0000-0000-0000000000ad'
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_role(r text, sub text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', r, 'sub', sub)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', r);
END $$;

-- 1. anon/authenticated table privileges are minimal
DO $$ BEGIN
  IF has_table_privilege('anon', 'public.beat_auto_checks', 'SELECT') THEN RAISE EXCEPTION 'anon select'; END IF;
  IF has_table_privilege('authenticated', 'public.beat_auto_checks', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'auth write'; END IF;
  IF has_column_privilege('authenticated', 'public.beat_auto_checks', 'results', 'SELECT') THEN RAISE EXCEPTION 'auth sees results'; END IF;
  IF has_table_privilege('authenticated', 'public.beat_audio_fingerprints', 'SELECT') THEN RAISE EXCEPTION 'auth fp'; END IF;
  IF has_function_privilege('authenticated', 'public.enqueue_beat_auto_check(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'auth enqueue'; END IF;
  IF has_function_privilege('anon', 'public.request_beat_auto_check_appeal(uuid,text)', 'EXECUTE') THEN RAISE EXCEPTION 'anon appeal'; END IF;
  RAISE NOTICE 'PASS 1 grants';
END $$;

-- 2. service: submit → enqueue; approve blocked while pending
SELECT pg_temp.as_role('service_role', :'admin');
UPDATE public.beats SET status = 'PENDING_REVIEW' WHERE id = :'beat';
SELECT id AS check1 FROM public.enqueue_beat_auto_check(:'beat') \gset
RESET ROLE;
SELECT pg_temp.as_role('authenticated', :'admin');
DO $$ BEGIN
  BEGIN
    UPDATE public.beats SET status = 'APPROVED' WHERE id = '00000000-0000-0000-0000-000000000500';
    RAISE EXCEPTION 'approve should fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'AUTO_CHECK_NOT_CLEARED' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 2 approve blocked while pending';
END $$;
RESET ROLE;
SELECT pg_temp.as_role('service_role', :'admin');

-- 3. enqueue is idempotent while open; claim + complete rejected_vocals → beat REJECTED
SELECT (SELECT id FROM public.enqueue_beat_auto_check(:'beat')) = :'check1' AS same \gset
\if :same
\echo PASS 3a enqueue idempotent
\else
SELECT 1/0;
\endif
SELECT id AS claimed FROM public.claim_next_beat_auto_check('test-w1') \gset
SELECT public.complete_beat_auto_check(:'claimed', 'test-w1', 'rejected_vocals', '{"own_catalog":"ok"}', '{"vocal":{"ratio":0.4}}', 0, 0.4, 0.9, 'Wykryto wokal.', NULL) IS NOT NULL;
SELECT status = 'REJECTED' AS rej FROM public.beats WHERE id = :'beat' \gset
\if :rej
\echo PASS 3b auto-reject
\else
SELECT 1/0;
\endif

-- 4. owner sees only summary columns; stranger sees nothing
RESET ROLE;
SELECT pg_temp.as_role('authenticated', :'owner');
SELECT count(*) = 1 AS own FROM public.beat_auto_checks \gset
SELECT public.request_beat_auto_check_appeal(:'claimed', 'To jest syntezator, nie wokal.');
RESET ROLE;
SELECT pg_temp.as_role('authenticated', :'stranger');
SELECT count(*) = 0 AS none FROM public.beat_auto_checks \gset
RESET ROLE;
SELECT pg_temp.as_role('anon', '');
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.beat_auto_checks; RAISE EXCEPTION 'anon read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
\if :own
\echo PASS 4a owner sees own
\else
SELECT 1/0;
\endif
\if :none
\echo PASS 4b stranger none, anon denied
\else
SELECT 1/0;
\endif

-- 5. override: logged, beat back to PENDING_REVIEW, then approve allowed
SELECT pg_temp.as_role('service_role', :'admin');
SELECT (public.override_beat_auto_check(:'claimed', :'admin', 'Syntezator wokalopodobny')).id IS NOT NULL;
SELECT (SELECT status FROM public.beats WHERE id = :'beat') = 'PENDING_REVIEW'
   AND EXISTS (SELECT 1 FROM public.beat_moderation_decisions WHERE beat_id = :'beat' AND decision = 'auto_check_override') AS ov \gset
RESET ROLE;
SELECT pg_temp.as_role('authenticated', :'admin');
UPDATE public.beats SET status = 'APPROVED' WHERE id = :'beat';
RESET ROLE;
SELECT pg_temp.as_role('service_role', :'admin');
\if :ov
\echo PASS 5 override logged + approve allowed
\else
SELECT 1/0;
\endif

-- 6. error check never clears
UPDATE public.beats SET status = 'PENDING_REVIEW' WHERE id = :'beat';
SELECT id AS c2 FROM public.enqueue_beat_auto_check(:'beat') \gset
SELECT id AS cl2 FROM public.claim_next_beat_auto_check('test-w1') \gset
SELECT public.complete_beat_auto_check(:'cl2', 'test-w1', 'error', '{}', '{}', NULL, NULL, NULL, 'Błąd', 'needs_config') IS NOT NULL;
SELECT (NOT public.beat_auto_check_cleared(:'beat'))
   AND (SELECT status FROM public.beats WHERE id = :'beat') = 'PENDING_REVIEW' AS ok6 \gset
\if :ok6
\echo PASS 6 error stays pending, not cleared
\else
SELECT 1/0;
\endif
ROLLBACK;
