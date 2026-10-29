/**
 * WAVE 1.1 — Studio timeline voice identity (beat asset / take id).
 * Used to detect master replacement without relying on remount.
 */

import { getResolvedStudioBeatAudioSourceKey } from "@/lib/studio/studio-beat-session-source";
import type { StudioEngineClip } from "@/lib/studio/studio-audio-schedule";

/** Identity after a successful source resolve (versioned for beats). */
export function studioClipSourceIdentity(
  clip: Pick<StudioEngineClip, "sourceKind" | "sourceBeatId" | "sourceTakeId">,
): string | null {
  if (clip.sourceKind === "BEAT_REF" && clip.sourceBeatId) {
    return getResolvedStudioBeatAudioSourceKey(clip.sourceBeatId);
  }
  if (clip.sourceKind === "TAKE" && clip.sourceTakeId) {
    return `take:${clip.sourceTakeId}`;
  }
  return null;
}

/**
 * Reuse existing MediaElement voice only when source identity matches.
 * Missing next identity (e.g. beat without assetId) → do not reuse a
 * previously versioned voice.
 */
export function shouldReuseStudioVoice(params: {
  existingIdentityKey: string | null | undefined;
  nextIdentityKey: string | null;
  /** Unversioned fallback: same resolved URL on both sides → same media. */
  existingSourceUrl?: string | null;
  nextSourceUrl?: string | null;
}): boolean {
  const next = params.nextIdentityKey;
  if (!next) {
    return (
      !params.existingIdentityKey &&
      Boolean(params.nextSourceUrl) &&
      params.existingSourceUrl === params.nextSourceUrl
    );
  }
  return params.existingIdentityKey === next;
}
