-- Account deletion: let FK ON DELETE CASCADE remove Studio rows when a user is
-- deleted by Supabase Auth (or by an admin in the dashboard).
--
-- The Studio guard triggers raise unless auth.role() = 'service_role'. During
-- auth.admin.deleteUser the cascade auth.users → profiles → studio_projects →
-- studio_tracks / studio_clips / studio_final_* runs inside GoTrue's own
-- connection, where no JWT is set (auth.role() IS NULL), so the guard blocked
-- the cascade and deleteUser failed whenever Studio rows were still present.
--
-- New rule (DELETE only): a delete is also allowed when it is a nested
-- trigger action (pg_trigger_depth() > 1, i.e. an FK cascade) AND the caller is
-- not an API client (auth.role() is neither 'authenticated' nor 'anon').
-- INSERT / UPDATE and direct client DELETEs are rejected exactly as before.

CREATE OR REPLACE FUNCTION public.studio_guard_cascade_delete_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_trigger_depth() > 1
     AND COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon');
$$;
REVOKE ALL ON FUNCTION public.studio_guard_cascade_delete_allowed() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.studio_guard_cascade_delete_allowed() IS
  'True only for FK-cascade deletes outside API client roles (e.g. Supabase Auth deleting a user). Used by Studio guard triggers.';

CREATE OR REPLACE FUNCTION public.prevent_studio_project_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed()) THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_projects';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_studio_track_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed()) THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_tracks';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_studio_clip_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed()) THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_clips';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_studio_final_versions_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed()) THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_final_versions';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_studio_final_version_grants_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed()) THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_final_version_grants';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_studio_final_stages_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed()) THEN
      RAISE EXCEPTION 'Only service_role may mutate studio_final_stages';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
