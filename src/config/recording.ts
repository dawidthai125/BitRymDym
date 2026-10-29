/**
 * Recording sample policy — Premium Tier axis (P1).
 * Account Level is NOT the source of recording limits.
 * Admin duration overrides for BRONZE/SILVER/GOLD live in DB (sample_policy_settings).
 */

import { GUEST_RECORDING_POLICY, PLAN_POLICY } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

export const TAKE_AUDIO_BUCKET = "take-audio";

/** Global technical max recording length (seconds). Never raise without Owner GO. */
export const RECORDING_GLOBAL_MAX_SECONDS = 180;

/** Interim take object size cap (20 MiB). */
export const TAKE_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

/**
 * STU-14 — max age of a browser-local (IndexedDB) copy of an unsaved Studio
 * recording. Older copies are deleted on the next Studio visit.
 */
export const TAKE_LOCAL_RECOVERY_TTL_SECONDS = 24 * 60 * 60;

/**
 * STU-16 — server upload window of a PENDING_UPLOAD reservation (server clock,
 * from `created_at`). Past it, a reservation without an uploaded object no
 * longer blocks the actor's next session: the claim RPC (or the takes janitor)
 * marks it FAILED (`PENDING_UPLOAD_WINDOW_ELAPSED`). Independent of retention
 * (`expires_at`). Does not refund `SESSION_DAY_CAP` (UTC-day take count by
 * `created_at`, any status). Must equal `public.take_pending_upload_window_seconds()`
 * and stay ≥ the browser recovery lease max hold (15 min).
 */
export const TAKE_PENDING_UPLOAD_WINDOW_SECONDS = 15 * 60;

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
export const ANON_TAKE_TTL_SECONDS = GUEST_RECORDING_POLICY.takeTtlSeconds;

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

/** Recording numbers per plan come from the plan SSOT (`@/config/plan-policy`). */
function fromPlan(tier: PremiumTier): SamplePolicyDefaults {
  const p = PLAN_POLICY[tier];
  return {
    maxRecordingSeconds: p.recording.maxTakeSeconds,
    ttlSeconds: p.recording.takeTtlSeconds,
    maxActiveReady: p.recording.maxActiveReady,
    maxSessionsPerUtcDay: p.recording.sessionsPerDay,
    canDownloadOwnTake: p.downloads.ownTakeRaw,
  };
}

/**
 * Immutable default matrix (P1 Owner GO; Owner 2026-10-29: FREE 1 take/day, 24 h).
 * Duration for BRONZE/SILVER/GOLD may be overridden by Admin (1..180).
 * ANONYMOUS / FREE durations are system-fixed.
 */
export const SAMPLE_POLICY_DEFAULTS: Record<
  SamplePolicyActor,
  SamplePolicyDefaults
> = {
  ANONYMOUS: {
    maxRecordingSeconds: GUEST_RECORDING_POLICY.maxTakeSeconds,
    ttlSeconds: ANON_TAKE_TTL_SECONDS,
    maxActiveReady: GUEST_RECORDING_POLICY.maxActiveReady,
    maxSessionsPerUtcDay: GUEST_RECORDING_POLICY.sessionsPerDay,
    canDownloadOwnTake: false,
  },
  FREE: fromPlan("FREE"),
  BRONZE: fromPlan("BRONZE"),
  SILVER: fromPlan("SILVER"),
  GOLD: fromPlan("GOLD"),
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
