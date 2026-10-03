-- W2-A — Premium tier foundation
-- Design Contract: docs/decisions/W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md
-- OD-08 CLOSED: FREE / BRONZE / SILVER / GOLD
-- Legacy binary active+valid Premium → SILVER (not GOLD)
-- Does NOT enable billing, UI, recording overlay, artifact janitor, or download cutover.

CREATE TYPE public.premium_tier AS ENUM (
  'FREE',
  'BRONZE',
  'SILVER',
  'GOLD'
);

ALTER TABLE public.premium_entitlements
  ADD COLUMN tier public.premium_tier NOT NULL DEFAULT 'FREE';

COMMENT ON COLUMN public.premium_entitlements.tier IS
  'W2-A Premium product tier (OD-08). Effective FREE when inactive/expired. Legacy active binary rows backfilled to SILVER.';

COMMENT ON TYPE public.premium_tier IS
  'Creator Progress W2 Premium tiers — ≠ account_level ≠ CreatorRank ≠ role.';

-- Legacy mapping (deterministic, idempotent):
-- active AND (expires_at IS NULL OR expires_at > now()) → SILVER
-- otherwise → FREE
UPDATE public.premium_entitlements
SET tier = CASE
  WHEN active = true
       AND (expires_at IS NULL OR expires_at > now())
  THEN 'SILVER'::public.premium_tier
  ELSE 'FREE'::public.premium_tier
END;

-- Defense-in-depth: table DML only via service_role (trigger already enforces).
-- Keep SELECT for authenticated (own-row RLS policy).
REVOKE INSERT, UPDATE, DELETE ON public.premium_entitlements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.premium_entitlements FROM authenticated;

GRANT USAGE ON TYPE public.premium_tier TO authenticated;
GRANT USAGE ON TYPE public.premium_tier TO service_role;
