-- DEF-01: E3.1 trigger DEFINER EXECUTE hardening (Owner GO 2026-10-03)
-- Mirror P1-B trigger-only posture for four functions created after P1-B.
-- REVOKE EXECUTE from PUBLIC / anon / authenticated only.
-- Does NOT change function bodies, triggers, SECURITY DEFINER, search_path,
-- or DEF-02 RLS helpers (is_admin / is_moderator / is_staff).
-- REVOKE is idempotent if already absent.

-- Exact zero-arg signatures verified live on production before authoring:
--   public.prevent_audio_artifact_privilege_escalation()
--   public.prevent_mix_session_privilege_escalation()
--   public.prevent_premium_entitlement_privilege_escalation()
--   public.prevent_render_job_privilege_escalation()

REVOKE EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_audio_artifact_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_mix_session_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_premium_entitlement_privilege_escalation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_render_job_privilege_escalation() FROM authenticated;
