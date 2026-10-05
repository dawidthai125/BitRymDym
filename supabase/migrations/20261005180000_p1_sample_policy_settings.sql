-- P1 Sample Policy Matrix — Admin duration overrides SSOT + audit action
-- Owner GO: BRONZE/SILVER/GOLD max recording seconds (1..180).
-- Does NOT migrate users, profiles, takes, beats, or Storage.

-- ---------------------------------------------------------------------------
-- sample_policy_settings (singleton row id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sample_policy_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bronze_max_recording_seconds integer NOT NULL DEFAULT 60
    CHECK (
      bronze_max_recording_seconds >= 1
      AND bronze_max_recording_seconds <= 180
    ),
  silver_max_recording_seconds integer NOT NULL DEFAULT 120
    CHECK (
      silver_max_recording_seconds >= 1
      AND silver_max_recording_seconds <= 180
    ),
  gold_max_recording_seconds integer NOT NULL DEFAULT 180
    CHECK (
      gold_max_recording_seconds >= 1
      AND gold_max_recording_seconds <= 180
    ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.sample_policy_settings IS
  'P1 Admin overrides for BRONZE/SILVER/GOLD max recording duration. ANON/FREE fixed in app config.';

INSERT INTO public.sample_policy_settings (
  id,
  bronze_max_recording_seconds,
  silver_max_recording_seconds,
  gold_max_recording_seconds
)
VALUES (1, 60, 120, 180)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sample_policy_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sample_policy_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.sample_policy_settings FROM anon;
REVOKE ALL ON TABLE public.sample_policy_settings FROM authenticated;

-- service_role retains full access (default Supabase); app uses admin client.

-- ---------------------------------------------------------------------------
-- Extend admin_audit_events.action CHECK for sample_policy.update
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
      'SAMPLE_POLICY_UPDATE'
    )
  );

COMMENT ON TABLE public.admin_audit_events IS
  'Admin mutation audit. Includes SAMPLE_POLICY_UPDATE (P1) via service_role.';
