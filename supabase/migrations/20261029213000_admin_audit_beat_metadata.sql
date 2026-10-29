-- Admin beat catalogue: allow BEAT_METADATA_UPDATE in admin_audit_events.
-- Inserted via service_role from updateBeatMetadata (src/lib/beats/service.ts)
-- after the ADMIN + beats.edit check. No new grants; table stays closed to
-- anon/authenticated.

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
      'BEAT_METADATA_UPDATE'
    )
  );

COMMENT ON TABLE public.admin_audit_events IS
  'Admin mutation audit. Includes SAMPLE_POLICY_UPDATE (P1) and BEAT_METADATA_UPDATE (admin beat catalogue) via service_role.';
