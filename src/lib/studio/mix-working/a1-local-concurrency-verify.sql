-- A1 concurrency verification (single-session prep + barrier via advisory + two later sessions).
-- This file prepares fixtures and defines helper RPCs; driver runs parallel sessions.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_owner uuid := 'a2000001-0001-4001-8001-0000000000a1';
  v_proj uuid := 'a2000003-0003-4003-8003-0000000000c3';
  v_t1 uuid := 'a2000005-0005-4005-8005-0000000000e5';
  v_t2 uuid := 'a2000006-0006-4006-8006-0000000000f6';
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  DELETE FROM public.studio_mix_working_idempotency WHERE project_id = v_proj OR owner_id = v_owner;
  DELETE FROM public.studio_projects WHERE id = v_proj;
  DELETE FROM public.profiles WHERE id = v_owner;
  DELETE FROM auth.users WHERE id = v_owner;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
    'a1-conc@example.local', crypt('a1-test', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );

  UPDATE public.profiles
  SET display_name = 'A1 Conc', role = 'USER', account_level = 'BEGINNER_RAPPER'
  WHERE id = v_owner;
  INSERT INTO public.profiles (id, display_name, role, account_level)
  SELECT v_owner, 'A1 Conc', 'USER', 'BEGINNER_RAPPER'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner);

  INSERT INTO public.studio_projects (id, owner_id, title, status, document_version, master_gain_db, master_pan)
  VALUES (v_proj, v_owner, 'A1 Conc', 'ACTIVE', 20, 0, 0);

  INSERT INTO public.studio_tracks (id, project_id, name, track_type, sort_order, gain_db, pan, muted, solo, record_armed)
  VALUES
    (v_t1, v_proj, 'T1', 'VOCAL', 0, 0, 0, false, false, false),
    (v_t2, v_proj, 'T2', 'VOCAL', 1, 0, 0, false, false, false);
END;
$$;

SELECT 'PREP_OK' AS status,
       document_version
FROM public.studio_projects
WHERE id = 'a2000003-0003-4003-8003-0000000000c3';
