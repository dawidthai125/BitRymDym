-- A2 LOCAL VERIFICATION — synthetic data only. Run via docker exec on
-- supabase_db_bitrymdym-local. Cleans up its own rows at the end.
-- Output lines: RESULT|<case>|<PASS|FAIL>|<detail>

\set ON_ERROR_STOP on

CREATE TEMP TABLE a2_results (
  case_id text PRIMARY KEY,
  status text NOT NULL,
  detail text NOT NULL DEFAULT ''
);

CREATE OR REPLACE FUNCTION pg_temp.a2_pass(p_case text, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO a2_results(case_id, status, detail) VALUES (p_case, 'PASS', p_detail)
  ON CONFLICT (case_id) DO UPDATE SET status='PASS', detail=EXCLUDED.detail;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a2_fail(p_case text, p_detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO a2_results(case_id, status, detail) VALUES (p_case, 'FAIL', p_detail)
  ON CONFLICT (case_id) DO UPDATE SET status='FAIL', detail=EXCLUDED.detail;
END;
$$;

DO $$
DECLARE
  v_owner_a uuid := 'a2000001-0001-4001-8001-0000000000a1';
  v_owner_b uuid := 'a2000002-0002-4002-8002-0000000000b2';
  v_proj_a uuid := 'a2000003-0003-4003-8003-0000000000c3';
  v_proj_b uuid := 'a2000004-0004-4004-8004-0000000000d4';
  v_track_1 uuid := 'a2000005-0005-4005-8005-0000000000e5';
  v_track_b uuid := 'a2000007-0007-4007-8007-0000000000a7';
  v_req_1 uuid := 'a2000010-0010-4010-8010-000000000010';
  v_req_2 uuid := 'a2000011-0011-4011-8011-000000000011';
  v_req_3 uuid := 'a2000012-0012-4012-8012-000000000012';
  v_req_4 uuid := 'a2000013-0013-4013-8013-000000000013';
  v_req_5 uuid := 'a2000014-0014-4014-8014-000000000014';
  v_rev_1 uuid := 'a2000020-0020-4020-8020-000000000020';
  v_rev_2 uuid := 'a2000021-0021-4021-8021-000000000021';
  v_rev_3 uuid := 'a2000024-0024-4024-8024-000000000024';
  v_rev_bad uuid := 'a2000022-0022-4022-8022-000000000022';
  v_rev_foreign uuid := 'a2000023-0023-4023-8023-000000000023';
  v_fp_1 text := repeat('a', 64);
  v_fp_2 text := repeat('b', 64);
  v_fp_3 text := repeat('c', 64);
  v_fp_4 text := repeat('d', 64);
  v_fp_5 text := repeat('e', 64);
  v_digest text := repeat('1', 64);
  v_digest2 text := repeat('2', 64);
  v_digest3 text := repeat('3', 64);
  v_snap jsonb;
  v_snap2 jsonb;
  v_doc_ver int;
  v_replay boolean;
  v_rev_out uuid;
  v_cnt int;
  v_tip int;
  v_kind text;
  v_restored uuid;
  v_parent uuid;
  v_sqlstate text;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Cleanup leftovers from prior runs
  DELETE FROM public.studio_mix_working_idempotency
    WHERE project_id IN (v_proj_a, v_proj_b) OR owner_id IN (v_owner_a, v_owner_b);
  DELETE FROM public.studio_mix_working_revisions
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
     'a2-owner-a@example.local', crypt('a2-test', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_owner_b, 'authenticated', 'authenticated',
     'a2-owner-b@example.local', crypt('a2-test', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  UPDATE public.profiles
  SET display_name = 'A2 Owner A', role = 'USER', account_level = 'BEGINNER_RAPPER'
  WHERE id = v_owner_a;
  UPDATE public.profiles
  SET display_name = 'A2 Owner B', role = 'USER', account_level = 'BEGINNER_RAPPER'
  WHERE id = v_owner_b;
  INSERT INTO public.profiles (id, display_name, role, account_level)
  SELECT v_owner_a, 'A2 Owner A', 'USER', 'BEGINNER_RAPPER'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner_a);
  INSERT INTO public.profiles (id, display_name, role, account_level)
  SELECT v_owner_b, 'A2 Owner B', 'USER', 'BEGINNER_RAPPER'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner_b);

  INSERT INTO public.studio_projects (
    id, owner_id, title, status, document_version,
    master_gain_db, master_pan, master_fx_chain
  ) VALUES
    (v_proj_a, v_owner_a, 'A2 Proj A', 'ACTIVE', 10, 0, 0, '{}'::jsonb),
    (v_proj_b, v_owner_b, 'A2 Proj B', 'ACTIVE', 10, 0, 0, '{}'::jsonb);

  INSERT INTO public.studio_tracks (
    id, project_id, name, track_type, sort_order,
    gain_db, pan, muted, solo, record_armed, effects_chain
  ) VALUES
    (v_track_1, v_proj_a, 'Vox', 'VOCAL', 0, 0, 0, false, false, false, '{}'::jsonb),
    (v_track_b, v_proj_b, 'Other', 'VOCAL', 0, 0, 0, false, false, false, '{}'::jsonb);

  v_snap := jsonb_build_object(
    'snapshotKind', 'MIX_WORKING',
    'ownerId', v_owner_a::text,
    'projectId', v_proj_a::text,
    'sourceDocumentVersion', 11,
    'documentDigest', v_digest,
    'capturedAt', '2026-10-20T12:00:00.000Z',
    'document', jsonb_build_object('project', jsonb_build_object('id', v_proj_a::text))
  );

  ------------------------------------------------------------------
  -- SEC: revisions table grants
  ------------------------------------------------------------------
  IF has_table_privilege('anon', 'public.studio_mix_working_revisions', 'SELECT')
     OR has_table_privilege('anon', 'public.studio_mix_working_revisions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.studio_mix_working_revisions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.studio_mix_working_revisions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.studio_mix_working_revisions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.studio_mix_working_revisions', 'DELETE')
  THEN
    PERFORM pg_temp.a2_fail('SEC_REV_TABLE_DENY', 'anon/auth have DML/SELECT');
  ELSE
    PERFORM pg_temp.a2_pass('SEC_REV_TABLE_DENY');
  END IF;

  IF has_table_privilege('service_role', 'public.studio_mix_working_revisions', 'UPDATE')
     OR has_table_privilege('service_role', 'public.studio_mix_working_revisions', 'DELETE')
  THEN
    PERFORM pg_temp.a2_fail('SEC_REV_APPEND_ONLY', 'service_role can UPDATE/DELETE');
  ELSE
    PERFORM pg_temp.a2_pass('SEC_REV_APPEND_ONLY');
  END IF;

  ------------------------------------------------------------------
  -- Atomic apply + revision
  ------------------------------------------------------------------
  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 10, v_req_1, v_fp_1,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('gain_db', -3)
      ),
      'master', '{}'::jsonb
    ),
    v_digest,
    jsonb_build_object(
      'id', v_rev_1,
      'kind', 'tip_apply',
      'author', 'USER',
      'status', 'accepted',
      'description', 'first',
      'snapshot', v_snap,
      'ops', '[{"op":"set_track_controls"}]'::jsonb
    )
  );

  SELECT document_version INTO v_tip FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_revisions WHERE project_id = v_proj_a;

  IF v_doc_ver = 11 AND v_tip = 11 AND v_replay = false AND v_rev_out = v_rev_1 AND v_cnt = 1 THEN
    PERFORM pg_temp.a2_pass('APPLY_REVISION_ATOMIC', format('ver=%s rev=%s', v_doc_ver, v_rev_out));
  ELSE
    PERFORM pg_temp.a2_fail(
      'APPLY_REVISION_ATOMIC',
      format('ver=%s tip=%s replay=%s rev=%s cnt=%s', v_doc_ver, v_tip, v_replay, v_rev_out, v_cnt)
    );
  END IF;

  ------------------------------------------------------------------
  -- Idempotent replay: no second revision
  ------------------------------------------------------------------
  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 10, v_req_1, v_fp_1,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('gain_db', -3)
      ),
      'master', '{}'::jsonb
    ),
    v_digest,
    jsonb_build_object(
      'id', v_rev_bad,
      'kind', 'tip_apply',
      'author', 'USER',
      'status', 'accepted',
      'snapshot', v_snap
    )
  );
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_revisions WHERE project_id = v_proj_a;
  IF v_replay = true AND v_rev_out = v_rev_1 AND v_cnt = 1 AND v_doc_ver = 11 THEN
    PERFORM pg_temp.a2_pass('IDEMPOTENT_NO_DUP_REVISION');
  ELSE
    PERFORM pg_temp.a2_fail(
      'IDEMPOTENT_NO_DUP_REVISION',
      format('replay=%s rev=%s cnt=%s ver=%s', v_replay, v_rev_out, v_cnt, v_doc_ver)
    );
  END IF;

  ------------------------------------------------------------------
  -- CAS conflict: no revision row
  ------------------------------------------------------------------
  SELECT count(*) INTO v_cnt
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 99, v_req_2, v_fp_2,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('gain_db', -9)
      ),
      'master', '{}'::jsonb
    ),
    v_digest2,
    jsonb_build_object(
      'id', v_rev_bad,
      'kind', 'tip_apply',
      'author', 'USER',
      'status', 'accepted',
      'snapshot', v_snap
    )
  );
  SELECT document_version INTO v_tip FROM public.studio_projects WHERE id = v_proj_a;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_revisions WHERE project_id = v_proj_a;
  IF v_tip = 11 AND v_cnt = 1 THEN
    PERFORM pg_temp.a2_pass('CAS_CONFLICT_NO_REVISION');
  ELSE
    PERFORM pg_temp.a2_fail('CAS_CONFLICT_NO_REVISION', format('tip=%s cnt=%s', v_tip, v_cnt));
  END IF;

  ------------------------------------------------------------------
  -- A3.5-B: client parentRevisionId ignored; parent resolved in-TX
  ------------------------------------------------------------------
  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 11, v_req_3, v_fp_3,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('pan', 0.2)
      ),
      'master', '{}'::jsonb
    ),
    v_digest2,
    jsonb_build_object(
      'id', v_rev_2,
      'kind', 'tip_apply',
      'author', 'USER',
      'status', 'accepted',
      'parentRevisionId', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'snapshot', v_snap
    )
  );
  SELECT parent_revision_id INTO v_parent
  FROM public.studio_mix_working_revisions WHERE id = v_rev_2;
  IF v_doc_ver = 12 AND v_replay = false AND v_parent = v_rev_1 THEN
    PERFORM pg_temp.a2_pass('PARENT_RESOLVED_IN_TX_IGNORES_CLIENT');
  ELSE
    PERFORM pg_temp.a2_fail(
      'PARENT_RESOLVED_IN_TX_IGNORES_CLIENT',
      format('ver=%s replay=%s parent=%s expected=%s', v_doc_ver, v_replay, v_parent, v_rev_1)
    );
  END IF;

  ------------------------------------------------------------------
  -- Restore-shaped revision (new tip + restored kind, parent lineage)
  ------------------------------------------------------------------
  v_snap2 := jsonb_build_object(
    'snapshotKind', 'MIX_WORKING',
    'ownerId', v_owner_a::text,
    'projectId', v_proj_a::text,
    'sourceDocumentVersion', 13,
    'documentDigest', v_digest3,
    'capturedAt', '2026-10-20T12:01:00.000Z',
    'document', jsonb_build_object('project', jsonb_build_object('id', v_proj_a::text))
  );

  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 12, v_req_4, v_fp_4,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('gain_db', 0)
      ),
      'master', '{}'::jsonb
    ),
    v_digest3,
    jsonb_build_object(
      'id', v_rev_3,
      'kind', 'restored',
      'author', 'USER',
      'status', 'accepted',
      'parentRevisionId', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'restoredFromRevisionId', v_rev_1,
      'description', 'restore',
      'snapshot', v_snap2
    )
  );

  SELECT kind, restored_from_revision_id, parent_revision_id
  INTO v_kind, v_restored, v_parent
  FROM public.studio_mix_working_revisions WHERE id = v_rev_3;

  SELECT document_version INTO v_tip FROM public.studio_projects WHERE id = v_proj_a;

  IF v_doc_ver = 13 AND v_tip = 13 AND v_kind = 'restored'
     AND v_restored = v_rev_1 AND v_rev_out = v_rev_3
     AND v_parent = v_rev_2
     AND (SELECT count(*) FROM public.studio_mix_working_revisions WHERE project_id = v_proj_a) = 3
     AND (SELECT count(*) FROM public.studio_mix_working_revisions WHERE id = v_rev_1) = 1
  THEN
    PERFORM pg_temp.a2_pass('RESTORE_NEW_REVISION');
  ELSE
    PERFORM pg_temp.a2_fail(
      'RESTORE_NEW_REVISION',
      format('ver=%s tip=%s kind=%s restored=%s parent=%s', v_doc_ver, v_tip, v_kind, v_restored, v_parent)
    );
  END IF;

  ------------------------------------------------------------------
  -- A3.5-B: foreign parentRevisionId ignored; tip parent used
  ------------------------------------------------------------------
  INSERT INTO public.studio_mix_working_revisions (
    id, owner_id, project_id, parent_revision_id, restored_from_revision_id,
    kind, author, status, description, source_document_version, document_digest,
    snapshot, ops, proposal_id, idempotency_request_id, created_at, accepted_at
  ) VALUES (
    v_rev_foreign, v_owner_b, v_proj_b, NULL, NULL,
    'tip_apply', 'USER', 'accepted', NULL, 10, repeat('f', 64),
    jsonb_build_object(
      'snapshotKind', 'MIX_WORKING',
      'ownerId', v_owner_b::text,
      'projectId', v_proj_b::text,
      'sourceDocumentVersion', 10,
      'documentDigest', repeat('f', 64),
      'capturedAt', '2026-10-20T12:00:00.000Z',
      'document', '{}'::jsonb
    ),
    NULL, NULL, NULL, now(), now()
  );

  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj_a, v_owner_a, 13, v_req_5, v_fp_5,
    jsonb_build_object(
      'tracks', jsonb_build_object(
        v_track_1::text, jsonb_build_object('muted', true)
      ),
      'master', '{}'::jsonb
    ),
    repeat('4', 64),
    jsonb_build_object(
      'id', v_rev_bad,
      'kind', 'tip_apply',
      'author', 'USER',
      'status', 'accepted',
      'parentRevisionId', v_rev_foreign,
      'snapshot', jsonb_build_object(
        'snapshotKind', 'MIX_WORKING',
        'ownerId', v_owner_a::text,
        'projectId', v_proj_a::text,
        'sourceDocumentVersion', 14,
        'documentDigest', repeat('4', 64),
        'capturedAt', '2026-10-20T12:02:00.000Z',
        'document', jsonb_build_object('project', jsonb_build_object('id', v_proj_a::text))
      )
    )
  );
  SELECT parent_revision_id INTO v_parent
  FROM public.studio_mix_working_revisions WHERE id = v_rev_bad;
  SELECT document_version INTO v_tip FROM public.studio_projects WHERE id = v_proj_a;
  IF v_tip = 14 AND v_parent = v_rev_3 AND v_parent IS DISTINCT FROM v_rev_foreign THEN
    PERFORM pg_temp.a2_pass('FOREIGN_PARENT_IGNORED');
  ELSE
    PERFORM pg_temp.a2_fail(
      'FOREIGN_PARENT_IGNORED',
      format('tip=%s parent=%s foreign=%s', v_tip, v_parent, v_rev_foreign)
    );
  END IF;

  ------------------------------------------------------------------
  -- Cleanup
  ------------------------------------------------------------------
  DELETE FROM public.studio_mix_working_idempotency
    WHERE project_id IN (v_proj_a, v_proj_b);
  DELETE FROM public.studio_mix_working_revisions
    WHERE project_id IN (v_proj_a, v_proj_b);
  DELETE FROM public.studio_tracks WHERE project_id IN (v_proj_a, v_proj_b);
  DELETE FROM public.studio_projects WHERE id IN (v_proj_a, v_proj_b);
  DELETE FROM public.profiles WHERE id IN (v_owner_a, v_owner_b);
  DELETE FROM auth.users WHERE id IN (v_owner_a, v_owner_b);
END;
$$;

SELECT 'RESULT|' || case_id || '|' || status || '|' || detail
FROM a2_results
ORDER BY case_id;
