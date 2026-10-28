-- A3.5 LOCAL VERIFICATION — parent-in-TX, concurrency, fault injection.
-- Synthetic data only. docker exec → supabase_db_bitrymdym-local.
-- Output: RESULT|<case>|<PASS|FAIL>|<detail>

\set ON_ERROR_STOP on

CREATE TEMP TABLE a35_results (
  case_id text PRIMARY KEY,
  status text NOT NULL,
  detail text NOT NULL DEFAULT ''
);

CREATE OR REPLACE FUNCTION pg_temp.a35_pass(p_case text, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO a35_results(case_id, status, detail) VALUES (p_case, 'PASS', p_detail)
  ON CONFLICT (case_id) DO UPDATE SET status='PASS', detail=EXCLUDED.detail;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a35_fail(p_case text, p_detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO a35_results(case_id, status, detail) VALUES (p_case, 'FAIL', p_detail)
  ON CONFLICT (case_id) DO UPDATE SET status='FAIL', detail=EXCLUDED.detail;
END;
$$;

DO $$
DECLARE
  v_owner uuid := 'a3500001-0001-4001-8001-0000000000a1';
  v_proj uuid := 'a3500003-0003-4003-8003-0000000000c3';
  v_track uuid := 'a3500005-0005-4005-8005-0000000000e5';
  v_req_1 uuid := 'a3500010-0010-4010-8010-000000000010';
  v_req_2 uuid := 'a3500011-0011-4011-8011-000000000011';
  v_req_3 uuid := 'a3500012-0012-4012-8012-000000000012';
  v_req_4 uuid := 'a3500013-0013-4013-8013-000000000013';
  v_req_fault uuid := 'a3500014-0014-4014-8014-000000000014';
  v_rev_1 uuid := 'a3500020-0020-4020-8020-000000000020';
  v_rev_2 uuid := 'a3500021-0021-4021-8021-000000000021';
  v_rev_3 uuid := 'a3500022-0022-4022-8022-000000000022';
  v_rev_fault uuid := 'a3500023-0023-4023-8023-000000000023';
  v_fp_1 text := repeat('1', 64);
  v_fp_2 text := repeat('2', 64);
  v_fp_3 text := repeat('3', 64);
  v_fp_4 text := repeat('4', 64);
  v_fp_fault text := repeat('5', 64);
  v_d1 text := repeat('a', 64);
  v_d2 text := repeat('b', 64);
  v_d3 text := repeat('c', 64);
  v_d4 text := repeat('d', 64);
  v_df text := repeat('e', 64);
  v_snap jsonb;
  v_doc_ver int;
  v_replay boolean;
  v_rev_out uuid;
  v_tip int;
  v_parent uuid;
  v_cnt int;
  v_idem int;
  v_win_cnt int;
  v_master_pan double precision;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  DELETE FROM public.studio_mix_working_idempotency
    WHERE project_id = v_proj OR owner_id = v_owner;
  DELETE FROM public.studio_mix_working_revisions
    WHERE project_id = v_proj OR owner_id = v_owner;
  DELETE FROM public.studio_tracks WHERE project_id = v_proj;
  DELETE FROM public.studio_projects WHERE id = v_proj;
  DELETE FROM public.profiles WHERE id = v_owner;
  DELETE FROM auth.users WHERE id = v_owner;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
    'a35-owner@example.local', crypt('a35-test', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  INSERT INTO public.profiles (id, display_name, role, account_level)
  VALUES (v_owner, 'A35 Owner', 'USER', 'BEGINNER_RAPPER')
  ON CONFLICT (id) DO UPDATE
    SET display_name = 'A35 Owner', role = 'USER', account_level = 'BEGINNER_RAPPER';

  INSERT INTO public.studio_projects (
    id, owner_id, title, status, document_version,
    master_gain_db, master_pan, master_fx_chain
  ) VALUES (v_proj, v_owner, 'A35 Proj', 'ACTIVE', 1, 0, 0, '{}'::jsonb);

  INSERT INTO public.studio_tracks (
    id, project_id, name, track_type, sort_order,
    gain_db, pan, muted, solo, record_armed, effects_chain
  ) VALUES (v_track, v_proj, 'Vox', 'VOCAL', 0, 0, 0, false, false, false, '{}'::jsonb);

  v_snap := jsonb_build_object(
    'snapshotKind', 'MIX_WORKING',
    'ownerId', v_owner::text,
    'projectId', v_proj::text,
    'sourceDocumentVersion', 2,
    'documentDigest', v_d1,
    'capturedAt', '2026-10-20T20:00:00.000Z',
    'document', jsonb_build_object('project', jsonb_build_object('id', v_proj::text))
  );

  -- First apply: no prior revision → parent NULL
  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj, v_owner, 1, v_req_1, v_fp_1,
    jsonb_build_object(
      'tracks', jsonb_build_object(v_track::text, jsonb_build_object('gain_db', -1)),
      'master', '{}'::jsonb
    ),
    v_d1,
    jsonb_build_object(
      'id', v_rev_1, 'kind', 'tip_apply', 'author', 'USER', 'status', 'accepted',
      'snapshot', v_snap
    )
  );
  SELECT parent_revision_id INTO v_parent
  FROM public.studio_mix_working_revisions WHERE id = v_rev_1;
  IF v_doc_ver = 2 AND v_parent IS NULL THEN
    PERFORM pg_temp.a35_pass('FIRST_PARENT_NULL');
  ELSE
    PERFORM pg_temp.a35_fail('FIRST_PARENT_NULL', format('ver=%s parent=%s', v_doc_ver, v_parent));
  END IF;

  -- Second apply: parent = tip revision for version 2
  SELECT document_version, replay, revision_id
  INTO v_doc_ver, v_replay, v_rev_out
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj, v_owner, 2, v_req_2, v_fp_2,
    jsonb_build_object(
      'tracks', jsonb_build_object(v_track::text, jsonb_build_object('pan', 0.25)),
      'master', jsonb_build_object('master_gain_db', -2)
    ),
    v_d2,
    jsonb_build_object(
      'id', v_rev_2, 'kind', 'tip_apply', 'author', 'USER', 'status', 'accepted',
      'parentRevisionId', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'snapshot', jsonb_build_object(
        'snapshotKind', 'MIX_WORKING',
        'ownerId', v_owner::text,
        'projectId', v_proj::text,
        'sourceDocumentVersion', 3,
        'documentDigest', v_d2,
        'capturedAt', '2026-10-20T20:01:00.000Z',
        'document', jsonb_build_object('project', jsonb_build_object('id', v_proj::text))
      )
    )
  );
  SELECT parent_revision_id INTO v_parent
  FROM public.studio_mix_working_revisions WHERE id = v_rev_2;
  IF v_doc_ver = 3 AND v_parent = v_rev_1 THEN
    PERFORM pg_temp.a35_pass('PARENT_FROM_TIP_VERSION');
  ELSE
    PERFORM pg_temp.a35_fail(
      'PARENT_FROM_TIP_VERSION',
      format('ver=%s parent=%s expected=%s', v_doc_ver, v_parent, v_rev_1)
    );
  END IF;

  -- Concurrent CAS: two ops same expected; only one wins
  v_win_cnt := 0;
  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj, v_owner, 3, v_req_3, v_fp_3,
      jsonb_build_object(
        'tracks', jsonb_build_object(v_track::text, jsonb_build_object('muted', true)),
        'master', '{}'::jsonb
      ),
      v_d3,
      jsonb_build_object(
        'id', v_rev_3, 'kind', 'tip_apply', 'author', 'USER', 'status', 'accepted',
        'snapshot', jsonb_build_object(
          'snapshotKind', 'MIX_WORKING',
          'ownerId', v_owner::text,
          'projectId', v_proj::text,
          'sourceDocumentVersion', 4,
          'documentDigest', v_d3,
          'capturedAt', '2026-10-20T20:02:00.000Z',
          'document', jsonb_build_object('project', jsonb_build_object('id', v_proj::text))
        )
      )
    );
    v_win_cnt := v_win_cnt + 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Loser: same expected after tip moved → empty result (no exception)
  SELECT count(*) INTO v_cnt
  FROM public.studio_cas_apply_mix_working_ops(
    v_proj, v_owner, 3, v_req_4, v_fp_4,
    jsonb_build_object(
      'tracks', jsonb_build_object(v_track::text, jsonb_build_object('solo', true)),
      'master', '{}'::jsonb
    ),
    v_d4,
    jsonb_build_object(
      'id', 'a3500024-0024-4024-8024-000000000024',
      'kind', 'tip_apply', 'author', 'USER', 'status', 'accepted',
      'snapshot', jsonb_build_object(
        'snapshotKind', 'MIX_WORKING',
        'ownerId', v_owner::text,
        'projectId', v_proj::text,
        'sourceDocumentVersion', 4,
        'documentDigest', v_d4,
        'capturedAt', '2026-10-20T20:03:00.000Z',
        'document', jsonb_build_object('project', jsonb_build_object('id', v_proj::text))
      )
    )
  );
  SELECT document_version INTO v_tip FROM public.studio_projects WHERE id = v_proj;
  SELECT count(*) INTO v_cnt FROM public.studio_mix_working_revisions WHERE project_id = v_proj;
  SELECT count(*) INTO v_idem FROM public.studio_mix_working_idempotency
    WHERE project_id = v_proj AND request_id = v_req_4;
  IF v_tip = 4 AND v_cnt = 3 AND v_idem = 0 AND v_win_cnt = 1 THEN
    PERFORM pg_temp.a35_pass('CAS_LOSER_NO_REVISION_NO_LEDGER');
  ELSE
    PERFORM pg_temp.a35_fail(
      'CAS_LOSER_NO_REVISION_NO_LEDGER',
      format('tip=%s revs=%s idem4=%s win=%s', v_tip, v_cnt, v_idem, v_win_cnt)
    );
  END IF;

  SELECT parent_revision_id INTO v_parent
  FROM public.studio_mix_working_revisions WHERE id = v_rev_3;
  IF v_parent = v_rev_2 THEN
    PERFORM pg_temp.a35_pass('WINNER_PARENT_CORRECT');
  ELSE
    PERFORM pg_temp.a35_fail('WINNER_PARENT_CORRECT', format('parent=%s', v_parent));
  END IF;

  -- Fault injection: revision INSERT fails → full rollback
  CREATE OR REPLACE FUNCTION pg_temp.a35_fault_revision()
  RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN
    RAISE EXCEPTION 'A35_FAULT_REVISION_INSERT';
  END;
  $t$;
  CREATE TRIGGER a35_fault_revision
  BEFORE INSERT ON public.studio_mix_working_revisions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.a35_fault_revision();

  BEGIN
    PERFORM * FROM public.studio_cas_apply_mix_working_ops(
      v_proj, v_owner, 4, v_req_fault, v_fp_fault,
      jsonb_build_object(
        'master', jsonb_build_object('master_pan', -0.5),
        'tracks', '{}'::jsonb
      ),
      v_df,
      jsonb_build_object(
        'id', v_rev_fault, 'kind', 'tip_apply', 'author', 'USER', 'status', 'accepted',
        'snapshot', jsonb_build_object(
          'snapshotKind', 'MIX_WORKING',
          'ownerId', v_owner::text,
          'projectId', v_proj::text,
          'sourceDocumentVersion', 5,
          'documentDigest', v_df,
          'capturedAt', '2026-10-20T20:04:00.000Z',
          'document', jsonb_build_object('project', jsonb_build_object('id', v_proj::text))
        )
      )
    );
    PERFORM pg_temp.a35_fail('REVISION_FAULT_ROLLBACK', 'expected exception');
  EXCEPTION WHEN OTHERS THEN
    SELECT document_version INTO v_tip FROM public.studio_projects WHERE id = v_proj;
    SELECT count(*) INTO v_cnt FROM public.studio_mix_working_revisions WHERE project_id = v_proj;
    SELECT count(*) INTO v_idem FROM public.studio_mix_working_idempotency
      WHERE project_id = v_proj AND request_id = v_req_fault;
    SELECT master_pan INTO v_master_pan FROM public.studio_projects WHERE id = v_proj;
    IF v_tip = 4 AND v_cnt = 3 AND v_idem = 0 AND v_master_pan = 0 THEN
      PERFORM pg_temp.a35_pass('REVISION_FAULT_ROLLBACK');
    ELSE
      PERFORM pg_temp.a35_fail(
        'REVISION_FAULT_ROLLBACK',
        format('tip=%s revs=%s idem=%s pan=%s err=%s', v_tip, v_cnt, v_idem, v_master_pan, SQLERRM)
      );
    END IF;
  END;

  DROP TRIGGER IF EXISTS a35_fault_revision ON public.studio_mix_working_revisions;

  -- Unique tip-version index present
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'studio_mix_working_revisions_project_source_version_uidx'
  ) THEN
    PERFORM pg_temp.a35_pass('SOURCE_VERSION_UNIQUE_INDEX');
  ELSE
    PERFORM pg_temp.a35_fail('SOURCE_VERSION_UNIQUE_INDEX', 'missing');
  END IF;

  DELETE FROM public.studio_mix_working_idempotency WHERE project_id = v_proj;
  DELETE FROM public.studio_mix_working_revisions WHERE project_id = v_proj;
  DELETE FROM public.studio_tracks WHERE project_id = v_proj;
  DELETE FROM public.studio_projects WHERE id = v_proj;
  DELETE FROM public.profiles WHERE id = v_owner;
  DELETE FROM auth.users WHERE id = v_owner;
END;
$$;

SELECT 'RESULT|' || case_id || '|' || status || '|' || detail
FROM a35_results
ORDER BY case_id;
