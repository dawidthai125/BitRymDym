import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSessionAudioKey,
  loadSessionAudioFromUrl,
  peekSessionAudioBytes,
  resetSessionAudioCacheForTests,
  sessionAudioCacheSize,
} from "@/lib/audio/session-audio-bytes";
import type { StudioResolvedSource } from "@/lib/studio/studio-audio-source-adapter";
import {
  getResolvedStudioBeatAudioSourceKey,
  isVersionedBeatAudioSourceKey,
  rememberStudioBeatAudioSourceKey,
  resetStudioBeatSessionKeysForTests,
  resolveStudioBeatSessionSource,
  studioBeatAudioSourceKey,
} from "@/lib/studio/studio-beat-session-source";
import {
  createStudioWaveformPeaksCache,
  resetStudioWaveformPeaksCacheForTests,
  resolveStudioWaveformPeaks,
} from "@/lib/studio/studio-waveform-cache";
import { studioWaveformSourceKey } from "@/lib/studio/studio-waveform-geometry";
import { STUDIO_WAVEFORM_PEAKS_PER_SECOND } from "@/lib/studio/studio-waveform-peaks";

function stubDecode() {
  const OfflineAudioContext = vi.fn().mockImplementation(() => ({
    decodeAudioData: async () => ({
      numberOfChannels: 1,
      sampleRate: 44_100,
      length: 8,
      duration: 8 / 44_100,
      getChannelData: () => new Float32Array(8),
      copyFromChannel: () => undefined,
      copyToChannel: () => undefined,
    }),
    close: async () => undefined,
  }));
  vi.stubGlobal("OfflineAudioContext", OfflineAudioContext);
}

afterEach(() => {
  resetSessionAudioCacheForTests();
  resetStudioWaveformPeaksCacheForTests();
  resetStudioBeatSessionKeysForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("WAVE 1.1 studio beat session identity", () => {
  it("builds Player-compatible beat|assetId keys", () => {
    expect(studioBeatAudioSourceKey("B1", "A1")).toBe("beat:B1|A1");
    expect(studioBeatAudioSourceKey("B1", "A1")).toBe(
      buildSessionAudioKey({ kind: "beat", id: "B1", versionId: "A1" }),
    );
    expect(studioBeatAudioSourceKey("B1", "A1")).not.toBe(
      studioBeatAudioSourceKey("B1", "A2"),
    );
    expect(isVersionedBeatAudioSourceKey("beat:B1|A1")).toBe(true);
    expect(isVersionedBeatAudioSourceKey("beat:B1")).toBe(false);
    expect(isVersionedBeatAudioSourceKey("beat:B1|v0")).toBe(false);
    expect(isVersionedBeatAudioSourceKey("take:t1")).toBe(false);
  });

  it("master replace A1→A2 does not reuse A1 bytes (transport + waveform)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    stubDecode();
    const urlCache = new Map<string, StudioResolvedSource>();
    const bytesByAsset = new Map<string, ArrayBuffer>([
      ["A1", new Uint8Array([1, 1, 1]).buffer],
      ["A2", new Uint8Array([2, 2, 2, 2]).buffer],
    ]);
    let fetches = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      fetches += 1;
      const asset = url.includes("A2") ? "A2" : "A1";
      return {
        ok: true,
        arrayBuffer: async () => bytesByAsset.get(asset)!,
      } as Response;
    });

    const loadFromUrl: typeof loadSessionAudioFromUrl = (key, url, opts) =>
      loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

    const a1 = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    expect(a1?.url.startsWith("blob:")).toBe(true);
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBe("beat:B1|A1");
    expect(peekSessionAudioBytes("beat:B1|A1")?.byteLength).toBe(3);
    expect(peekSessionAudioBytes("beat:B1")).toBeNull();

    const peaksCache = createStudioWaveformPeaksCache(4);
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:B1|A1",
      url: "https://example.test/A1-other-signed.bin",
      cache: peaksCache,
      peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    });
    expect(fetches).toBe(1);

    const a2 = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A2.bin",
        assetId: "A2",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    expect(a2?.url.startsWith("blob:")).toBe(true);
    expect(a2?.url).not.toBe(a1?.url);
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBe("beat:B1|A2");
    expect(peekSessionAudioBytes("beat:B1|A2")?.byteLength).toBe(4);
    expect(peekSessionAudioBytes("beat:B1|A1")?.byteLength).toBe(3);
    expect(fetches).toBe(2);

    await resolveStudioWaveformPeaks({
      sourceKey: "beat:B1|A2",
      url: "https://example.test/A2-other.bin",
      cache: peaksCache,
      peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    });
    expect(fetches).toBe(2);
    expect(peaksCache.getBySourceKey("beat:B1|A1")).not.toBeNull();
    expect(peaksCache.getBySourceKey("beat:B1|A2")).not.toBeNull();
    expect(peaksCache.getBySourceKey("beat:B1")).toBeNull();
  });

  it("same beat+asset: transport then waveform share one GET", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    stubDecode();
    const urlCache = new Map<string, StudioResolvedSource>();
    let fetches = 0;
    const fetchImpl = vi.fn(async () => {
      fetches += 1;
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array(32).buffer,
      } as Response;
    });
    const loadFromUrl: typeof loadSessionAudioFromUrl = (key, url, opts) =>
      loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

    await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/master.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:B1|A1",
      url: "https://example.test/master-signed-2.bin",
      cache: createStudioWaveformPeaksCache(4),
      peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    });
    expect(fetches).toBe(1);
  });

  it("parallel inflight for same asset shares one fetch; different assets do not", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    let fetches = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      fetches += 1;
      await new Promise((r) => setTimeout(r, 20));
      const n = url.includes("A2") ? 2 : 1;
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array(n).buffer,
      } as Response;
    });

    const [x, y, z] = await Promise.all([
      loadSessionAudioFromUrl(
        "beat:B1|A1",
        "https://example.test/A1.bin",
        { enabled: true, fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
      loadSessionAudioFromUrl(
        "beat:B1|A1",
        "https://example.test/A1-b.bin",
        { enabled: true, fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
      loadSessionAudioFromUrl(
        "beat:B1|A2",
        "https://example.test/A2.bin",
        { enabled: true, fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ]);
    expect(fetches).toBe(2);
    expect(x.bytes.byteLength).toBe(1);
    expect(y.bytes.byteLength).toBe(1);
    expect(z.bytes.byteLength).toBe(2);
    expect(x.objectUrl).toBe(y.objectUrl);
    expect(z.objectUrl).not.toBe(x.objectUrl);
  });

  it("remount with A2 does not treat A1 cache as A2", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    const urlCache = new Map<string, StudioResolvedSource>();
    const fetchImpl = vi.fn(async (url: string) => {
      const asset = url.includes("A2") ? "A2" : "A1";
      return {
        ok: true,
        arrayBuffer: async () =>
          new Uint8Array(asset === "A2" ? [9, 9] : [1]).buffer,
      } as Response;
    });
    const loadFromUrl: typeof loadSessionAudioFromUrl = (key, url, opts) =>
      loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

    await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    // Simulate remount: clear URL cache + remembered key, keep session store.
    urlCache.clear();
    resetStudioBeatSessionKeysForTests();
    expect(peekSessionAudioBytes("beat:B1|A1")).not.toBeNull();

    const a2 = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A2.bin",
        assetId: "A2",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    expect(peekSessionAudioBytes("beat:B1|A2")?.byteLength).toBe(2);
    expect(a2?.url).not.toBe(
      (await loadSessionAudioFromUrl(
        "beat:B1|A1",
        "https://example.test/unused",
        { enabled: true, fetchImpl: fetchImpl as unknown as typeof fetch },
      )).objectUrl,
    );
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBe("beat:B1|A2");
  });

  it("late A1 response must not overwrite selected A2 url cache entry", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    const urlCache = new Map<string, StudioResolvedSource>();
    let releaseA1: () => void = () => undefined;
    const a1Gate = new Promise<void>((resolve) => {
      releaseA1 = resolve;
    });

    const loadFromUrl: typeof loadSessionAudioFromUrl = async (
      key,
      url,
      opts,
    ) => {
      if (url.includes("A1")) await a1Gate;
      return loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () =>
            new Uint8Array(url.includes("A2") ? [2] : [1]).buffer,
        })) as unknown as typeof fetch,
      });
    };

    const p1 = resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    const a2 = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A2.bin",
        assetId: "A2",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    releaseA1();
    const late = await p1;

    // Per-asset caches remain distinct.
    expect(urlCache.get("beat:B1|A2")?.url).toBe(a2?.url);
    expect(urlCache.get("beat:B1|A1")?.url).toBeTruthy();
    expect(urlCache.get("beat:B1|A1")?.url).not.toBe(a2?.url);
    // Newer resolve (A2) stays remembered despite late A1 completion.
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBe("beat:B1|A2");
    // Critical: late A1 must return the active A2 playable source, not A1.
    expect(late?.url).toBe(a2?.url);
    expect(late?.url).not.toBe(urlCache.get("beat:B1|A1")?.url);
  });

  it("late A1 returns null when A2 has not remembered yet", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    const urlCache = new Map<string, StudioResolvedSource>();
    let releaseA1: () => void = () => undefined;
    let releaseA2Load: () => void = () => undefined;
    const a1Gate = new Promise<void>((r) => {
      releaseA1 = r;
    });
    const a2LoadGate = new Promise<void>((r) => {
      releaseA2Load = r;
    });

    const loadFromUrl: typeof loadSessionAudioFromUrl = async (
      key,
      url,
      opts,
    ) => {
      if (url.includes("A1")) await a1Gate;
      if (url.includes("A2")) await a2LoadGate;
      return loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () =>
            new Uint8Array(url.includes("A2") ? [2] : [1]).buffer,
        })) as unknown as typeof fetch,
      });
    };

    const p1 = resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    const p2 = resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A2.bin",
        assetId: "A2",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    // A1 finishes while A2 is still loading (epoch advanced, no remember yet).
    releaseA1();
    const late = await p1;
    expect(late).toBeNull();
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBeNull();
    releaseA2Load();
    const a2 = await p2;
    expect(a2?.url).toBeTruthy();
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBe("beat:B1|A2");
  });

  it("missing assetId skips session cache (no bare beatId entry)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    const urlCache = new Map<string, StudioResolvedSource>();
    let fetches = 0;
    const loadFromUrl = vi.fn(async () => {
      fetches += 1;
      return {
        bytes: new Uint8Array([1]).buffer,
        objectUrl: "blob:should-not",
      };
    });

    const source = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/signed.bin",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl: loadFromUrl as unknown as typeof loadSessionAudioFromUrl,
    });
    expect(source?.url).toBe("https://example.test/signed.bin");
    expect(fetches).toBe(0);
    expect(sessionAudioCacheSize()).toBe(0);
    expect(urlCache.size).toBe(0);
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBeNull();
  });

  it("fetch error for A2 leaves A1 cache intact", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    const urlCache = new Map<string, StudioResolvedSource>();
    const loadFromUrl: typeof loadSessionAudioFromUrl = (key, url, opts) =>
      loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: vi.fn(async () => {
          if (url.includes("A2")) {
            return { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) };
          }
          return {
            ok: true,
            arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
          };
        }) as unknown as typeof fetch,
      });

    await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
    });
    await expect(
      resolveStudioBeatSessionSource({
        beatId: "B1",
        access: {
          success: true,
          url: "https://example.test/A2.bin",
          assetId: "A2",
        },
        urlCache,
        dedupEnabled: true,
        loadFromUrl,
      }),
    ).rejects.toThrow(/SESSION_AUDIO_FETCH_FAILED/);
    expect(peekSessionAudioBytes("beat:B1|A1")?.byteLength).toBe(2);
    expect(peekSessionAudioBytes("beat:B1|A2")).toBeNull();
  });

  it("dedup OFF uses signed URL and does not populate session store", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "0");
    const urlCache = new Map<string, StudioResolvedSource>();
    const loadFromUrl = vi.fn();
    const source = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: false,
      loadFromUrl: loadFromUrl as unknown as typeof loadSessionAudioFromUrl,
    });
    expect(source?.url).toBe("https://example.test/A1.bin");
    expect(loadFromUrl).not.toHaveBeenCalled();
    expect(sessionAudioCacheSize()).toBe(0);
    // Remember still runs so waveform sourceKey matches identity after access.
    expect(getResolvedStudioBeatAudioSourceKey("B1")).toBe("beat:B1|A1");
  });

  it("waveform useSessionBytes=false does not hydrate bare beat key", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    stubDecode();
    let fetches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetches += 1;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array(16).buffer,
        };
      }),
    );
    // Custom load path is used when useSessionBytes false with default loader —
    // resolveStudioWaveformPeaks falls through to studioPeaksFromAudioUrl.
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:B1",
      url: "https://example.test/x.bin",
      cache: createStudioWaveformPeaksCache(4),
      useSessionBytes: false,
      peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    });
    expect(peekSessionAudioBytes("beat:B1")).toBeNull();
    expect(sessionAudioCacheSize()).toBe(0);
    expect(fetches).toBe(1);
  });

  it("studioWaveformSourceKey prefers remembered versioned beat key", () => {
    const clip = {
      sourceKind: "BEAT_REF" as const,
      sourceTakeId: null,
      sourceBeatId: "B1",
      sourceArtifactId: null,
    };
    expect(studioWaveformSourceKey(clip)).toBe("beat:B1");
    rememberStudioBeatAudioSourceKey("B1", "beat:B1|A9");
    expect(studioWaveformSourceKey(clip)).toBe("beat:B1|A9");
  });

  it("unchanged asset reuses url cache without second session fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
    const urlCache = new Map<string, StudioResolvedSource>();
    let fetches = 0;
    const loadFromUrl: typeof loadSessionAudioFromUrl = (key, url, opts) => {
      fetches += 1;
      return loadSessionAudioFromUrl(key, url, {
        ...opts,
        fetchImpl: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new Uint8Array([5]).buffer,
        })) as unknown as typeof fetch,
      });
    };
    const first = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
      now: 1_000,
    });
    const second = await resolveStudioBeatSessionSource({
      beatId: "B1",
      access: {
        success: true,
        url: "https://example.test/A1-new-signed.bin",
        assetId: "A1",
      },
      urlCache,
      dedupEnabled: true,
      loadFromUrl,
      now: 2_000,
    });
    expect(fetches).toBe(1);
    expect(second?.url).toBe(first?.url);
  });
});
