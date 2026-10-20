import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSessionAudioKey,
  resetSessionAudioCacheForTests,
  sessionAudioCacheSize,
} from "@/lib/audio/session-audio-bytes";
import {
  createStudioWaveformPeaksCache,
  resetStudioWaveformPeaksCacheForTests,
  resolveStudioWaveformPeaks,
} from "@/lib/studio/studio-waveform-cache";
import {
  STUDIO_WAVEFORM_PEAKS_PER_SECOND,
  studioPeaksFromAudioBytes,
} from "@/lib/studio/studio-waveform-peaks";

afterEach(() => {
  resetSessionAudioCacheForTests();
  resetStudioWaveformPeaksCacheForTests();
  vi.unstubAllEnvs();
});

describe("WAVE 1-B studio session + waveform share", () => {
  it("session key for beat matches waveform sourceKey prefix", () => {
    // Transport stores under `beat:${id}`; waveform sourceKey is the same.
    expect(buildSessionAudioKey({ kind: "beat", id: "abc" })).toContain(
      "beat:abc",
    );
  });

  it("custom load path still used when injected (flag-independent tests)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "0");
    const cache = createStudioWaveformPeaksCache(4);
    let loads = 0;
    const load = async (_url: string, peaksPerSecond: number) => {
      loads += 1;
      return {
        peaks: [{ min: 0, max: 1 }],
        peaksPerSecond,
        sampleRate: 44_100,
        channels: 1,
        durationMs: 1000,
      };
    };
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:shared",
      url: "https://example.test/x",
      cache,
      load,
      peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    });
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:shared",
      url: "https://example.test/x",
      cache,
      load,
      peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    });
    expect(loads).toBe(1);
  });

  it("resolveStudioWaveformPeaks with dedup ON fetches Storage once per sourceKey", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRD_AUDIO_SESSION_DEDUP", "1");
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

    let fetches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetches += 1;
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array(64).buffer,
        };
      }),
    );

    const cache = createStudioWaveformPeaksCache(4);
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:one-get",
      url: "https://example.test/master.bin",
      cache,
    });
    // Second consumer (engine already hydrated session OR waveform remount):
    await resolveStudioWaveformPeaks({
      sourceKey: "beat:one-get",
      url: "https://example.test/master-other-signed.bin",
      cache,
    });
    expect(fetches).toBe(1);
  });

  it("studioPeaksFromAudioBytes does not fetch", async () => {
    const OfflineAudioContext = vi.fn().mockImplementation(() => ({
      decodeAudioData: async (_buf: ArrayBuffer) => ({
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

    const bytes = new Uint8Array(32).buffer;
    const payload = await studioPeaksFromAudioBytes(bytes, 10);
    expect(payload.peaksPerSecond).toBe(10);
    expect(sessionAudioCacheSize()).toBe(0);
  });
});
