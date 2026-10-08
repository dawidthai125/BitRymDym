/**
 * Phase 3 — Client-only waveform peaks cache (LRU + in-flight dedupe).
 * No Supabase table / no DB migration.
 */

import {
  studioPeaksFromAudioUrl,
  STUDIO_WAVEFORM_PEAKS_PER_SECOND,
  type StudioWaveformPeaksPayload,
} from "@/lib/studio/studio-waveform-peaks";

/** Soft cap — protects memory; oldest entries evicted. */
export const STUDIO_WAVEFORM_CACHE_MAX_ENTRIES = 24;

export type StudioWaveformCacheKeyParts = {
  sourceKey: string;
  peaksPerSecond?: number;
  sampleRate?: number;
  channels?: number;
  durationMs?: number;
};

export function buildStudioWaveformCacheKey(
  parts: StudioWaveformCacheKeyParts,
): string {
  const pps = parts.peaksPerSecond ?? STUDIO_WAVEFORM_PEAKS_PER_SECOND;
  const sr = parts.sampleRate ?? 0;
  const ch = parts.channels ?? 0;
  const dur = parts.durationMs ?? 0;
  return `${parts.sourceKey}|pps=${pps}|sr=${sr}|ch=${ch}|dur=${dur}`;
}

/** Provisional key before decode knows sampleRate/channels/duration. */
export function buildStudioWaveformPendingKey(
  sourceKey: string,
  peaksPerSecond: number = STUDIO_WAVEFORM_PEAKS_PER_SECOND,
): string {
  return `${sourceKey}|pps=${peaksPerSecond}|pending`;
}

type CacheEntry = {
  key: string;
  sourceKey: string;
  payload: StudioWaveformPeaksPayload;
  touchedAt: number;
};

export type StudioWaveformPeaksCache = {
  get(key: string): StudioWaveformPeaksPayload | null;
  getBySourceKey(sourceKey: string): StudioWaveformPeaksPayload | null;
  set(entry: Omit<CacheEntry, "touchedAt">): void;
  has(key: string): boolean;
  size(): number;
  clear(): void;
  /** Invalidate all entries for a source (rare; URL rotation does not require it). */
  invalidateSource(sourceKey: string): void;
};

export function createStudioWaveformPeaksCache(
  maxEntries: number = STUDIO_WAVEFORM_CACHE_MAX_ENTRIES,
): StudioWaveformPeaksCache {
  const map = new Map<string, CacheEntry>();
  const bySource = new Map<string, string>();

  function touch(entry: CacheEntry) {
    entry.touchedAt = Date.now();
    map.delete(entry.key);
    map.set(entry.key, entry);
  }

  function evictIfNeeded() {
    while (map.size > maxEntries) {
      const oldest = map.keys().next().value as string | undefined;
      if (!oldest) break;
      const removed = map.get(oldest);
      map.delete(oldest);
      if (removed && bySource.get(removed.sourceKey) === oldest) {
        bySource.delete(removed.sourceKey);
      }
    }
  }

  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return null;
      touch(entry);
      return entry.payload;
    },
    getBySourceKey(sourceKey) {
      const key = bySource.get(sourceKey);
      if (!key) return null;
      return this.get(key);
    },
    set(entry) {
      const next: CacheEntry = { ...entry, touchedAt: Date.now() };
      map.set(entry.key, next);
      bySource.set(entry.sourceKey, entry.key);
      evictIfNeeded();
    },
    has(key) {
      return map.has(key);
    },
    size() {
      return map.size;
    },
    clear() {
      map.clear();
      bySource.clear();
    },
    invalidateSource(sourceKey) {
      const key = bySource.get(sourceKey);
      if (key) map.delete(key);
      bySource.delete(sourceKey);
    },
  };
}

/** Module singleton — shared across duplicate clips of the same Take/Beat. */
export const studioWaveformPeaksCache = createStudioWaveformPeaksCache();

const inflight = new Map<string, Promise<StudioWaveformPeaksPayload>>();

export type ResolveStudioWaveformPeaksParams = {
  sourceKey: string;
  url: string;
  peaksPerSecond?: number;
  cache?: StudioWaveformPeaksCache;
  load?: (
    url: string,
    peaksPerSecond: number,
  ) => Promise<StudioWaveformPeaksPayload>;
};

/**
 * Cache hit → return.
 * Cache miss → decode once; concurrent callers share the same promise.
 */
export async function resolveStudioWaveformPeaks(
  params: ResolveStudioWaveformPeaksParams,
): Promise<{
  payload: StudioWaveformPeaksPayload;
  cacheHit: boolean;
}> {
  const cache = params.cache ?? studioWaveformPeaksCache;
  const pps = params.peaksPerSecond ?? STUDIO_WAVEFORM_PEAKS_PER_SECOND;
  const load = params.load ?? studioPeaksFromAudioUrl;

  const existing = cache.getBySourceKey(params.sourceKey);
  if (
    existing &&
    existing.peaksPerSecond === pps
  ) {
    return { payload: existing, cacheHit: true };
  }

  const pendingKey = buildStudioWaveformPendingKey(params.sourceKey, pps);
  const active = inflight.get(pendingKey);
  if (active) {
    const payload = await active;
    return { payload, cacheHit: false };
  }

  const promise = (async () => {
    const payload = await load(params.url, pps);
    const key = buildStudioWaveformCacheKey({
      sourceKey: params.sourceKey,
      peaksPerSecond: payload.peaksPerSecond,
      sampleRate: payload.sampleRate,
      channels: payload.channels,
      durationMs: payload.durationMs,
    });
    cache.set({
      key,
      sourceKey: params.sourceKey,
      payload,
    });
    return payload;
  })();

  inflight.set(pendingKey, promise);
  try {
    const payload = await promise;
    return { payload, cacheHit: false };
  } finally {
    inflight.delete(pendingKey);
  }
}

/** Test helper — clear singleton + inflight. */
export function resetStudioWaveformPeaksCacheForTests(): void {
  studioWaveformPeaksCache.clear();
  inflight.clear();
}
