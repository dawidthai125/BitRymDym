/**
 * BRD Tune — browser helpers: beat key from catalogue metadata (API) and key
 * detection from the beat audio the studio already holds in its session cache
 * (never a new signed-URL request: that would spend the daily preview quota).
 */
import { getSessionAudioObjectUrl, peekSessionAudioBytes } from "@/lib/audio/session-audio-bytes";
import { getResolvedStudioBeatAudioSourceKey } from "@/lib/studio/studio-beat-session-source";

import { detectKeyFromAudio, type DetectedKey } from "./key-detect";
import type { TuneKey } from "./tune";

export type ProjectBeatKeyDto = {
  beatId: string | null;
  rawKey: string | null;
  rawScale: string | null;
  key: TuneKey | null;
};

const cache = new Map<string, Promise<ProjectBeatKeyDto | null>>();

export function fetchProjectBeatKey(projectId: string): Promise<ProjectBeatKeyDto | null> {
  const hit = cache.get(projectId);
  if (hit) return hit;
  const p = fetch(`/api/studio/projects/${projectId}/beat`, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const json = (await res.json()) as Partial<ProjectBeatKeyDto>;
      return {
        beatId: json.beatId ?? null,
        rawKey: json.rawKey ?? null,
        rawScale: json.rawScale ?? null,
        key: json.key ?? null,
      };
    })
    .catch(() => null);
  cache.set(projectId, p);
  void p.then((v) => {
    if (!v) cache.delete(projectId); // retry later on failure
  });
  return p;
}

export type DetectBeatKeyResult = { ok: true; key: DetectedKey } | { ok: false; reason: "no-audio" | "undetected" };

/** Detect from the session-cached beat bytes (loaded when the beat was played). */
export async function detectBeatKeyFromSession(beatId: string): Promise<DetectBeatKeyResult> {
  const sessionKey = getResolvedStudioBeatAudioSourceKey(beatId);
  let bytes = sessionKey ? peekSessionAudioBytes(sessionKey) : null;
  if (!bytes && sessionKey) {
    const url = getSessionAudioObjectUrl(sessionKey);
    if (url) bytes = await fetch(url).then((r) => r.arrayBuffer()).catch(() => null);
  }
  if (!bytes || typeof OfflineAudioContext === "undefined") return { ok: false, reason: "no-audio" };
  try {
    const sr = 22050; // chroma needs ≤ 2 kHz; decode resampled = 2× faster analysis
    const ctx = new OfflineAudioContext(1, 1, sr);
    const audio = await ctx.decodeAudioData(bytes.slice(0));
    const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
    const key = detectKeyFromAudio(channels, audio.sampleRate);
    return key ? { ok: true, key } : { ok: false, reason: "undetected" };
  } catch {
    return { ok: false, reason: "no-audio" };
  }
}
