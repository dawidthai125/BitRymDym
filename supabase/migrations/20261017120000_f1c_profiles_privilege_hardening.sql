-- F1-C Security hardening: profiles privilege protection (defense in depth).
--
-- 1) prevent_privilege_escalation() is SECURITY DEFINER (owner postgres), so inside it
--    current_user is always 'postgres' and the previous maintainer bypass
--    (current_user IS DISTINCT FROM 'postgres') was never false for API callers.
--    session_user is not changed by SECURITY DEFINER: it stays 'authenticator' for
--    PostgREST requests and 'postgres' only for maintainer sessions.
--    search_path is emptied; the body only references schema-qualified auth.role().
-- 2) Client roles lose table-level INSERT/UPDATE on profiles. Profile rows are created
--    by handle_new_user() (SECURITY DEFINER); the only client write is
--    updateDisplayNameAction -> UPDATE (display_name), granted at column level.
--    SELECT, RLS policies and service_role privileges are unchanged.
-- 3) Final ACL / function definition is asserted; any mismatch aborts the migration.

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.account_level IS DISTINCT FROM OLD.account_level
       OR NEW.experience_total IS DISTINCT FROM OLD.experience_total THEN
      IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
         AND session_user IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION
          'Changing role, account_level, or experience_total is not allowed for this caller';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Revoking the table-level privilege also revokes column-level privileges of the same type.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;

DO $$
DECLARE
  v_role text;
  v_col record;
  v_fn record;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.profiles', 'INSERT')
       OR has_table_privilege(v_role, 'public.profiles', 'UPDATE') THEN
      RAISE EXCEPTION 'F1-C assert: % still has table-level INSERT/UPDATE on public.profiles', v_role;
    END IF;

    FOR v_col IN
      SELECT attname
      FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.profiles'::regclass
        AND attnum > 0
        AND NOT attisdropped
    LOOP
      IF has_column_privilege(v_role, 'public.profiles', v_col.attname, 'INSERT') THEN
        RAISE EXCEPTION 'F1-C assert: % has INSERT on public.profiles.%', v_role, v_col.attname;
      END IF;

      IF has_column_privilege(v_role, 'public.profiles', v_col.attname, 'UPDATE')
         IS DISTINCT FROM (v_role = 'authenticated' AND v_col.attname = 'display_name') THEN
        RAISE EXCEPTION 'F1-C assert: unexpected UPDATE privilege state for % on public.profiles.%',
          v_role, v_col.attname;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'F1-C assert: authenticated lost SELECT on public.profiles';
  END IF;

  IF NOT (
    has_table_privilege('service_role', 'public.profiles', 'SELECT')
    AND has_table_privilege('service_role', 'public.profiles', 'INSERT')
    AND has_table_privilege('service_role', 'public.profiles', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'F1-C assert: service_role lost privileges on public.profiles';
  END IF;

  SELECT p.prosecdef, p.proconfig, p.prosrc
  INTO v_fn
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.prevent_privilege_escalation()'::regprocedure;

  IF NOT v_fn.prosecdef
     OR v_fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
     OR v_fn.prosrc !~ 'session_user IS DISTINCT FROM ''postgres'''
     OR v_fn.prosrc ~* 'current_user' THEN
    RAISE EXCEPTION 'F1-C assert: unexpected definition of public.prevent_privilege_escalation()';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_prevent_privilege_escalation'
      AND tgfoid = 'public.prevent_privilege_escalation()'::regprocedure
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'F1-C assert: profiles_prevent_privilege_escalation trigger missing or disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname = 'profiles_update_own'
  ) OR NOT (
    SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.profiles'::regclass
  ) THEN
    RAISE EXCEPTION 'F1-C assert: profiles RLS or profiles_update_own policy missing';
  END IF;
END;
$$;
