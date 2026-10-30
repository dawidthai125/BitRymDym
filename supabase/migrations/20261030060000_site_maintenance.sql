-- Maintenance mode ("Trwają prace") — Owner request 2026-10-30.
-- Singleton site_settings row (id = 1) is the SSOT for the site on/off flag.
-- Writes: service_role only (ADMIN check + audit in src/lib/site/maintenance-settings.ts).
-- Reads: SECURITY DEFINER RPC get_site_maintenance() (anon + authenticated) so the
-- middleware can read the flag and the viewer's ADMIN role in one call without
-- opening the table itself. Additive; touches no user data.

CREATE TABLE IF NOT EXISTS public.site_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_enabled boolean NOT NULL DEFAULT false,
  maintenance_message text
    CHECK (maintenance_message IS NULL OR char_length(maintenance_message) <= 500),
  maintenance_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.site_settings IS
  'Site-wide switches (singleton id = 1). maintenance_* = admin "Trwają prace" mode. service_role writes only.';

INSERT INTO public.site_settings (id, maintenance_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.site_settings FROM anon;
REVOKE ALL ON TABLE public.site_settings FROM authenticated;

-- ---------------------------------------------------------------------------
-- get_site_maintenance() — public state + whether the caller is an ADMIN.
-- Exposes only what the maintenance page shows anyway (flag, message, end time).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_site_maintenance()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE(s.maintenance_enabled, false),
    'message', s.maintenance_message,
    'until', s.maintenance_until,
    'viewerIsAdmin', EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'ADMIN'
    )
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.site_settings s ON s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_site_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_maintenance() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit: SITE_MAINTENANCE_UPDATE (inserted via service_role after ADMIN check).
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT IF EXISTS admin_audit_events_action_chk;

ALTER TABLE public.admin_audit_events
  ADD CONSTRAINT admin_audit_events_action_chk CHECK (
    action IN (
      'ROLE_CHANGE',
      'ADMIN_GRANT',
      'ADMIN_REVOKE',
      'MODERATOR_GRANT',
      'MODERATOR_REVOKE',
      'PREMIUM_TIER_CHANGE',
      'PREMIUM_EXPIRATION_CHANGE',
      'USER_ACCOUNT_DELETE',
      'SAMPLE_POLICY_UPDATE',
      'BEAT_METADATA_UPDATE',
      'SITE_MAINTENANCE_UPDATE'
    )
  );

COMMENT ON TABLE public.admin_audit_events IS
  'Admin mutation audit. Includes SAMPLE_POLICY_UPDATE, BEAT_METADATA_UPDATE and SITE_MAINTENANCE_UPDATE via service_role.';
