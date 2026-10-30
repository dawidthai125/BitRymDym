/**
 * User beats 2026-10-30 — cover upload + content filter SSOT.
 * Owner decision: every new cover goes through the automatic filter (Google
 * Gemini vision, structured scores) + moderator queue; high score auto-rejects.
 */

export const BEAT_COVER_BUCKET = "beat-covers";

/** Raw upload limit (before re-encode). */
/** Vercel Functions request body cap is 4.5 MB — keep the raw upload below it. */
export const BEAT_COVER_MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const BEAT_COVER_ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const BEAT_COVER_MIN_EDGE_PX = 300;
export const BEAT_COVER_MAX_EDGE_PX = 8000;

/** Square outputs (WebP, metadata stripped). */
export const BEAT_COVER_FULL_PX = 1024;
export const BEAT_COVER_THUMB_PX = 320;

/** Any category score ≥ this → auto-reject (never stored). */
export const BEAT_COVER_AUTO_REJECT_SCORE = 0.8;
/** Stricter categories (minors / graphic) → auto-reject at a lower score. */
export const BEAT_COVER_STRICT_REJECT_SCORE = 0.3;
export const BEAT_COVER_STRICT_CATEGORIES = [
  "sexual/minors",
  "violence/graphic",
  "self-harm/instructions",
] as const;
/** Flagged or any score ≥ this → moderator queue instead of auto-approve. */
export const BEAT_COVER_REVIEW_SCORE = 0.3;

/** Same Gemini family as BITEK; override with BEAT_COVER_GEMINI_MODEL. */
export const GEMINI_COVER_MODERATION_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_COVER_MODERATION_TIMEOUT_MS = 12_000;

/** Categories the model scores (0–1). Names match the thresholds above. */
export const BEAT_COVER_MODERATION_CATEGORIES = [
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
  "hate",
  "self-harm",
  "self-harm/instructions",
  "drugs",
] as const;

/**
 * Automatic filter switch. ON when GEMINI_API_KEY exists, unless
 * BEAT_COVER_AI_MODERATION=0. Without the key every cover waits for a
 * moderator (status pending) — never auto-approved.
 */
export function isCoverAiModerationEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.BEAT_COVER_AI_MODERATION === "0") return false;
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim());
}
