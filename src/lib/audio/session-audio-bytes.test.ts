import { afterEach, describe, expect, it, vi } from "vitest";

import { isAudioSessionDedupEnabled } from "@/config/audio-session-dedup";
import {
  buildSessionAudioKey,
  clearSessionAudioCache,
  ensureSessionAudioObjectUrl,
  getSessionAudioObjectUrl,
  invalidateSessionAudio,
  loadSessionAudioBytes,
  loadSessionAudioFromUrl,
  peekSessionAudioBytes,
  releaseSessionAudio,
  resetSessionAudioCacheForTests,
  retainSessionAudio,
  sessionAudioCacheSize,
  sessionAudioRetainCount,
  SESSION_AUDIO_CACHE_MAX_ENTRIES,
} from "@/lib/audio/session-audio-bytes";

afterEach(() => {
  resetSessionAudioCacheForTests();
});

describe("audio session dedup flag", () => {
  it("defaults ON when unset", () => {
    expect(isAudioSessionDedupEnabled(undefined)).toBe(true);
    expect(isAudioSessionDedupEnabled("")).toBe(true);
  });

  it("explicit false-class disables", () => {
    expect(isAudioSessionDedupEnabled("0")).toBe(false);
    expect(isAudioSessionDedupEnabled("false")).toBe(false);
    expect(isAudioSessionDedupEnabled("off")).toBe(false);
  });

  it("explicit true-class stays on", () => {
    expect(isAudioSessionDedupEnabled("1")).toBe(true);
    expect(isAudioSessionDedupEnabled("true")).toBe(true);
  });
});

describe("session audio bytes", () => {
  it("builds stable keys with version", () => {
    expect(
      buildSessionAudioKey({ kind: "beat", id: "b1", versionId: "a1" }),
    ).toBe("beat:b1|a1");
    expect(buildSessionAudioKey({ kind: "take", id: "t1" })).toBe("take:t1|v0");
  });

  it("loads once and shares parallel inflight", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 15));
      return new Uint8Array([1, 2, 3]).buffer;
    };
    const key = buildSessionAudioKey({ kind: "beat", id: "x", versionId: "1" });
    const [a, b] = await Promise.all([
      loadSessionAudioBytes(key, loader, { enabled: true }),
      loadSessionAudioBytes(key, loader, { enabled: true }),
    ]);
    expect(loads).toBe(1);
    expect(a.byteLength).toBe(3);
    expect(b.byteLength).toBe(3);
    expect(peekSessionAudioBytes(key)?.byteLength).toBe(3);
  });

  it("when disabled, does not cache and loads each time", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return new Uint8Array([9]).buffer;
    };
    const key = buildSessionAudioKey({ kind: "beat", id: "y" });
    await loadSessionAudioBytes(key, loader, { enabled: false });
    await loadSessionAudioBytes(key, loader, { enabled: false });
    expect(loads).toBe(2);
    expect(peekSessionAudioBytes(key)).toBeNull();
  });

  it("creates and revokes object URLs on invalidate", () => {
    const key = buildSessionAudioKey({ kind: "beat", id: "z", versionId: "2" });
    const bytes = new Uint8Array([4, 5]).buffer;
    const url = ensureSessionAudioObjectUrl(key, bytes);
    expect(url.startsWith("blob:")).toBe(true);
    expect(getSessionAudioObjectUrl(key)).toBe(url);
    invalidateSessionAudio(key);
    expect(getSessionAudioObjectUrl(key)).toBeNull();
    expect(sessionAudioCacheSize()).toBe(0);
  });

  it("version change is a different key", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return new Uint8Array([loads]).buffer;
    };
    await loadSessionAudioBytes(
      buildSessionAudioKey({ kind: "beat", id: "b", versionId: "v1" }),
      loader,
      { enabled: true },
    );
    await loadSessionAudioBytes(
      buildSessionAudioKey({ kind: "beat", id: "b", versionId: "v2" }),
      loader,
      { enabled: true },
    );
    expect(loads).toBe(2);
  });

  it("loadSessionAudioFromUrl dedupes fetch", async () => {
    let fetches = 0;
    const fetchImpl = vi.fn(async () => {
      fetches += 1;
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([7, 8]).buffer,
      } as Response;
    });
    const key = buildSessionAudioKey({
      kind: "beat",
      id: "f",
      versionId: "asset",
    });
    const first = await loadSessionAudioFromUrl(key, "https://example.test/a", {
      enabled: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await loadSessionAudioFromUrl(key, "https://example.test/b", {
      enabled: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetches).toBe(1);
    expect(first.objectUrl).toBeTruthy();
    expect(second.objectUrl).toBe(first.objectUrl);
  });

  it("aborted load does not leave a permanent entry", async () => {
    const key = buildSessionAudioKey({ kind: "beat", id: "abort" });
    const controller = new AbortController();
    const loader = async (signal?: AbortSignal) => {
      await new Promise((r) => setTimeout(r, 30));
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Uint8Array([1]).buffer;
    };
    const p = loadSessionAudioBytes(key, loader, {
      enabled: true,
      signal: controller.signal,
    });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(peekSessionAudioBytes(key)).toBeNull();
  });

  it("clear empties cache", async () => {
    const key = buildSessionAudioKey({ kind: "take", id: "t" });
    await loadSessionAudioBytes(key, async () => new Uint8Array([1]).buffer, {
      enabled: true,
    });
    expect(sessionAudioCacheSize()).toBe(1);
    clearSessionAudioCache();
    expect(sessionAudioCacheSize()).toBe(0);
  });

  it("respects max entries constant", () => {
    expect(SESSION_AUDIO_CACHE_MAX_ENTRIES).toBe(8);
  });

  it("invalidate does not revoke blob while retained by active playback", () => {
    const key = buildSessionAudioKey({
      kind: "beat",
      id: "active",
      versionId: "a1",
    });
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const url = ensureSessionAudioObjectUrl(key, bytes);
    retainSessionAudio(key);
    expect(sessionAudioRetainCount(key)).toBe(1);

    invalidateSessionAudio(key);
    // Still playable — revoke deferred while MediaElement holds the blob.
    expect(getSessionAudioObjectUrl(key)).toBe(url);
    expect(sessionAudioCacheSize()).toBe(1);

    releaseSessionAudio(key);
    expect(getSessionAudioObjectUrl(key)).toBeNull();
    expect(sessionAudioCacheSize()).toBe(0);
  });

  it("LRU does not evict retained entries", () => {
    const pinned = buildSessionAudioKey({
      kind: "beat",
      id: "pin",
      versionId: "1",
    });
    ensureSessionAudioObjectUrl(pinned, new Uint8Array([9]).buffer);
    retainSessionAudio(pinned);
    const pinnedUrl = getSessionAudioObjectUrl(pinned);

    for (let i = 0; i < SESSION_AUDIO_CACHE_MAX_ENTRIES + 2; i += 1) {
      const k = buildSessionAudioKey({
        kind: "beat",
        id: `x${i}`,
        versionId: "1",
      });
      ensureSessionAudioObjectUrl(k, new Uint8Array([i]).buffer);
    }

    expect(getSessionAudioObjectUrl(pinned)).toBe(pinnedUrl);
    expect(sessionAudioRetainCount(pinned)).toBe(1);
    releaseSessionAudio(pinned);
  });
});
