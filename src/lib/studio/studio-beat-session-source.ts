/**
 * WAVE 1.1 — Studio beat audio session identity.
 * Session / waveform keys must include assetId so master replacement
 * cannot reuse stale bytes under the same beatId.
 */

import {
  buildSessionAudioKey,
  loadSessionAudioFromUrl,
} from "@/lib/audio/session-audio-bytes";
import type { StudioResolvedSource } from "@/lib/studio/studio-audio-source-adapter";

const URL_REFRESH_MS = 15_000;
const BLOB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Tab-scoped: last resolved versioned session key per beatId. */
const resolvedBeatSessionKeys = new Map<string, string>();
/** Monotonic resolve generation — late responses must not clobber newer identity. */
const beatResolveEpoch = new Map<string, number>();

export function studioBeatAudioSourceKey(
  beatId: string,
  assetId: string,
): string {
  return buildSessionAudioKey({
    kind: "beat",
    id: beatId,
    versionId: assetId,
  });
}

export function rememberStudioBeatAudioSourceKey(
  beatId: string,
  sourceKey: string,
): void {
  resolvedBeatSessionKeys.set(beatId, sourceKey);
}

export function getResolvedStudioBeatAudioSourceKey(
  beatId: string,
): string | null {
  return resolvedBeatSessionKeys.get(beatId) ?? null;
}

/** True when sourceKey identifies a versioned beat (beat:id|assetId). */
export function isVersionedBeatAudioSourceKey(sourceKey: string): boolean {
  if (!sourceKey.startsWith("beat:")) return false;
  const rest = sourceKey.slice("beat:".length);
  const pipe = rest.indexOf("|");
  if (pipe <= 0) return false;
  const version = rest.slice(pipe + 1).trim();
  return version.length > 0 && version !== "v0";
}

export function resetStudioBeatSessionKeysForTests(): void {
  resolvedBeatSessionKeys.clear();
  beatResolveEpoch.clear();
}

export type StudioBeatAccessResult = {
  success: boolean;
  url?: string;
  assetId?: string;
  expiresAt?: string;
};

export type ResolveStudioBeatSessionSourceParams = {
  beatId: string;
  access: StudioBeatAccessResult;
  /** Cache of playable URLs keyed by session source key (not bare beatId). */
  urlCache: Map<string, StudioResolvedSource>;
  dedupEnabled: boolean;
  now?: number;
  loadFromUrl?: typeof loadSessionAudioFromUrl;
  urlRefreshMs?: number;
};

/**
 * Resolve a playable Studio beat source with versioned session identity.
 * Always uses access.assetId when present; never caches under bare beatId.
 */
export async function resolveStudioBeatSessionSource(
  params: ResolveStudioBeatSessionSourceParams,
): Promise<StudioResolvedSource | null> {
  const {
    beatId,
    access,
    urlCache,
    dedupEnabled,
    loadFromUrl = loadSessionAudioFromUrl,
    urlRefreshMs = URL_REFRESH_MS,
  } = params;
  const now = params.now ?? Date.now();

  if (!access.success || !access.url) return null;

  const assetId =
    typeof access.assetId === "string" ? access.assetId.trim() : "";

  // No reliable master identity — signed URL only; do not session-cache by beatId.
  if (!assetId) {
    return {
      url: access.url,
      expiresAt: access.expiresAt
        ? Date.parse(access.expiresAt)
        : now + 60_000,
    };
  }

  const epoch = (beatResolveEpoch.get(beatId) ?? 0) + 1;
  beatResolveEpoch.set(beatId, epoch);

  const sessionKey = studioBeatAudioSourceKey(beatId, assetId);

  const cached = urlCache.get(sessionKey);
  if (cached && cached.expiresAt - now > urlRefreshMs) {
    if (beatResolveEpoch.get(beatId) === epoch) {
      rememberStudioBeatAudioSourceKey(beatId, sessionKey);
      return cached;
    }
    const activeKey = getResolvedStudioBeatAudioSourceKey(beatId);
    if (activeKey) {
      const active = urlCache.get(activeKey);
      if (active) return active;
    }
    return null;
  }

  let playableUrl = access.url;
  let expiresAt = access.expiresAt
    ? Date.parse(access.expiresAt)
    : now + 60_000;

  if (dedupEnabled) {
    const { objectUrl } = await loadFromUrl(sessionKey, access.url, {
      enabled: true,
    });
    if (objectUrl) {
      playableUrl = objectUrl;
      expiresAt = now + BLOB_CACHE_TTL_MS;
    }
  }

  const source: StudioResolvedSource = {
    url: playableUrl,
    expiresAt,
  };
  // Always retain per-asset URL cache (A1 bytes stay under beat|A1).
  urlCache.set(sessionKey, source);

  if (beatResolveEpoch.get(beatId) !== epoch) {
    // Stale generation: never hand A1's URL to callers after A2 won.
    // Prefer the active remembered playable source when available.
    const activeKey = getResolvedStudioBeatAudioSourceKey(beatId);
    if (activeKey) {
      const active = urlCache.get(activeKey);
      if (active) return active;
    }
    return null;
  }

  rememberStudioBeatAudioSourceKey(beatId, sessionKey);
  return source;
}
