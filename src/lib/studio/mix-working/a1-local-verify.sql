-- A1 LOCAL VERIFICATION — synthetic data only. Run via docker exec on
-- supabase_db_bitrymdym-local. Cleans up its own rows at the end.
-- Output lines: RESULT|<case>|<PASS|FAIL>|<detail>

\set ON_ERROR_STOP on

CREATE TEMP TABLE a1_results (
  case_id text PRIMARY KEY,
  status text NOT NULL,
  detail text NOT NULL DEFAULT ''
);

CREATE OR REPLACE FUNCTION pg_temp.a1_pass(p_case text, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO a1_results(case_id, status, detail) VALUES (p_case, 'PASS', p_detail)
  ON CONFLICT (case_id) DO UPDATE SET status='PASS', detail=EXCLUDED.detail;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a1_fail(p_case text, p_detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO a1_results(case_id, status, detail) VALUES (p_case, 'FAIL', p_detail)
  ON CONFLICT (case_id) DO UPDATE SET status='FAIL', detail=EXCLUDED.detail;
END;
$$;

DO $$
DECLARE
  v_owner_a uuid := 'a1000001-0001-4001-8001-0000000000a1';
  v_owner_b uuid := 'a1000002-0002-4002-8002-0000000000b2';
  v_proj_a uuid := 'a1000003-0003-4003-8003-0000000000c3';
  v_proj_b uuid := 'a1000004-0004-4004-8004-0000000000d4';
  v_track_1 uuid := 'a1000005-0005-4005-8005-0000000000e5';
  v_track_2 uuid := 'a1000006-0006-4006-8006-0000000000f6';
  v_track_b uuid := 'a1000007-0007-4007-8007-0000000000a7';
  v_req_1 uuid := 'a1000010-0010-4010-8010-000000000010';
  v_req_2 uuid := 'a1000011-0011-4011-8011-000000000011';
  v_req_3 uuid := 'a1000012-0012-4012-8012-000000000012';
  v_req_4 uuid := 'a1000013-0013-4013-8013-000000000013';
  v_req_5 uuid := 'a1000014-0014-4014-8014-000000000014';
  v_req_6 uuid := 'a1000015-0015-4015-8015-000000000015';
  v_req_7 uuid := 'a1000016-0016-4016-8016-000000000016';
  v_fp_1 text := repeat('a', 64);
  v_fp_2 text := repeat('b', 64);
  v_fp_3 text := repeat('c', 64);
  v_digest text := repeat('d', 64);
  v_digest2 text := repeat('e', 64);
  v_chain jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'effects', jsonb_build_array(
      jsonb_build_object(
        'id', 'a10000f1-00f1-40f1-80f1-0000000000f1',
        'type', 'eq',
        'enabled', true,
        'params', jsonb_build_object(
          'lowShelfDb', 0, 'lowMidDb', 1, 'highMidDb', 0, 'highShelfDb', 0
        )
      )
    )
  );
  v_master_chain jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'effects', jsonb_build_array(
      jsonb_build_object(
        'id', 'a10000f2-00f2-40f2-80f2-0000000000f2',
        'type', 'limiter',
        'enabled', true,
        'params', jsonb_build_object('thresholdDb', -1, 'ceilingDb', -0.1)
      )
    )
  );
  v_ver int;
  v_gain numeric;
  v_pan numeric;
  v_muted boolean;
  v_solo boolean;
  v_fx jsonb;
  v_mgain numeric;
  v_mpan numeric;
  v_mfx jsonb;
  v_armed boolean;
  v_name text;
  v_rec record;
  v_cnt int;
  v_err text;
  v_doc_ver int;
  v_doc_digest text;
  v_replay boolean;
  v_hist_ver int;
  v_hist_digest text;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Cleanup leftovers from prior interrupted runs
  DELETE FROM public.studio_mix_working_idempotency
  WHERE project_id IN (v_proj_a, v_proj_b) OR owner_id IN (v_owner_a, v_owner_b);
  DELETE FROM public.studio_projects WHERE id IN (v_proj_a, v_proj_b);
  DELETE FROM public.profiles WHERE id IN (v_owner_a, v_owner_b);
  DELETE FROM auth.users WHERE id IN (v_owner_a, v_owner_b);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_owner_a, 'authenticated', 'authenticated',
     'a1-owner-a@example.local', crypt('a1-test', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_owner_b, 'authenticated', 'authenticated',
     'a1-owner-b@example.local', crypt('a1-test', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  -- auth.users insert may auto-create profiles via trigger
  UPDATE public.profiles
  SET display_name = 'A1 Owner A', role = 'USER', account_level = 'BEGINNER_RAPPER'
  WHERE id = v_owner_a;
  UPDATE public.profiles
  SET display_name = 'A1 Owner B', role = 'USER', account_level = 'BEGINNER_RAPPER'
  WHERE id = v_owner_b;
  INSERT INTO public.profiles (id, display_name, role, account_level)
  SELECT v_owner_a, 'A1 Owner A', 'USER', 'BEGINNER_RAPPER'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner_a);
  INSERT INTO public.profiles (id, display_name, role, account_level)
  SELECT v_owner_b, 'A1 Owner B', 'USER', 'BEGINNER_RAPPER'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner_b);

  INSERT INTO public.studio_projects (
    id, owner_id, title, status, document_version, master_gain_db, master_pan, master_fx_chain
  ) VALUES
    (v_proj_a, v_owner_a, 'A1 Verify A', 'ACTIVE', 10, 0, 0, '{}'::jsonb),
    (v_proj_b, v_owner_b, 'A1 Verify B', 'ACTIVE', 5, 0, 0, '{}'::jsonb);

  INSERT INTO public.studio_tracks (
    id, project_id, name, track_type, sort_order, gain_db, pan, muted, solo, record_armed, effects_chain
  ) VALUES
    (v_track_1, v_proj_a, 'Vox1', 'VOCAL', 0, 0, 0, false, false, false, '{}'::jsonb),
    (v_track_2, v_proj_a, 'Vox2', 'VOCAL', 1, 0, 0, false, false, false, '{}'::jsonb),
    (v_track_b, v_proj_b, 'Other', 'VOCAL', 0, 0, 0, false, false, false, '{}'::jsonb);

  ------------------------------------------------------------------
  -- SCHEMA / SECURITY
  ------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'studio_cas_apply_mix_working_ops'
      AND p.prosecdef AND 'search_path=public' = ANY (coalesce(p.proconfig, array[]::text[]))
  ) THEN
    PERFORM pg_temp.a1_pass('SEC_DEFINER_SEARCH_PATH');
  ELSE
    PERFORM pg_temp.a1_fail('SEC_DEFINER_SEARCH_PATH', 'missing definer/search_path');
  END IF;

  -- A2 replaced the 7-arg overload with 8-arg (p_revision jsonb DEFAULT NULL).
  IF has_function_privilege('anon', 'public.studio_cas_apply_mix_working_ops(uuid,uuid,integer,uuid,text,jsonb,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.studio_cas_apply_mix_working_ops(uuid,uuid,integer,uuid,text,jsonb,text,jsonb)', 'EXECUTE')
  THEN
    PERFORM pg_temp.a1_fail('SEC_EXECUTE_DENY_CATALOG', 'anon/auth still have EXECUTE');
  ELSE
    PERFORM pg_temp.a1_pass('SEC_EXECUTE_DENY_CATALOG');
  END IF;

  IF has_table_privilege('anon', 'public.studio_mix_working_idempotency', 'INSERT')
     OR has_table_privilege('authenticated', 'public.studio_mix_working_idempotency', 'INSERT')
  THEN
    PERFORM pg_temp.a1_fail('SEC_DML_DENY_CATALOG', 'anon/auth can INSERT');
  ELSE
    PERFORM pg_temp.a1_pass('SEC_DML_DENY_CATALOG');
  END IF;

  ------------------------------------------------------------------
  -- A1 multi-op + single bump
  ------------------------------------------------------------------
  SELECT document_version, document_digest, replay
  INTO v_doc_ver, v_doc_digest, v_replay
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 10, v_req_1, v_fp_1,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object(
          'gain_db', -6, 'pan', -0.25, 'muted', true, 'solo', true,
          'effects_chain', v_chain
        )
      ),
      'master', jsonb_build_object(
        'master_gain_db', -2, 'master_pan', 0.3, 'master_fx_chain', v_master_chain
      )
    ),
    v_digest
  );

  SELECT document_version, master_gain_db, master_pan, master_fx_chain
  INTO v_ver, v_mgain, v_mpan, v_mfx
  FROM public.studio_projects WHERE id = v_proj_a;

  SELECT gain_db, pan, muted, solo, effects_chain, record_armed, name
  INTO v_gain, v_pan, v_muted, v_solo, v_fx, v_armed, v_name
  FROM public.studio_tracks WHERE id = v_track_1;

  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_idempotency
  WHERE owner_id = v_owner_a AND project_id = v_proj_a AND request_id = v_req_1;

  IF v_doc_ver = 11 AND v_replay IS FALSE AND v_ver = 11
     AND v_gain = -6 AND v_pan = -0.25 AND v_muted AND v_solo
     AND v_fx = v_chain AND v_mgain = -2 AND v_mpan = 0.3 AND v_mfx = v_master_chain
     AND v_armed IS FALSE AND v_name = 'Vox1' AND v_cnt = 1
     AND v_doc_digest = v_digest
  THEN
    PERFORM pg_temp.a1_pass('A1_MULTI_OP', format('ver=%s', v_ver));
    PERFORM pg_temp.a1_pass('A6_SINGLE_BUMP', '10->11');
  ELSE
    PERFORM pg_temp.a1_fail('A1_MULTI_OP', format(
      'ver=%s replay=%s gain=%s cnt=%s', v_ver, v_replay, v_gain, v_cnt));
    PERFORM pg_temp.a1_fail('A6_SINGLE_BUMP', format('ver=%s', v_ver));
  END IF;

  -- track2 untouched
  SELECT gain_db INTO v_gain FROM public.studio_tracks WHERE id = v_track_2;
  IF v_gain = 0 THEN
    PERFORM pg_temp.a1_pass('A1_UNTOUCHED_TRACK2');
  ELSE
    PERFORM pg_temp.a1_fail('A1_UNTOUCHED_TRACK2', v_gain::text);
  END IF;

  ------------------------------------------------------------------
  -- Idempotency replay (same key + fingerprint)
  ------------------------------------------------------------------
  SELECT document_version, document_digest, replay
  INTO v_doc_ver, v_doc_digest, v_replay
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 10, v_req_1, v_fp_1,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('gain_db', -6)
      ),
      'master', '{}'::jsonb
    ),
    v_digest
  );

  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_idempotency
  WHERE project_id = v_proj_a AND request_id = v_req_1;

  IF v_replay IS TRUE AND v_doc_ver = 11 AND v_ver = 11 AND v_cnt = 1 THEN
    PERFORM pg_temp.a1_pass('IDEM_REPLAY', 'historical 11, tip still 11');
  ELSE
    PERFORM pg_temp.a1_fail('IDEM_REPLAY', format('replay=%s doc=%s tip=%s cnt=%s', v_replay, v_doc_ver, v_ver, v_cnt));
  END IF;

  ------------------------------------------------------------------
  -- KEY_REUSE (same requestId, different fingerprint)
  ------------------------------------------------------------------
  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj_a, v_owner_a, 11, v_req_1, v_fp_2,
      jsonb_build_object('tracks', jsonb_build_object(v_track_1::text, jsonb_build_object('gain_db', -1)), 'master', '{}'::jsonb),
      v_digest2
    );
    PERFORM pg_temp.a1_fail('IDEM_KEY_REUSE', 'expected exception');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%IDEMPOTENCY_KEY_REUSE%' THEN
      PERFORM pg_temp.a1_pass('IDEM_KEY_REUSE');
    ELSE
      PERFORM pg_temp.a1_fail('IDEM_KEY_REUSE', SQLERRM);
    END IF;
  END;

  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  IF v_ver = 11 THEN
    PERFORM pg_temp.a1_pass('IDEM_KEY_REUSE_NO_BUMP');
  ELSE
    PERFORM pg_temp.a1_fail('IDEM_KEY_REUSE_NO_BUMP', v_ver::text);
  END IF;

  ------------------------------------------------------------------
  -- A4 invalid patch — unknown field
  ------------------------------------------------------------------
  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj_a, v_owner_a, 11, v_req_2, v_fp_2,
      jsonb_build_object('tracks', jsonb_build_object(v_track_1::text, jsonb_build_object('gain_db', -1, 'record_armed', true)), 'master', '{}'::jsonb),
      v_digest2
    );
    PERFORM pg_temp.a1_fail('A4_UNKNOWN_FIELD', 'accepted record_armed');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%MIX_WORKING_PATCH_INVALID%' THEN
      PERFORM pg_temp.a1_pass('A4_UNKNOWN_FIELD');
    ELSE
      PERFORM pg_temp.a1_fail('A4_UNKNOWN_FIELD', SQLERRM);
    END IF;
  END;

  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  IF v_ver <> 11 THEN
    PERFORM pg_temp.a1_fail('A4_NO_PARTIAL_BUMP', v_ver::text);
  ELSE
    PERFORM pg_temp.a1_pass('A4_NO_PARTIAL_BUMP');
  END IF;

  ------------------------------------------------------------------
  -- A5 foreign track
  ------------------------------------------------------------------
  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj_a, v_owner_a, 11, v_req_3, v_fp_3,
      jsonb_build_object(
        'tracks', jsonb_build_object(v_track_b::text, jsonb_build_object('gain_db', -9)),
        'master', '{}'::jsonb
      ),
      v_digest2
    );
    PERFORM pg_temp.a1_fail('A5_FOREIGN_TRACK', 'accepted foreign track');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%TRACK_NOT_FOUND%' THEN
      PERFORM pg_temp.a1_pass('A5_FOREIGN_TRACK');
    ELSE
      PERFORM pg_temp.a1_fail('A5_FOREIGN_TRACK', SQLERRM);
    END IF;
  END;

  SELECT gain_db INTO v_gain FROM public.studio_tracks WHERE id = v_track_b;
  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_idempotency WHERE request_id = v_req_3;
  IF v_gain = 0 AND v_ver = 11 AND v_cnt = 0 THEN
    PERFORM pg_temp.a1_pass('A5_FOREIGN_NO_PARTIAL');
  ELSE
    PERFORM pg_temp.a1_fail('A5_FOREIGN_NO_PARTIAL', format('gain=%s ver=%s cnt=%s', v_gain, v_ver, v_cnt));
  END IF;

  ------------------------------------------------------------------
  -- A5 missing track
  ------------------------------------------------------------------
  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj_a, v_owner_a, 11, 'a1000017-0017-4017-8017-000000000017'::uuid, repeat('f', 64),
      jsonb_build_object(
        'tracks', jsonb_build_object('a1000099-0099-4099-8099-000000000099', jsonb_build_object('gain_db', -1)),
        'master', '{}'::jsonb
      ),
      v_digest2
    );
    PERFORM pg_temp.a1_fail('A5_MISSING_TRACK', 'accepted');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%TRACK_NOT_FOUND%' THEN
      PERFORM pg_temp.a1_pass('A5_MISSING_TRACK');
    ELSE
      PERFORM pg_temp.a1_fail('A5_MISSING_TRACK', SQLERRM);
    END IF;
  END;

  ------------------------------------------------------------------
  -- Wrong owner → empty (CAS-style) no leak / no write
  ------------------------------------------------------------------
  SELECT count(*) INTO v_cnt FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_b, 11, v_req_4, repeat('1', 64),
    jsonb_build_object('tracks', jsonb_build_object(v_track_1::text, jsonb_build_object('gain_db', -1)), 'master', '{}'::jsonb),
    v_digest2
  );
  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  IF v_cnt = 0 AND v_ver = 11 THEN
    PERFORM pg_temp.a1_pass('SEC_WRONG_OWNER_EMPTY');
  ELSE
    PERFORM pg_temp.a1_fail('SEC_WRONG_OWNER_EMPTY', format('rows=%s ver=%s', v_cnt, v_ver));
  END IF;

  ------------------------------------------------------------------
  -- CAS conflict — empty return, no bump
  ------------------------------------------------------------------
  SELECT count(*) INTO v_cnt FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 99, v_req_5, repeat('2', 64),
    jsonb_build_object('tracks', jsonb_build_object(v_track_1::text, jsonb_build_object('gain_db', -1)), 'master', '{}'::jsonb),
    v_digest2
  );
  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_idempotency WHERE request_id = v_req_5;
  IF v_ver = 11 AND v_cnt = 0 THEN
    PERFORM pg_temp.a1_pass('CAS_CONFLICT_EMPTY');
  ELSE
    PERFORM pg_temp.a1_fail('CAS_CONFLICT_EMPTY', format('ver=%s idem=%s', v_ver, v_cnt));
  END IF;

  ------------------------------------------------------------------
  -- A2: fault after first track UPDATE via temporary trigger
  ------------------------------------------------------------------
  CREATE OR REPLACE FUNCTION pg_temp.a1_fault_second_track()
  RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN
    IF NEW.id = 'a1000006-0006-4006-8006-0000000000f6'::uuid
       AND (NEW.gain_db IS DISTINCT FROM OLD.gain_db) THEN
      RAISE EXCEPTION 'A1_TEST_FAULT_AFTER_TRACK1';
    END IF;
    RETURN NEW;
  END;
  $t$;

  CREATE TRIGGER a1_fault_second_track
  BEFORE UPDATE ON public.studio_tracks
  FOR EACH ROW EXECUTE FUNCTION pg_temp.a1_fault_second_track();

  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj_a, v_owner_a, 11, v_req_6, repeat('3', 64),
      jsonb_build_object(
        'tracks', jsonb_build_object(
          v_track_1::text, jsonb_build_object('gain_db', -8),
          v_track_2::text, jsonb_build_object('gain_db', -7)
        ),
        'master', '{}'::jsonb
      ),
      v_digest2
    );
    PERFORM pg_temp.a1_fail('A2_TRACK_FAULT_ROLLBACK', 'no exception');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%A1_TEST_FAULT%' THEN
      NULL; -- expected
    ELSE
      PERFORM pg_temp.a1_fail('A2_TRACK_FAULT_ROLLBACK', SQLERRM);
    END IF;
  END;

  DROP TRIGGER IF EXISTS a1_fault_second_track ON public.studio_tracks;

  SELECT gain_db INTO v_gain FROM public.studio_tracks WHERE id = v_track_1;
  SELECT gain_db INTO v_pan FROM public.studio_tracks WHERE id = v_track_2; -- reuse var
  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_idempotency WHERE request_id = v_req_6;
  -- track1 was -6 from A1 success; fault path must restore that (not -8)
  IF v_gain = -6 AND v_pan = 0 AND v_ver = 11 AND v_cnt = 0 THEN
    PERFORM pg_temp.a1_pass('A2_TRACK_FAULT_ROLLBACK', 'full rollback + no idem row');
  ELSE
    PERFORM pg_temp.a1_fail('A2_TRACK_FAULT_ROLLBACK', format('t1=%s t2=%s ver=%s idem=%s', v_gain, v_pan, v_ver, v_cnt));
  END IF;

  ------------------------------------------------------------------
  -- A3: master constraint fail after track update (pan out of range)
  ------------------------------------------------------------------
  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj_a, v_owner_a, 11, v_req_7, repeat('4', 64),
      jsonb_build_object(
        'tracks', jsonb_build_object(v_track_2::text, jsonb_build_object('gain_db', -3)),
        'master', jsonb_build_object('master_pan', 5)
      ),
      v_digest2
    );
    PERFORM pg_temp.a1_fail('A3_MASTER_FAULT_ROLLBACK', 'accepted invalid pan');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- check constraint or patch path
  END;

  SELECT gain_db INTO v_gain FROM public.studio_tracks WHERE id = v_track_2;
  SELECT document_version, master_pan INTO v_ver, v_mpan FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_idempotency WHERE request_id = v_req_7;
  IF v_gain = 0 AND v_ver = 11 AND v_mpan = 0.3 AND v_cnt = 0 THEN
    PERFORM pg_temp.a1_pass('A3_MASTER_FAULT_ROLLBACK');
  ELSE
    PERFORM pg_temp.a1_fail('A3_MASTER_FAULT_ROLLBACK', format('t2=%s ver=%s mpan=%s idem=%s', v_gain, v_ver, v_mpan, v_cnt));
  END IF;

  ------------------------------------------------------------------
  -- Two different requestIds same expected → one success one conflict
  ------------------------------------------------------------------
  -- tip is 11; bump with req A then conflict with req B expecting 11
  SELECT document_version INTO v_hist_ver FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 11, 'a1000020-0020-4020-8020-000000000020'::uuid, repeat('5', 64),
    jsonb_build_object('tracks', jsonb_build_object(v_track_2::text, jsonb_build_object('muted', true)), 'master', '{}'::jsonb),
    repeat('6', 64)
  );
  SELECT count(*) INTO v_cnt FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 11, 'a1000021-0021-4021-8021-000000000021'::uuid, repeat('7', 64),
    jsonb_build_object('tracks', jsonb_build_object(v_track_2::text, jsonb_build_object('solo', true)), 'master', '{}'::jsonb),
    repeat('8', 64)
  );
  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;
  SELECT muted, solo INTO v_muted, v_solo FROM public.studio_tracks WHERE id = v_track_2;
  IF v_hist_ver = 12 AND v_cnt = 0 AND v_ver = 12 AND v_muted IS TRUE AND v_solo IS FALSE THEN
    PERFORM pg_temp.a1_pass('IDEM_TWO_REQUEST_ONE_CAS');
  ELSE
    PERFORM pg_temp.a1_fail('IDEM_TWO_REQUEST_ONE_CAS', format('first=%s second_rows=%s tip=%s muted=%s solo=%s', v_hist_ver, v_cnt, v_ver, v_muted, v_solo));
  END IF;

  ------------------------------------------------------------------
  -- Replay after later tip change (historical result)
  ------------------------------------------------------------------
  -- Advance tip via track_controls CAS
  PERFORM public.studio_cas_update_track_controls(
    v_proj_a, v_owner_a, v_track_1, 12, 'Vox1', false, false, -6, -0.25, false
  );
  SELECT document_version INTO v_ver FROM public.studio_projects WHERE id = v_proj_a;

  SELECT document_version, document_digest, replay
  INTO v_doc_ver, v_doc_digest, v_replay
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 10, v_req_1, v_fp_1,
    jsonb_build_object('tracks', '{}'::jsonb, 'master', '{}'::jsonb),
    v_digest
  );

  IF v_replay IS TRUE AND v_doc_ver = 11 AND v_doc_digest = v_digest AND v_ver >= 13 THEN
    PERFORM pg_temp.a1_pass('IDEM_REPLAY_AFTER_TIP_MOVE', format('hist=11 tip=%s', v_ver));
  ELSE
    PERFORM pg_temp.a1_fail('IDEM_REPLAY_AFTER_TIP_MOVE', format('replay=%s hist=%s tip=%s', v_replay, v_doc_ver, v_ver));
  END IF;

  ------------------------------------------------------------------
  -- Stale expected after tip move — no apply of old ops
  ------------------------------------------------------------------
  SELECT gain_db INTO v_gain FROM public.studio_tracks WHERE id = v_track_1;
  SELECT count(*) INTO v_cnt FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 11, 'a1000022-0022-4022-8022-000000000022'::uuid, repeat('9', 64),
    jsonb_build_object('tracks', jsonb_build_object(v_track_1::text, jsonb_build_object('gain_db', 0)), 'master', '{}'::jsonb),
    repeat('a', 64)
  );
  SELECT gain_db INTO v_pan FROM public.studio_tracks WHERE id = v_track_1;
  IF v_cnt = 0 AND v_pan = v_gain THEN
    PERFORM pg_temp.a1_pass('CAS_STALE_NO_APPLY');
  ELSE
    PERFORM pg_temp.a1_fail('CAS_STALE_NO_APPLY', format('rows=%s before=%s after=%s', v_cnt, v_gain, v_pan));
  END IF;

  ------------------------------------------------------------------
  -- Cleanup synthetic rows
  ------------------------------------------------------------------
  DELETE FROM public.studio_mix_working_idempotency
  WHERE project_id IN (v_proj_a, v_proj_b) OR owner_id IN (v_owner_a, v_owner_b);
  DELETE FROM public.studio_projects WHERE id IN (v_proj_a, v_proj_b);
  DELETE FROM public.profiles WHERE id IN (v_owner_a, v_owner_b);
  DELETE FROM auth.users WHERE id IN (v_owner_a, v_owner_b);

  PERFORM pg_temp.a1_pass('CLEANUP_OK');
END;
$$;

-- Role EXECUTE deny (runtime attempt)
DO $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      'a1000003-0003-4003-8003-0000000000c3'::uuid,
      'a1000001-0001-4001-8001-0000000000a1'::uuid,
      1,
      'a1000090-0090-4090-8090-000000000090'::uuid,
      repeat('0', 64),
      '{"tracks":{},"master":{}}'::jsonb,
      repeat('0', 64)
    );
    PERFORM pg_temp.a1_fail('SEC_ANON_EXECUTE', 'anon executed RPC');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.a1_pass('SEC_ANON_EXECUTE');
  WHEN OTHERS THEN
    -- permission denied may surface differently
    IF SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%denied%' OR SQLSTATE = '42501' THEN
      PERFORM pg_temp.a1_pass('SEC_ANON_EXECUTE', SQLERRM);
    ELSE
      PERFORM pg_temp.a1_fail('SEC_ANON_EXECUTE', SQLERRM);
    END IF;
  END;
  RESET ROLE;
END;
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      'a1000003-0003-4003-8003-0000000000c3'::uuid,
      'a1000001-0001-4001-8001-0000000000a1'::uuid,
      1,
      'a1000091-0091-4091-8091-000000000091'::uuid,
      repeat('0', 64),
      '{"tracks":{},"master":{}}'::jsonb,
      repeat('0', 64)
    );
    PERFORM pg_temp.a1_fail('SEC_AUTH_EXECUTE', 'authenticated executed RPC');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.a1_pass('SEC_AUTH_EXECUTE');
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%denied%' OR SQLSTATE = '42501' THEN
      PERFORM pg_temp.a1_pass('SEC_AUTH_EXECUTE', SQLERRM);
    ELSE
      PERFORM pg_temp.a1_fail('SEC_AUTH_EXECUTE', SQLERRM);
    END IF;
  END;
  RESET ROLE;
END;
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.studio_mix_working_idempotency (
      owner_id, project_id, request_id, request_fingerprint, status,
      version_before, version_after, result_document_digest, result
    ) VALUES (
      'a1000001-0001-4001-8001-0000000000a1',
      'a1000003-0003-4003-8003-0000000000c3',
      'a1000092-0092-4092-8092-000000000092',
      repeat('0', 64), 'succeeded', 1, 2, repeat('0', 64), '{}'::jsonb
    );
    PERFORM pg_temp.a1_fail('SEC_AUTH_DML', 'authenticated INSERT succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.a1_pass('SEC_AUTH_DML');
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%denied%' OR SQLSTATE = '42501' THEN
      PERFORM pg_temp.a1_pass('SEC_AUTH_DML', SQLERRM);
    ELSE
      PERFORM pg_temp.a1_fail('SEC_AUTH_DML', SQLERRM);
    END IF;
  END;
  RESET ROLE;
END;
$$;

SELECT 'RESULT|' || case_id || '|' || status || '|' || detail AS line
FROM a1_results
ORDER BY case_id;
