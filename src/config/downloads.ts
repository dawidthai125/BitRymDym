/**
 * Phase 1.8A Download Productization — limit / identity config SSOT.
 * Design Freeze: docs/phases/PHASE_1_8A_DESIGN_FREEZE.md
 * Conceptual SSOT keys: anonymous_daily_download_limit, user_daily_download_limit.
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

/** OD-05 FROZEN: anonymous_daily_download_limit = 2 */
export const ANONYMOUS_DAILY_DOWNLOAD_LIMIT = parsePositiveInt(
  process.env.DOWNLOAD_LIMIT_ANON_DAILY,
  2,
);

/** OD-06 FROZEN: user_daily_download_limit = 4 */
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
