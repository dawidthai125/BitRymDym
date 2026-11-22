-- 2026-11-22: admin panel "Zwroty do sprawdzenia" closes payment_order_reviews and writes
-- an audit entry. Adds PAYMENT_REVIEW_RESOLVE to the allowed admin_audit_events actions.

alter table public.admin_audit_events drop constraint if exists admin_audit_events_action_chk;
alter table public.admin_audit_events add constraint admin_audit_events_action_chk check (
  action = any (array[
    'ROLE_CHANGE', 'ADMIN_GRANT', 'ADMIN_REVOKE', 'MODERATOR_GRANT', 'MODERATOR_REVOKE',
    'PREMIUM_TIER_CHANGE', 'PREMIUM_EXPIRATION_CHANGE', 'USER_ACCOUNT_DELETE', 'SAMPLE_POLICY_UPDATE',
    'BEAT_METADATA_UPDATE', 'SITE_MAINTENANCE_UPDATE', 'PLAN_ADDON_GRANT', 'PLAN_ADDON_REVOKE',
    'BEAT_COVER_REVIEW', 'BEAT_OWNER_UPDATE', 'USAGE_RESET', 'PAYMENT_REVIEW_RESOLVE'
  ]::text[])
);
