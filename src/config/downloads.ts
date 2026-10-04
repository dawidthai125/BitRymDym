/**
 * Phase 1.8A Download Productization — identity / TTL config.
 * Design Freeze: docs/phases/PHASE_1_8A_DESIGN_FREEZE.md
 *
 * W2-B: authenticated USER daily download limit is NO LONGER this flat USER=4
 * constant — runtime uses Product Entitlement `limits.downloadsDaily`
 * (FREE 4 / BRONZE 10 / SILVER 25 / GOLD 50). ANON remains 2 via
 * `PREMIUM_ANON_DOWNLOADS_DAILY` (see premium-tiers + dailyDownloadLimitForActor).
 *
 * `ANONYMOUS_DAILY_DOWNLOAD_LIMIT` / `USER_DAILY_DOWNLOAD_LIMIT` below are
 * compatibility mirrors for tests/docs (defaults only). Runtime reserve path
 * does not read USER_DAILY_DOWNLOAD_LIMIT.
 */

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** OD-05 baseline mirror — runtime ANON uses PREMIUM_ANON_DOWNLOADS_DAILY. */
export const ANONYMOUS_DAILY_DOWNLOAD_LIMIT = parsePositiveInt(
  process.env.DOWNLOAD_LIMIT_ANON_DAILY,
  2,
);

/**
 * FREE-tier baseline mirror (compatibility).
 * Not authoritative for paid tiers — do not use for USER reserve in W2-B+.
 */
export const USER_DAILY_DOWNLOAD_LIMIT = parsePositiveInt(
  process.env.DOWNLOAD_LIMIT_USER_DAILY,
  4,
);

/**
 * Ephemeral slot hold TTL (seconds) while signed URL is issued.
 * Not a DOWNLOAD_EVENT; expired holds free the slot.
 */
export const DOWNLOAD_RESERVATION_TTL_SECONDS = parsePositiveInt(
  process.env.DOWNLOAD_RESERVATION_TTL_SECONDS,
  120,
);

/** httpOnly opaque anonymous download identity cookie */
export const ANON_DOWNLOAD_COOKIE_NAME = "brd_dl_aid";

/** Cookie Max-Age (≥ 400 days per freeze) */
export const ANON_DOWNLOAD_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
