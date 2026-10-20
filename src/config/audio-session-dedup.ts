/**
 * WAVE 1 — client session audio dedupe flag.
 * Default ON (egress reduction). Explicit false-class disables → legacy path.
 * Uses NEXT_PUBLIC_ so the browser bundle can read it.
 */

import { parseBoolEnv } from "@/config/audio-render";

export const AUDIO_SESSION_DEDUP_ENV = "NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP";

/**
 * When true, player/Studio may reuse session-scoped bytes / blob URLs
 * instead of re-GETting Storage after signed URL refresh.
 */
export function isAudioSessionDedupEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP,
): boolean {
  if (raw === undefined || raw === "") return true;
  return parseBoolEnv(raw, true) === true;
}
