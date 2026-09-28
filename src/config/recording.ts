/**
 * Recording Wave 1 — retention / anti-abuse config constants only.
 * Entitlement enforcement is later waves. MediaRecorder capture lands in Wave 2.
 * Source: PHASE_RECORDING_DESIGN_FREEZE.md (D05, D07).
 */

export const TAKE_AUDIO_BUCKET = "take-audio";

/** Global technical max recording length (seconds). */
export const RECORDING_GLOBAL_MAX_SECONDS = 180;

/** Interim take object size cap (20 MiB). */
export const TAKE_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

/** Short-lived signed GET for owner take preview (Wave 3). */
export const TAKE_AUDIO_PREVIEW_TTL_SECONDS = 120;

/** Short-lived signed GET for owner take download (Wave 4). */
export const TAKE_AUDIO_DOWNLOAD_TTL_SECONDS = 300;

/**
 * Anonymous take retention TTL (seconds) — D02 Design Freeze.
 * AuthZ DENY after expires_at; janitor cleans independently.
 */
export const ANON_TAKE_TTL_SECONDS = 2 * 60 * 60;

/** httpOnly opaque anonymous Take identity cookie (≠ brd_dl_aid). */
export const ANON_TAKE_COOKIE_NAME = "brd_tk_aid";

export const ANON_TAKE_COOKIE_MAX_AGE_SECONDS = ANON_TAKE_TTL_SECONDS;

export const RECORDING_RETENTION_SECONDS = {
  ANONYMOUS: ANON_TAKE_TTL_SECONDS,
  BEGINNER_RAPPER: 24 * 60 * 60,
  PRO_RAPPER: 10 * 24 * 60 * 60,
  LEGEND_RAPPER: 30 * 24 * 60 * 60,
} as const;

/** Anti-abuse caps (D07) — not duration limits. */
export const RECORDING_ANTI_ABUSE = {
  ANONYMOUS: { maxActiveReady: 1, maxSessionsPerUtcDay: 3 },
  BEGINNER_RAPPER: { maxActiveReady: 3, maxSessionsPerUtcDay: 10 },
  PRO_RAPPER: { maxActiveReady: 10, maxSessionsPerUtcDay: 30 },
  LEGEND_RAPPER: { maxActiveReady: 20, maxSessionsPerUtcDay: 60 },
} as const;

export const TAKE_AUDIO_INTERIM_MIME_ALLOWLIST = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
] as const;
