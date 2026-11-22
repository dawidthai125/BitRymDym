-- Plan-expiry e-mail (2026-11-22): remembers which expires_at was already warned about,
-- so an extension (new expires_at) can be warned again. Additive, nullable, no backfill.
ALTER TABLE public.premium_entitlements ADD COLUMN IF NOT EXISTS plan_expiry_notified_for timestamptz;
COMMENT ON COLUMN public.premium_entitlements.plan_expiry_notified_for IS 'Set by /api/cron/takes-expiry-notice to the expires_at it warned about before the "plan kończy się" e-mail; null = never mailed.';
