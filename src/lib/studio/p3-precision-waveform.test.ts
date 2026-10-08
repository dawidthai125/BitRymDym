/**
 * Phase 3 / 3.1 — Precision waveform engine (peaks / cache / geometry / architecture).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

import {
  buildStudioWaveformCacheKey,
  createStudioWaveformPeaksCache,
  resetStudioWaveformPeaksCacheForTests,
  resolveStudioWaveformPeaks,
  studioWaveformPeaksCache,
} from "@/lib/studio/studio-waveform-cache";
import {
  resolveWaveformEdgeHit,
  resolveWaveformSourceWindow,
  resolveWaveformTimelineWindow,
  studioWaveformSourceKey,
  timelineMsFromClipLocalX,
} from "@/lib/studio/studio-waveform-geometry";
import {
  aggregateStudioPeaksForCssWidth,
  estimateWaveformPeakCount,
  msPerPeak,
  peaksPerCssPixel,
  resolvePeaksPerSecondForDuration,
  sliceStudioPeaksForSourceWindow,
  studioBipolarPeaksFromChannel,
  studioPeaksFromAudioBuffer,
  STUDIO_WAVEFORM_MAX_PEAKS_PER_SOURCE,
  STUDIO_WAVEFORM_PEAKS_PER_SECOND,
  type StudioWaveformPeak,
  type StudioWaveformPeaksPayload,
} from "@/lib/studio/studio-waveform-peaks";
import { STUDIO_TIMELINE_MAX_PX_PER_MS } from "@/lib/studio/studio-timeline-view";
import { msToPx } from "@/lib/studio/studio-timeline-view";

function fakeBuffer(params: {
  samples: Float32Array;
  sampleRate?: number;
  channels?: number;
}): {
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData: (ch: number) => Float32Array;
} {
  const sampleRate = params.sampleRate ?? 44_100;
  return {
    duration: params.samples.length / sampleRate,
    sampleRate,
    numberOfChannels: params.channels ?? 1,
    getChannelData: () => params.samples,
  };
}

function peakPayload(
  overrides: Partial<StudioWaveformPeaksPayload> & {
    peaks: StudioWaveformPeak[];
  },
): StudioWaveformPeaksPayload {
  return {
    durationMs: 10_000,
    sampleRate: 44_100,
    channels: 1,
    peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
    ...overrides,
  };
}

beforeEach(() => {
  resetStudioWaveformPeaksCacheForTests();
});

describe("Phase 3 source identity + geometry", () => {
  it("keys by source id not clip id", () => {
    expect(
      studioWaveformSourceKey({
        sourceKind: "TAKE",
        sourceTakeId: "take-1",
        sourceBeatId: null,
        sourceArtifactId: null,
      }),
    ).toBe("take:take-1");
    expect(
      studioWaveformSourceKey({
        sourceKind: "BEAT_REF",
        sourceTakeId: null,
        sourceBeatId: "beat-9",
        sourceArtifactId: null,
      }),
    ).toBe("beat:beat-9");
  });

  it("same Take → same source key for duplicate clips", () => {
    const a = studioWaveformSourceKey({
      sourceKind: "TAKE",
      sourceTakeId: "t1",
      sourceBeatId: null,
      sourceArtifactId: null,
    });
    const b = studioWaveformSourceKey({
      sourceKind: "TAKE",
      sourceTakeId: "t1",
      sourceBeatId: null,
      sourceArtifactId: null,
    });
    expect(a).toBe(b);
  });

  it("different sources → different keys", () => {
    expect(
      studioWaveformSourceKey({
        sourceKind: "TAKE",
        sourceTakeId: "a",
        sourceBeatId: null,
        sourceArtifactId: null,
      }),
    ).not.toBe(
      studioWaveformSourceKey({
        sourceKind: "TAKE",
        sourceTakeId: "b",
        sourceBeatId: null,
        sourceArtifactId: null,
      }),
    );
  });

  it("sourceOffset + duration resolve 5000→7000 window", () => {
    expect(
      resolveWaveformSourceWindow({
        sourceOffsetMs: 5000,
        durationMs: 2000,
      }),
    ).toEqual({
      sourceStartMs: 5000,
      sourceEndMs: 7000,
      durationMs: 2000,
    });
  });

  it("timeline window 10000→12000", () => {
    expect(
      resolveWaveformTimelineWindow({
        timelineStartMs: 10_000,
        durationMs: 2000,
      }),
    ).toEqual({
      timelineStartMs: 10_000,
      timelineEndMs: 12_000,
      durationMs: 2000,
    });
  });

  it("clip local X maps to integer timeline ms (20 ms split target)", () => {
    // width 2000px at 1 px/ms → 2000 ms clip starting at 10000
    expect(
      timelineMsFromClipLocalX({
        timelineStartMs: 10_000,
        durationMs: 2000,
        localXPx: 20,
        widthPx: 2000,
      }),
    ).toBe(10_020);
  });

  it("waveform width equals duration × pxPerMs at zoom levels", () => {
    const durationMs = 2000;
    for (const density of [0.01, 0.1, 1] as const) {
      expect(msToPx(durationMs, density)).toBe(durationMs * density);
    }
    expect(STUDIO_TIMELINE_MAX_PX_PER_MS).toBeGreaterThanOrEqual(1);
    expect(msToPx(20, 1)).toBe(20);
  });

  it("edge hit zones prepare trim L/R without new model", () => {
    expect(resolveWaveformEdgeHit({ localXPx: 2, widthPx: 200 })).toBe("left");
    expect(resolveWaveformEdgeHit({ localXPx: 198, widthPx: 200 })).toBe(
      "right",
    );
    expect(resolveWaveformEdgeHit({ localXPx: 100, widthPx: 200 })).toBe(
      "body",
    );
  });
});

describe("Phase 3 peaks", () => {
  it("generates bipolar peaks once from buffer", () => {
    const samples = new Float32Array(44_100);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = i % 2 === 0 ? 0.5 : -0.4;
    }
    const payload = studioPeaksFromAudioBuffer(fakeBuffer({ samples }), 100);
    expect(payload.peaks.length).toBeGreaterThan(10);
    expect(payload.durationMs).toBe(1000);
    expect(payload.peaks.some((p) => p.max > 0)).toBe(true);
    expect(payload.peaks.some((p) => p.min < 0)).toBe(true);
  });

  it("slicePeaks respects sourceOffset window", () => {
    const peaks: StudioWaveformPeak[] = Array.from({ length: 100 }, (_, i) => ({
      min: -0.1,
      max: i / 100,
    }));
    const sliced = sliceStudioPeaksForSourceWindow({
      peaks,
      sourceDurationMs: 10_000,
      sourceOffsetMs: 5000,
      windowDurationMs: 2000,
    });
    // 5s–7s of 10s → ~20% of peaks
    expect(sliced.length).toBeGreaterThanOrEqual(15);
    expect(sliced.length).toBeLessThanOrEqual(25);
    expect(sliced[0]?.max).toBeCloseTo(0.5, 1);
  });

  it("channel helper matches block peak scan", () => {
    const channel = new Float32Array([0, 1, -1, 0.5, -0.5, 0]);
    const peaks = studioBipolarPeaksFromChannel(channel, 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]!.max).toBe(1);
    expect(peaks[0]!.min).toBe(-1);
  });
});

describe("Phase 3 client cache", () => {
  it("cache miss then hit; duplicate sources share entry", async () => {
    let loads = 0;
    const cache = createStudioWaveformPeaksCache(8);
    const load = async () => {
      loads += 1;
      return peakPayload({
        peaks: [{ min: -0.2, max: 0.3 }],
        durationMs: 1000,
        sampleRate: 48_000,
        channels: 1,
      });
    };

    const first = await resolveStudioWaveformPeaks({
      sourceKey: "take:shared",
      url: "https://example.test/a.wav",
      cache,
      load,
    });
    expect(first.cacheHit).toBe(false);
    expect(loads).toBe(1);

    const second = await resolveStudioWaveformPeaks({
      sourceKey: "take:shared",
      url: "https://example.test/a.wav",
      cache,
      load,
    });
    expect(second.cacheHit).toBe(true);
    expect(loads).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it("different sources do not share cache", async () => {
    const cache = createStudioWaveformPeaksCache(8);
    let loads = 0;
    const load = async () => {
      loads += 1;
      return peakPayload({
        peaks: [{ min: 0, max: 0.1 * loads }],
        durationMs: 500,
      });
    };
    await resolveStudioWaveformPeaks({
      sourceKey: "take:a",
      url: "u1",
      cache,
      load,
    });
    await resolveStudioWaveformPeaks({
      sourceKey: "take:b",
      url: "u2",
      cache,
      load,
    });
    expect(loads).toBe(2);
  });

  it("in-flight dedupe shares one decode", async () => {
    const cache = createStudioWaveformPeaksCache(8);
    let loads = 0;
    const load = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 20));
      return peakPayload({ peaks: [{ min: 0, max: 1 }], durationMs: 100 });
    };
    const [a, b] = await Promise.all([
      resolveStudioWaveformPeaks({
        sourceKey: "beat:x",
        url: "u",
        cache,
        load,
      }),
      resolveStudioWaveformPeaks({
        sourceKey: "beat:x",
        url: "u",
        cache,
        load,
      }),
    ]);
    expect(loads).toBe(1);
    expect(a.payload).toBe(b.payload);
  });

  it("LRU evicts when over max entries", () => {
    const cache = createStudioWaveformPeaksCache(2);
    cache.set({
      key: buildStudioWaveformCacheKey({ sourceKey: "a" }),
      sourceKey: "a",
      payload: peakPayload({ peaks: [], durationMs: 1 }),
    });
    cache.set({
      key: buildStudioWaveformCacheKey({ sourceKey: "b" }),
      sourceKey: "b",
      payload: peakPayload({ peaks: [], durationMs: 1 }),
    });
    cache.set({
      key: buildStudioWaveformCacheKey({ sourceKey: "c" }),
      sourceKey: "c",
      payload: peakPayload({ peaks: [], durationMs: 1 }),
    });
    expect(cache.size()).toBe(2);
    expect(cache.getBySourceKey("a")).toBeNull();
  });

  it("singleton resets for tests", () => {
    studioWaveformPeaksCache.set({
      key: "k",
      sourceKey: "take:z",
      payload: peakPayload({ peaks: [], durationMs: 1 }),
    });
    expect(studioWaveformPeaksCache.size()).toBe(1);
    resetStudioWaveformPeaksCacheForTests();
    expect(studioWaveformPeaksCache.size()).toBe(0);
  });
});

describe("Phase 3 split integer ms (playhead precision)", () => {
  it("10000 + 20 → 10020 integer", () => {
    const playhead = 10_020;
    expect(Number.isInteger(playhead)).toBe(true);
    expect(
      timelineMsFromClipLocalX({
        timelineStartMs: 10_000,
        durationMs: 5000,
        localXPx: 20,
        widthPx: 5000,
      }),
    ).toBe(playhead);
  });
});

describe("Phase 3 wiring + architecture", () => {
  const editor = readFileSync(
    join(process.cwd(), "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const waveform = readFileSync(
    join(process.cwd(), "src/components/studio/studio-clip-waveform.tsx"),
    "utf8",
  );
  const transport = readFileSync(
    join(process.cwd(), "src/components/studio/studio-transport-provider.tsx"),
    "utf8",
  );
  const peaks = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-waveform-peaks.ts"),
    "utf8",
  );
  const cache = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-waveform-cache.ts"),
    "utf8",
  );

  it("wires StudioClipWaveform into timeline clips", () => {
    expect(editor).toMatch(/StudioClipLaneItem/);
    expect(editor).toMatch(/resolveClipSourceUrl/);
    const lane = readFileSync(
      join(process.cwd(), "src/components/studio/studio-clip-lane.tsx"),
      "utf8",
    );
    expect(lane).toMatch(/StudioClipWaveform/);
    expect(waveform).toMatch(/HTMLCanvasElement|getContext\(\"2d\"\)/);
    expect(waveform).toMatch(/devicePixelRatio/);
  });

  it("does not use brand Waveform", () => {
    expect(editor).not.toMatch(/from \"@\/components\/brand\/waveform\"/);
    expect(waveform).not.toMatch(/from \"@\/components\/brand\/waveform\"/);
    expect(waveform).not.toMatch(/peaksFromSeed/);
  });

  it("ONE engine / no new AudioContext in Studio waveform path", () => {
    expect(waveform).not.toMatch(/new AudioContext/);
    expect(waveform).not.toMatch(/new StudioAudioEngine/);
    expect(peaks).toMatch(/OfflineAudioContext/);
    expect(peaks).not.toMatch(/new AudioContext/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(transport).toMatch(/resolveClipSourceUrl/);
  });

  it("client cache only — no DB waveform table references", () => {
    expect(cache).toMatch(/Client-only/);
    expect(cache).not.toMatch(/supabase/);
    expect(cache).not.toMatch(/CREATE TABLE/);
    expect(cache).toMatch(/STUDIO_WAVEFORM_CACHE_MAX_ENTRIES/);
  });

  it("zoom redraw does not live in decode path", () => {
    expect(waveform).toMatch(/sliceStudioPeaksForSourceWindow/);
    expect(waveform).toMatch(/resolveStudioWaveformPeaks/);
    expect(waveform).toMatch(/aggregateStudioPeaksForCssWidth/);
    // gain/mute do not trigger URL reload by themselves in deps list beyond muted redraw
    expect(waveform).toMatch(/clip\.muted/);
    expect(waveform).not.toMatch(/gainDb/);
  });

  it("playhead remains transport SSOT — no waveformPlayheadMs", () => {
    expect(waveform).not.toMatch(/waveformPlayheadMs/);
    expect(editor).toMatch(/playheadMs=\{transport\.state\.playheadMs\}/);
  });

  it("Phase 3.1 — hover guide is DOM-local (no setHover on mousemove)", () => {
    expect(waveform).toMatch(/updateGuide/);
    expect(waveform).not.toMatch(/setHover/);
    expect(waveform).toMatch(/guideRef/);
  });
});

describe("Phase 3.1 peak resolution + zoom projection", () => {
  it("base resolution is 1000 peaks/s (1 peak / ms)", () => {
    expect(STUDIO_WAVEFORM_PEAKS_PER_SECOND).toBe(1000);
    expect(msPerPeak(STUDIO_WAVEFORM_PEAKS_PER_SECOND)).toBe(1);
  });

  it("long takes soft-cap peaks without a second decode path", () => {
    const longMs = 20 * 60_000; // 20 minutes
    const pps = resolvePeaksPerSecondForDuration(longMs);
    expect(pps).toBeLessThan(STUDIO_WAVEFORM_PEAKS_PER_SECOND);
    expect(estimateWaveformPeakCount(longMs, pps)).toBeLessThanOrEqual(
      STUDIO_WAVEFORM_MAX_PEAKS_PER_SOURCE,
    );
  });

  it("zoom densities preserve width contract and do not require decode", () => {
    const durationMs = 2000;
    for (const density of [0.01, 0.1, 0.5, 1.0] as const) {
      const width = msToPx(durationMs, density);
      expect(width).toBe(durationMs * density);
      const ppc = peaksPerCssPixel({
        windowDurationMs: durationMs,
        peaksPerSecond: STUDIO_WAVEFORM_PEAKS_PER_SECOND,
        cssWidthPx: width,
      });
      // Low zoom aggregates many peaks/px; max zoom ≈ 1 peak/px.
      if (density === 0.01) expect(ppc).toBeGreaterThan(50);
      if (density === 0.1) expect(ppc).toBeGreaterThan(5);
      if (density === 0.5) expect(ppc).toBeGreaterThan(1);
      if (density === 1.0) expect(ppc).toBeCloseTo(1, 5);
    }
  });

  it("aggregateStudioPeaksForCssWidth reduces columns at low zoom", () => {
    const peaks: StudioWaveformPeak[] = Array.from({ length: 1000 }, (_, i) => ({
      min: -0.2,
      max: (i % 10) / 10,
    }));
    const low = aggregateStudioPeaksForCssWidth(peaks, 20);
    expect(low).toHaveLength(20);
    const high = aggregateStudioPeaksForCssWidth(peaks, 2000);
    // peaks denser than width → keep native length (no inventing samples)
    expect(high).toHaveLength(1000);
  });

  it("sourceOffset variants + near-end window", () => {
    expect(
      resolveWaveformSourceWindow({ sourceOffsetMs: 0, durationMs: 1000 }),
    ).toEqual({ sourceStartMs: 0, sourceEndMs: 1000, durationMs: 1000 });

    const peaks: StudioWaveformPeak[] = Array.from({ length: 100 }, (_, i) => ({
      min: 0,
      max: i / 100,
    }));
    const nearEnd = sliceStudioPeaksForSourceWindow({
      peaks,
      sourceDurationMs: 10_000,
      sourceOffsetMs: 9500,
      windowDurationMs: 400,
    });
    expect(nearEnd.length).toBeGreaterThan(0);
    expect(nearEnd.length).toBeLessThanOrEqual(10);

    const shortClip = sliceStudioPeaksForSourceWindow({
      peaks,
      sourceDurationMs: 10_000,
      sourceOffsetMs: 0,
      windowDurationMs: 500,
    });
    expect(shortClip.length).toBeLessThanOrEqual(10);
  });

  it("duplicate Take keys share cache (three clips → one load)", async () => {
    const cache = createStudioWaveformPeaksCache(8);
    let loads = 0;
    const load = async () => {
      loads += 1;
      return peakPayload({ peaks: [{ min: -0.1, max: 0.2 }], durationMs: 800 });
    };
    const key = studioWaveformSourceKey({
      sourceKind: "TAKE",
      sourceTakeId: "same-take",
      sourceBeatId: null,
      sourceArtifactId: null,
    })!;
    await Promise.all([
      resolveStudioWaveformPeaks({ sourceKey: key, url: "u", cache, load }),
      resolveStudioWaveformPeaks({ sourceKey: key, url: "u", cache, load }),
      resolveStudioWaveformPeaks({ sourceKey: key, url: "u", cache, load }),
    ]);
    expect(loads).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it("DPR-aware canvas sizing contract in component", () => {
    const waveform = readFileSync(
      join(process.cwd(), "src/components/studio/studio-clip-waveform.tsx"),
      "utf8",
    );
    expect(waveform).toMatch(/devicePixelRatio/);
    expect(waveform).toMatch(/canvas\.width = Math\.floor\(cssW \* dpr\)/);
    expect(waveform).toMatch(/canvas\.height = Math\.floor\(cssH \* dpr\)/);
  });

  it("muted + fade geometry remain view-only (no re-decode deps)", () => {
    const waveform = readFileSync(
      join(process.cwd(), "src/components/studio/studio-clip-waveform.tsx"),
      "utf8",
    );
    expect(waveform).toMatch(/data-muted=\{clip\.muted/);
    expect(waveform).toMatch(/drawFadeOverlays/);
    expect(waveform).toMatch(/clip\.fadeInMs/);
    expect(waveform).toMatch(/clip\.fadeOutMs/);
  });

  it("Artifact remains unavailable adapter — not an active Studio waveform source", () => {
    const adapter = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-source-adapter.ts"),
      "utf8",
    );
    expect(adapter).toMatch(/ARTIFACT playback is not shipped/);
    const transport = readFileSync(
      join(
        process.cwd(),
        "src/components/studio/studio-transport-provider.tsx",
      ),
      "utf8",
    );
    expect(transport).toMatch(/ARTIFACT playback \/ peaks not shipped/);
  });
});
