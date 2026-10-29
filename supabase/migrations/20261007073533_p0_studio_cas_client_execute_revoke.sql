-- P0 Security hardening:
-- explicitly revoke studio_cas_* EXECUTE from anon/authenticated
-- because REVOKE FROM PUBLIC does not remove role-level default grants
-- (ALTER DEFAULT PRIVILEGES on schema public grants EXECUTE to anon/authenticated).
-- service_role remains the intended execution role.
-- ACL-only — no function body / signature / table / RLS changes.
-- Pattern: claim_* revoke + DEF-01 (REVOKE FROM PUBLIC, anon, authenticated).

-- Exact signatures verified live before authoring.

REVOKE ALL ON FUNCTION public.studio_cas_apply_fx_chain(
  uuid, uuid, integer, jsonb, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_fx_chain(
  uuid, uuid, integer, jsonb, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_fx_chain(
  uuid, uuid, integer, jsonb, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_fades(
  uuid, uuid, uuid, integer, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_fades(
  uuid, uuid, uuid, integer, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_fades(
  uuid, uuid, uuid, integer, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_geometry_fades(
  uuid, uuid, uuid, integer, integer, integer, integer, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_geometry_fades(
  uuid, uuid, uuid, integer, integer, integer, integer, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_geometry_fades(
  uuid, uuid, uuid, integer, integer, integer, integer, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_cas_apply_clip_split(
  uuid, uuid, uuid, integer,
  integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer
) TO service_role;
