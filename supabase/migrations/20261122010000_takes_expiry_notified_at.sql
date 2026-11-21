-- Take-expiry e-mail (2026-11-22): one mail per take. Additive, nullable, no backfill.
ALTER TABLE public.takes ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;
COMMENT ON COLUMN public.takes.expiry_notified_at IS 'Set by /api/cron/takes-expiry-notice before the "nagranie wygasa" e-mail; null = not mailed yet.';
