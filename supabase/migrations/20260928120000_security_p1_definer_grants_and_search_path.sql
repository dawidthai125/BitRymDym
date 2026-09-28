-- P1 security hardening (Owner GO 2026-09-28)
-- P1-B: selective REVOKE EXECUTE on DEFINER helpers / trigger-only functions
-- P1-C: set_updated_at search_path + pg_catalog.now() + trigger-only REVOKE
-- Does NOT change claim/download RPC grants (already service_role-only).
-- Does NOT change function business logic or SECURITY DEFINER → INVOKER.

-- ---------------------------------------------------------------------------
-- P1-C: set_updated_at hardening
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- Trigger-only: no client EXECUTE
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- P1-B: trigger-only SECURITY DEFINER helpers — revoke client + PUBLIC
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_beat_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_beat_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_beat_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_beat_audio_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_beat_audio_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_beat_audio_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_take_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_take_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_take_privilege_escalation() FROM authenticated;

-- ---------------------------------------------------------------------------
-- P1-B: RLS helpers — revoke PUBLIC + anon; KEEP authenticated
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ---------------------------------------------------------------------------
-- P1-B: current_user_role — no RLS / app RPC usage; revoke all clients
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM authenticated;

-- Claim / download RPCs intentionally untouched (postgres + service_role only).
