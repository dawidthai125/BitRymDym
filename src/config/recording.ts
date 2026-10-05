/**
 * Recording sample policy — Premium Tier axis (P1).
 * Account Level is NOT the source of recording limits.
 * Admin duration overrides for BRONZE/SILVER/GOLD live in DB (sample_policy_settings).
 */

export const TAKE_AUDIO_BUCKET = "take-audio";

/** Global technical max recording length (seconds). Never raise without Owner GO. */
export const RECORDING_GLOBAL_MAX_SECONDS = 180;

/** Interim take object size cap (20 MiB). */
export const TAKE_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

/** Short-lived signed GET for owner take preview. */
export const TAKE_AUDIO_PREVIEW_TTL_SECONDS = 120;

/** Short-lived signed GET for owner take download. */
export const TAKE_AUDIO_DOWNLOAD_TTL_SECONDS = 300;

/**
 * P4 — RAW own-take download daily counter C (GOLD only).
 * Distinct from beat-download daily limits and recording session caps.
 */
export const OWN_TAKE_RAW_DOWNLOADS_DAILY = 5;

/** P4 — max length for takes.title (CHECK + app validate). */
export const TAKE_TITLE_MAX_LENGTH = 120;

/** Anonymous take retention TTL (seconds). */
export const ANON_TAKE_TTL_SECONDS = 2 * 60 * 60;

/** httpOnly opaque anonymous Take identity cookie (≠ brd_dl_aid). */
export const ANON_TAKE_COOKIE_NAME = "brd_tk_aid";

export const ANON_TAKE_COOKIE_MAX_AGE_SECONDS = ANON_TAKE_TTL_SECONDS;

/** Sample policy identity classes (ANONYMOUS ≠ FREE). */
export const SAMPLE_POLICY_ACTORS = [
  "ANONYMOUS",
  "FREE",
  "BRONZE",
  "SILVER",
  "GOLD",
] as const;

export type SamplePolicyActor = (typeof SAMPLE_POLICY_ACTORS)[number];

export type SamplePolicyDefaults = {
  /** Fixed system duration for ANON/FREE; default for BRONZE/SILVER/GOLD. */
  maxRecordingSeconds: number;
  ttlSeconds: number;
  maxActiveReady: number;
  maxSessionsPerUtcDay: number;
  /** Capability only in P1 — take-download enforcement deferred to P4. */
  canDownloadOwnTake: boolean;
};

/**
 * Immutable default matrix (P1 Owner GO).
 * Duration for BRONZE/SILVER/GOLD may be overridden by Admin (1..180).
 * ANONYMOUS / FREE durations are system-fixed.
 */
export const SAMPLE_POLICY_DEFAULTS: Record<
  SamplePolicyActor,
  SamplePolicyDefaults
> = {
  ANONYMOUS: {
    maxRecordingSeconds: 15,
    ttlSeconds: ANON_TAKE_TTL_SECONDS,
    maxActiveReady: 1,
    maxSessionsPerUtcDay: 3,
    canDownloadOwnTake: false,
  },
  FREE: {
    maxRecordingSeconds: 30,
    ttlSeconds: 12 * 60 * 60,
    maxActiveReady: 3,
    maxSessionsPerUtcDay: 3,
    canDownloadOwnTake: false,
  },
  BRONZE: {
    maxRecordingSeconds: 60,
    ttlSeconds: 36 * 60 * 60,
    maxActiveReady: 5,
    maxSessionsPerUtcDay: 5,
    canDownloadOwnTake: false,
  },
  SILVER: {
    maxRecordingSeconds: 120,
    ttlSeconds: 60 * 60 * 60,
    maxActiveReady: 7,
    maxSessionsPerUtcDay: 7,
    canDownloadOwnTake: false,
  },
  GOLD: {
    maxRecordingSeconds: 180,
    ttlSeconds: 84 * 60 * 60,
    maxActiveReady: 10,
    maxSessionsPerUtcDay: 10,
    canDownloadOwnTake: true,
  },
} as const;

/** Admin may override only these tiers' max duration. */
export const SAMPLE_POLICY_ADMIN_DURATION_TIERS = [
  "BRONZE",
  "SILVER",
  "GOLD",
] as const;

export type SamplePolicyAdminDurationTier =
  (typeof SAMPLE_POLICY_ADMIN_DURATION_TIERS)[number];

export const TAKE_AUDIO_INTERIM_MIME_ALLOWLIST = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
] as const;

/**
 * @deprecated P1 — Account Level is no longer the recording-limit axis.
 * Kept only for historical import sites; do not use for new policy.
 */
export const RECORDING_RETENTION_SECONDS = {
  ANONYMOUS: ANON_TAKE_TTL_SECONDS,
  BEGINNER_RAPPER: SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds,
  PRO_RAPPER: SAMPLE_POLICY_DEFAULTS.SILVER.ttlSeconds,
  LEGEND_RAPPER: SAMPLE_POLICY_DEFAULTS.GOLD.ttlSeconds,
} as const;

/**
 * @deprecated P1 — use SAMPLE_POLICY_DEFAULTS / getSamplePolicy.
 */
export const RECORDING_ANTI_ABUSE = {
  ANONYMOUS: {
    maxActiveReady: SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxActiveReady,
    maxSessionsPerUtcDay: SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxSessionsPerUtcDay,
  },
  BEGINNER_RAPPER: {
    maxActiveReady: SAMPLE_POLICY_DEFAULTS.FREE.maxActiveReady,
    maxSessionsPerUtcDay: SAMPLE_POLICY_DEFAULTS.FREE.maxSessionsPerUtcDay,
  },
  PRO_RAPPER: {
    maxActiveReady: SAMPLE_POLICY_DEFAULTS.SILVER.maxActiveReady,
    maxSessionsPerUtcDay: SAMPLE_POLICY_DEFAULTS.SILVER.maxSessionsPerUtcDay,
  },
  LEGEND_RAPPER: {
    maxActiveReady: SAMPLE_POLICY_DEFAULTS.GOLD.maxActiveReady,
    maxSessionsPerUtcDay: SAMPLE_POLICY_DEFAULTS.GOLD.maxSessionsPerUtcDay,
  },
} as const;
