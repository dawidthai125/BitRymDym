/**
 * E3.1 — Audio render / mix export config SSOT.
 * Source: E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md (OAD-03 STANDARD · OAD-06 codec · IP-06 flags)
 * Recording entitlements remain in config/recording.ts — do not merge.
 */

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

/** Private durable mix/export bucket (OAD-07). Not take-audio / beat-audio. */
export const AUDIO_ARTIFACTS_BUCKET = "audio-artifacts";

/** Max source duration (seconds) — existing recording/beat ceiling. */
export const AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS = 180;

/** Align take source size cap. */
export const AUDIO_RENDER_MAX_TAKE_BYTES = 20 * 1024 * 1024;

/** Align beat asset size cap. */
export const AUDIO_RENDER_MAX_BEAT_BYTES = 50 * 1024 * 1024;

/**
 * OAD-03 / IP-03 — wall seconds from CLAIM/RUNNING only (queue wait excluded).
 */
export const AUDIO_RENDER_JOB_TIMEOUT_SECONDS = 180;

/** OAD-03 STANDARD — max attempts including first. */
export const AUDIO_RENDER_MAX_ATTEMPTS = 3;

/**
 * W2-B / P2-1: Daily / concurrent / retention / quota for renders are NOT
 * defined here. Authoritative SSOT = `PREMIUM_TIER_MATRIX` /
 * `limitsForPremiumTier` in `@/config/premium-tiers`.
 *
 * Removed stale binary Premium constants (e.g. former
 * AUDIO_RENDER_PREMIUM_RENDERS_PER_UTC_DAY = 30) — they are not create-path
 * authority and must not reappear as a second SSOT.
 */

/** Signed GET TTL class (reuse download pattern). */
export const AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS = 300;

/** OAD-06 codec baseline (IP-05). */
export const AUDIO_CODEC = {
  BASIC_MP3_BITRATE_KBPS: 128,
  HQ_MP3_BITRATE_KBPS: 320,
  WAV_SAMPLE_RATE: 44100,
  WAV_BIT_DEPTH: 16,
  CHANNELS: 2,
} as const;

/**
 * Capability keys (frozen list).
 * Effective resolution: lib/audio/effective-entitlement.ts (E3.2).
 * STEMS intentionally absent.
 */
export const AUDIO_CAPABILITY_KEYS = [
  "MIX_BASIC",
  "MIX_PRO",
  "MASTER_BASIC",
  "MASTER_PRO",
  "EXPORT_BASIC_MP3",
  "EXPORT_HQ_MP3",
  "EXPORT_WAV",
] as const;

export type AudioCapabilityKey = (typeof AUDIO_CAPABILITY_KEYS)[number];

/**
 * Public Free Audio release gate SSOT (IP-06).
 * Default OFF. Requires W6 PASS + Production GO to enable in ops.
 */
export const E3_PUBLIC_AUDIO = parseBoolEnv(
  process.env.E3_PUBLIC_AUDIO,
  false,
);

/**
 * Internal/technical Mix enablement only (IP-06).
 * Never authorizes public Free Audio by itself.
 */
export const E3_MIX_ENABLED = parseBoolEnv(process.env.E3_MIX_ENABLED, false);

/**
 * E3.5 — durable Render Jobs runtime gate (OD-E35-02).
 * Default OFF. Independent of E3_MIX_ENABLED / E3_PUBLIC_AUDIO.
 * Never authorizes public Free Audio by itself.
 */
export const E3_RENDER_JOBS_ENABLED = parseBoolEnv(
  process.env.E3_RENDER_JOBS_ENABLED,
  false,
);

/**
 * Worker-facing auth for CLAIM / complete (OD-E35-03).
 * Server-only secret — never expose to client. Distinct from feature flags.
 */
export function getRenderWorkerSecret(): string | null {
  const raw = process.env.E3_RENDER_WORKER_SECRET;
  if (raw === undefined || raw === "") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Convenience: public release requires public flag (W6/Prod GO are process gates). */
export function isE3PublicAudioAuthorized(): boolean {
  return E3_PUBLIC_AUDIO === true;
}
