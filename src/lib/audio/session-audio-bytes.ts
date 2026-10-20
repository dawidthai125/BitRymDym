/**
 * WAVE 1 — tab/session-scoped audio byte cache (client).
 * Dedupes parallel loaders; optional blob: object URLs for MediaElement.
 * Not a cross-user or durable cache. Keys must be resource identity, never signed URLs.
 */

import { isAudioSessionDedupEnabled } from "@/config/audio-session-dedup";

export const SESSION_AUDIO_CACHE_MAX_ENTRIES = 8;

export type SessionAudioLoader = (signal?: AbortSignal) => Promise<ArrayBuffer>;

type CacheEntry = {
  key: string;
  bytes: ArrayBuffer;
  objectUrl: string | null;
  mimeType: string;
  touchedAt: number;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ArrayBuffer>>();

function touch(entry: CacheEntry): void {
  entry.touchedAt = Date.now();
  store.delete(entry.key);
  store.set(entry.key, entry);
}

function revokeObjectUrl(entry: CacheEntry): void {
  if (entry.objectUrl && typeof URL !== "undefined") {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      /* ignore */
    }
  }
  entry.objectUrl = null;
}

function evictIfNeeded(): void {
  while (store.size > SESSION_AUDIO_CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next().value as string | undefined;
    if (!oldest) break;
    const removed = store.get(oldest);
    store.delete(oldest);
    if (removed) revokeObjectUrl(removed);
  }
}

/** Build stable session key: kind + id + optional asset/version id. */
export function buildSessionAudioKey(parts: {
  kind: "beat" | "take" | "artifact" | "raw";
  id: string;
  versionId?: string | null;
}): string {
  const version = parts.versionId?.trim() || "v0";
  return `${parts.kind}:${parts.id}|${version}`;
}

export function peekSessionAudioBytes(key: string): ArrayBuffer | null {
  const entry = store.get(key);
  if (!entry) return null;
  touch(entry);
  return entry.bytes;
}

export async function loadSessionAudioBytes(
  key: string,
  loader: SessionAudioLoader,
  options?: { signal?: AbortSignal; enabled?: boolean },
): Promise<ArrayBuffer> {
  const enabled = options?.enabled ?? isAudioSessionDedupEnabled();
  if (!enabled) {
    return loader(options?.signal);
  }

  const existing = store.get(key);
  if (existing) {
    touch(existing);
    return existing.bytes;
  }

  const active = inflight.get(key);
  if (active) {
    return active;
  }

  const promise = (async () => {
    const bytes = await loader(options?.signal);
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const entry: CacheEntry = {
      key,
      bytes,
      objectUrl: null,
      mimeType: "application/octet-stream",
      touchedAt: Date.now(),
    };
    store.set(key, entry);
    evictIfNeeded();
    return bytes;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export function ensureSessionAudioObjectUrl(
  key: string,
  bytes: ArrayBuffer,
  mimeType: string = "audio/mpeg",
): string {
  const existing = store.get(key);
  if (existing) {
    touch(existing);
    if (existing.objectUrl) return existing.objectUrl;
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
    );
    existing.objectUrl = url;
    existing.mimeType = mimeType;
    return url;
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
  );
  store.set(key, {
    key,
    bytes,
    objectUrl: url,
    mimeType,
    touchedAt: Date.now(),
  });
  evictIfNeeded();
  return url;
}

export function getSessionAudioObjectUrl(key: string): string | null {
  const entry = store.get(key);
  if (!entry?.objectUrl) return null;
  touch(entry);
  return entry.objectUrl;
}

export function invalidateSessionAudio(key: string): void {
  const entry = store.get(key);
  if (!entry) return;
  revokeObjectUrl(entry);
  store.delete(key);
  inflight.delete(key);
}

export function clearSessionAudioCache(): void {
  for (const entry of store.values()) {
    revokeObjectUrl(entry);
  }
  store.clear();
  inflight.clear();
}

export function sessionAudioCacheSize(): number {
  return store.size;
}

/** Test helper. */
export function resetSessionAudioCacheForTests(): void {
  clearSessionAudioCache();
}

/**
 * Fetch bytes from a URL into the session cache (deduped).
 * Does not log the URL.
 */
export async function loadSessionAudioFromUrl(
  key: string,
  url: string,
  options?: {
    signal?: AbortSignal;
    enabled?: boolean;
    fetchImpl?: typeof fetch;
    mimeType?: string;
  },
): Promise<{ bytes: ArrayBuffer; objectUrl: string | null }> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const enabled = options?.enabled ?? isAudioSessionDedupEnabled();
  const bytes = await loadSessionAudioBytes(
    key,
    async (signal) => {
      const res = await fetchImpl(url, { signal: signal ?? options?.signal });
      if (!res.ok) {
        throw new Error(`SESSION_AUDIO_FETCH_FAILED:${res.status}`);
      }
      return res.arrayBuffer();
    },
    { signal: options?.signal, enabled },
  );
  if (!enabled) {
    return { bytes, objectUrl: null };
  }
  const objectUrl = ensureSessionAudioObjectUrl(
    key,
    bytes,
    options?.mimeType ?? "audio/mpeg",
  );
  return { bytes, objectUrl };
}
