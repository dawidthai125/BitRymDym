/**
 * Gemini models that can hear a YouTube video, in order of preference.
 * The project key is on the Free Tier: gemini-3-flash allows 20 requests a day, and one
 * one-button run uses ~8 (2026-11-20). Lighter models have their own daily limits and were
 * checked live on a YouTube video (gemini-3.5-flash-lite, gemini-3.1-flash-lite-preview).
 */
export const GEMINI_VIDEO_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite-preview"] as const;

/** Primary first, then the fallbacks, without repeats. */
export function geminiVideoModelChain(primary: string): string[] {
  return [...new Set([primary, ...GEMINI_VIDEO_FALLBACK_MODELS])];
}

/** Daily/minute limit, overload or a retired model: the next model may still answer. */
export function isGeminiCapacityStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 404;
}
