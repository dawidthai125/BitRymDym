/**
 * P6.7.1 — Clip fade runtime (pure helpers + engine wiring).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  StudioAudioEngine,
  type StudioAudioContextLike,
  type StudioAudioEngineHost,
  type StudioMediaElement,
} from "@/lib/studio/studio-audio-engine";
import type { StudioEngineClip, StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import { clipGraphGain } from "@/lib/studio/studio-audio-schedule";
import {
  applyClipFadeGainParam,
  baseClipGain,
  effectiveClipGain,
  fadeEnvelopeAt,
  normalizeFades,
  planClipFadeSchedule,
} from "@/lib/studio/studio-clip-fade";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

function clip(
  overrides: Partial<StudioEngineClip> & Pick<StudioEngineClip, "id">,
): StudioEngineClip {
  return {
    trackId: "t1",
    sourceKind: "BEAT_REF",
    sourceTakeId: null,
    sourceBeatId: "b1",
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 10_000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

describe("P6.7.1 normalizeFades", () => {
  it("leaves valid pairs unchanged", () => {
    expect(normalizeFades(1000, 2000, 10_000)).toEqual({
      fadeInMs: 1000,
      fadeOutMs: 2000,
    });
  });

  it("returns zeros when D=0", () => {
    expect(normalizeFades(100, 100, 0)).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
  });

  it("clamps each side to duration", () => {
    expect(normalizeFades(50_000, 0, 1000)).toEqual({
      fadeInMs: 1000,
      fadeOutMs: 0,
    });
  });

  it("proportionally normalizes overlap so Fi+Fo === D", () => {
    // Freeze: clamp each to D first → (2000,1000), then scale 2:1 onto D=2000
    const n = normalizeFades(3000, 1000, 2000);
    expect(n.fadeInMs + n.fadeOutMs).toBe(2000);
    expect(n.fadeInMs).toBe(1333);
    expect(n.fadeOutMs).toBe(667);
  });

  it("preserves approximate ratio on overlap after clamp", () => {
    // (600,200) clamps to (400,200) → ratio 2:1 on D=400
    const n = normalizeFades(600, 200, 400);
    expect(n.fadeInMs + n.fadeOutMs).toBe(400);
    expect(n.fadeInMs / n.fadeOutMs).toBeCloseTo(2, 0);
  });
});

describe("P6.7.1 fadeEnvelopeAt", () => {
  it("zero fade → envelope 1 inside clip", () => {
    expect(fadeEnvelopeAt(0, 0, 0, 1000)).toBe(1);
    expect(fadeEnvelopeAt(500, 0, 0, 1000)).toBe(1);
    expect(fadeEnvelopeAt(999, 0, 0, 1000)).toBe(1);
  });

  it("fade-in at t=0 → 0", () => {
    expect(fadeEnvelopeAt(0, 1000, 0, 5000)).toBe(0);
  });

  it("fade-in midpoint → linear", () => {
    expect(fadeEnvelopeAt(500, 1000, 0, 5000)).toBeCloseTo(0.5, 8);
  });

  it("fade-in end → 1", () => {
    expect(fadeEnvelopeAt(1000, 1000, 0, 5000)).toBe(1);
  });

  it("before fade-out / after fade-in → 1", () => {
    expect(fadeEnvelopeAt(2000, 1000, 1000, 5000)).toBe(1);
  });

  it("fade-out start → 1", () => {
    expect(fadeEnvelopeAt(4000, 0, 1000, 5000)).toBe(1);
  });

  it("fade-out midpoint → linear", () => {
    expect(fadeEnvelopeAt(4500, 0, 1000, 5000)).toBeCloseTo(0.5, 8);
  });

  it("fade-out end approach → 0", () => {
    expect(fadeEnvelopeAt(4999, 0, 1000, 5000)).toBeCloseTo(0.001, 5);
  });

  it("after clip / t>=D → 0", () => {
    expect(fadeEnvelopeAt(5000, 0, 1000, 5000)).toBe(0);
    expect(fadeEnvelopeAt(6000, 0, 0, 5000)).toBe(0);
  });

  it("t<0 → 0", () => {
    expect(fadeEnvelopeAt(-1, 1000, 0, 5000)).toBe(0);
  });

  it("D=0 → 0", () => {
    expect(fadeEnvelopeAt(0, 0, 0, 0)).toBe(0);
  });

  it("Fi=0 skips fade-in region", () => {
    expect(fadeEnvelopeAt(0, 0, 1000, 5000)).toBe(1);
  });

  it("Fo=0 skips fade-out region", () => {
    expect(fadeEnvelopeAt(4999, 1000, 0, 5000)).toBe(1);
  });

  it("never returns NaN / out of range", () => {
    for (const t of [-10, 0, 1, 500, 999, 1000, 2500, 4000, 4999, 5000, 9000]) {
      const e = fadeEnvelopeAt(t, 1000, 1000, 5000);
      expect(Number.isFinite(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe("P6.7.1 base × envelope", () => {
  it("baseClipGain remains independent of fade fields", () => {
    const c = clip({
      id: "c",
      gainDb: -6,
      fadeInMs: 2000,
      fadeOutMs: 2000,
    });
    expect(baseClipGain(c)).toBe(clipGraphGain(c));
    expect(baseClipGain(c)).toBeCloseTo(0.501, 2);
  });

  it("effective gain = base × envelope", () => {
    const c = clip({
      id: "c",
      gainDb: 0,
      fadeInMs: 1000,
      timelineStartMs: 0,
      durationMs: 5000,
    });
    // base=1, mid fade-in env=0.5 → 0.5
    expect(effectiveClipGain(c, 500)).toBeCloseTo(0.5, 8);
    const quiet = clip({ ...c, id: "q", gainDb: -6 });
    expect(effectiveClipGain(quiet, 500)).toBeCloseTo(0.501 * 0.5, 2);
  });

  it("muted base stays 0 regardless of envelope", () => {
    const c = clip({
      id: "c",
      muted: true,
      fadeInMs: 0,
      fadeOutMs: 0,
      durationMs: 1000,
    });
    expect(effectiveClipGain(c, 0)).toBe(0);
    expect(effectiveClipGain(c, 500)).toBe(0);
  });

  it("overlapping clips are independent", () => {
    const a = clip({
      id: "a",
      timelineStartMs: 0,
      durationMs: 4000,
      fadeInMs: 0,
      fadeOutMs: 2000,
      gainDb: 0,
    });
    const b = clip({
      id: "b",
      timelineStartMs: 2000,
      durationMs: 4000,
      fadeInMs: 2000,
      fadeOutMs: 0,
      gainDb: 0,
    });
    // At 3000: A in fade-out mid (env 0.5), B in fade-in mid (env 0.5)
    expect(effectiveClipGain(a, 3000)).toBeCloseTo(0.5, 8);
    expect(effectiveClipGain(b, 3000)).toBeCloseTo(0.5, 8);
    // Changing A fades must not change B
    const a2 = { ...a, fadeOutMs: 0 };
    expect(effectiveClipGain(a2, 3000)).toBe(1);
    expect(effectiveClipGain(b, 3000)).toBeCloseTo(0.5, 8);
  });
});

describe("P6.7.1 schedule plan (seek / play-from-middle)", () => {
  it("seek into fade does not restart from 0", () => {
    const c = clip({
      id: "c",
      fadeInMs: 1000,
      durationMs: 5000,
      timelineStartMs: 0,
    });
    const plan = planClipFadeSchedule({
      clip: c,
      playheadMs: 500,
      contextTime: 10,
      scheduleForward: true,
    });
    expect(plan.immediateGain).toBeCloseTo(0.5, 8);
    expect(plan.immediateGain).not.toBe(0);
  });

  it("seek out of fade-in applies plateau (1 × base)", () => {
    const c = clip({
      id: "c",
      fadeInMs: 1000,
      fadeOutMs: 1000,
      durationMs: 5000,
    });
    const plan = planClipFadeSchedule({
      clip: c,
      playheadMs: 2500,
      contextTime: 0,
      scheduleForward: true,
    });
    expect(plan.immediateGain).toBe(1);
  });

  it("seek into fade-out applies mid level", () => {
    const c = clip({
      id: "c",
      fadeOutMs: 1000,
      durationMs: 5000,
    });
    const plan = planClipFadeSchedule({
      clip: c,
      playheadMs: 4500,
      contextTime: 0,
      scheduleForward: true,
    });
    expect(plan.immediateGain).toBeCloseTo(0.5, 8);
  });

  it("play from middle schedules forward without restart", () => {
    const c = clip({
      id: "c",
      fadeInMs: 2000,
      fadeOutMs: 1000,
      durationMs: 10_000,
    });
    const plan = planClipFadeSchedule({
      clip: c,
      playheadMs: 1000,
      contextTime: 5,
      scheduleForward: true,
    });
    expect(plan.immediateGain).toBeCloseTo(0.5, 8);
    expect(plan.ramps.some((r) => r.kind === "linearRamp")).toBe(true);
  });

  it("pause hold has no forward ramps", () => {
    const c = clip({ id: "c", fadeInMs: 1000, durationMs: 5000 });
    const plan = planClipFadeSchedule({
      clip: c,
      playheadMs: 200,
      contextTime: 1,
      scheduleForward: false,
    });
    expect(plan.immediateGain).toBeCloseTo(0.2, 8);
    expect(plan.ramps).toEqual([]);
  });
});

describe("P6.7.1 applyClipFadeGainParam", () => {
  it("cancels prior automation and sets immediate gain", () => {
    const events: string[] = [];
    const param = {
      value: 99,
      cancelScheduledValues(when: number) {
        events.push(`cancel:${when}`);
      },
      setValueAtTime(value: number, when: number) {
        events.push(`set:${value}@${when}`);
        param.value = value;
      },
      linearRampToValueAtTime(value: number, when: number) {
        events.push(`ramp:${value}@${when}`);
      },
    };
    const c = clip({ id: "c", fadeInMs: 1000, durationMs: 5000 });
    applyClipFadeGainParam(param, c, 500, 2, true);
    expect(events[0]).toBe("cancel:2");
    expect(events[1]).toMatch(/^set:0\.5@2/);
    expect(param.value).toBeCloseTo(0.5, 8);
    expect(events.some((e) => e.startsWith("ramp:"))).toBe(true);
  });
});

type FakeNode = {
  kind: string;
  connections: FakeNode[];
  gain: {
    value: number;
    cancelScheduledValues: (when: number) => void;
    setValueAtTime: (value: number, when: number) => void;
    linearRampToValueAtTime: (value: number, when: number) => void;
    events: string[];
  };
  pan: { value: number };
  connect(dest: FakeNode): FakeNode;
  disconnect(): void;
};

function createFadeHost(): {
  host: StudioAudioEngineHost;
  created: FakeNode[];
  contexts: StudioAudioContextLike[];
} {
  const created: FakeNode[] = [];
  const contexts: StudioAudioContextLike[] = [];
  const now = 0;
  const tickById = new Map<number, () => void>();
  let tickSeq = 0;

  function fakeNode(kind: string): FakeNode {
    const events: string[] = [];
    const node: FakeNode = {
      kind,
      connections: [],
      gain: {
        value: 1,
        events,
        cancelScheduledValues(when) {
          events.push(`cancel:${when}`);
        },
        setValueAtTime(value, when) {
          events.push(`set:${value}@${when}`);
          node.gain.value = value;
        },
        linearRampToValueAtTime(value, when) {
          events.push(`ramp:${value}@${when}`);
        },
      },
      pan: { value: 0 },
      connect(dest) {
        if (!node.connections.includes(dest)) node.connections.push(dest);
        return dest;
      },
      disconnect() {
        node.connections = [];
      },
    };
    created.push(node);
    return node;
  }

  const host: StudioAudioEngineHost = {
    createContext() {
      const ctx = {
        currentTime: 0,
        state: "running",
        destination: fakeNode("destination"),
        resume: async () => {
          ctx.state = "running";
        },
        close: async () => {
          ctx.state = "closed";
        },
        createGain: () => fakeNode("gain"),
        createStereoPanner: () => fakeNode("panner"),
        createAnalyser: () => {
          const n = fakeNode("analyser");
          (n as FakeNode & { fftSize: number; frequencyBinCount: number }).fftSize = 256;
          (n as FakeNode & { frequencyBinCount: number }).frequencyBinCount = 128;
          (n as FakeNode & {
            getFloatTimeDomainData: (a: Float32Array) => void;
          }).getFloatTimeDomainData = (a) => {
            a.fill(0);
          };
          (n as FakeNode & { smoothingTimeConstant: number }).smoothingTimeConstant = 0;
          return n as unknown as ReturnType<StudioAudioContextLike["createAnalyser"]>;
        },
        createMediaElementSource: () => fakeNode("mediaSource"),
        createBiquadFilter: () => fakeNode("biquad"),
        createDynamicsCompressor: () => fakeNode("dynamics"),
        createDelay: () => fakeNode("delay"),
        createConvolver: () => fakeNode("convolver"),
        createBuffer: () => ({}) as AudioBuffer,
      } as unknown as StudioAudioContextLike & { currentTime: number };
      Object.defineProperty(ctx, "currentTime", {
        get: () => now,
        configurable: true,
      });
      contexts.push(ctx);
      return ctx;
    },
    createMediaElement() {
      return {
        src: "",
        currentTime: 0,
        paused: true,
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        async play() {
          this.paused = false;
        },
        pause() {
          this.paused = true;
        },
        load() {},
      } as StudioMediaElement;
    },
    nowMs: () => now,
    requestTick(cb) {
      const id = ++tickSeq;
      tickById.set(id, cb);
      return id;
    },
    cancelTick(id) {
      tickById.delete(id);
    },
  };

  return { host, created, contexts };
}

function docOf(clips: StudioEngineClip[]): StudioEngineDocument {
  return {
    timelineLengthMs: 60_000,
    masterGainDb: 0,
    masterPan: 0,
    masterFxChain: emptyStudioFxChain(),
    tracks: [
      {
        id: "t1",
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        effectsChain: emptyStudioFxChain(),
      },
    ],
    clips,
  };
}

describe("P6.7.1 StudioAudioEngine fade wiring", () => {
  it("play from middle applies mid fade envelope (not restart)", async () => {
    const { host, created } = createFadeHost();
    const registry = createStudioSourceAdapterRegistry(
      createDefaultStudioSourceAdapters({
        resolveBeatUrl: async () => ({
          url: "https://example.test/b.bin",
          expiresAt: Date.now() + 60_000,
        }),
        resolveTakeUrl: async () => null,
      }),
    );
    const engine = new StudioAudioEngine({
      host,
      registry,
      listener: {
        onPlayhead: () => {},
        onLifecycle: () => {},
        onError: () => {},
        onTimelineEnded: () => {},
      },
    });
    const c = clip({
      id: "c-fade",
      fadeInMs: 1000,
      durationMs: 5000,
      timelineStartMs: 0,
    });
    engine.setDocument(docOf([c]));
    await engine.play(500);
    const gains = created.filter((n) => n.kind === "gain");
    const voiceGain = gains.find((g) =>
      g.gain.events.some((e) => e.startsWith("set:0.5")),
    );
    expect(voiceGain).toBeTruthy();
    expect(voiceGain!.gain.value).toBeCloseTo(0.5, 8);
    engine.dispose();
  });

  it("seek into fade does not restart from silence", async () => {
    const { host, created } = createFadeHost();
    const registry = createStudioSourceAdapterRegistry(
      createDefaultStudioSourceAdapters({
        resolveBeatUrl: async () => ({
          url: "https://example.test/b.bin",
          expiresAt: Date.now() + 60_000,
        }),
        resolveTakeUrl: async () => null,
      }),
    );
    const engine = new StudioAudioEngine({
      host,
      registry,
      listener: {
        onPlayhead: () => {},
        onLifecycle: () => {},
        onError: () => {},
        onTimelineEnded: () => {},
      },
    });
    engine.setDocument(
      docOf([
        clip({
          id: "c-fade",
          fadeInMs: 2000,
          durationMs: 8000,
        }),
      ]),
    );
    await engine.play(0);
    await engine.seek(1000, true);
    const voiceGain = created
      .filter((n) => n.kind === "gain")
      .find((g) => g.gain.events.some((e) => e.includes("cancel:")));
    expect(voiceGain).toBeTruthy();
    expect(voiceGain!.gain.value).toBeCloseTo(0.5, 8);
    expect(voiceGain!.gain.value).not.toBe(0);
    engine.dispose();
  });

  it("stop holds neutral fade at playhead 0 without duplicating clip gains", async () => {
    const { host, created } = createFadeHost();
    const registry = createStudioSourceAdapterRegistry(
      createDefaultStudioSourceAdapters({
        resolveBeatUrl: async () => ({
          url: "https://example.test/b.bin",
          expiresAt: Date.now() + 60_000,
        }),
        resolveTakeUrl: async () => null,
      }),
    );
    const engine = new StudioAudioEngine({
      host,
      registry,
      listener: {
        onPlayhead: () => {},
        onLifecycle: () => {},
        onError: () => {},
        onTimelineEnded: () => {},
      },
    });
    engine.setDocument(
      docOf([clip({ id: "c1", fadeInMs: 1000, durationMs: 5000 })]),
    );
    await engine.play(0);
    const gainsBefore = created.filter((n) => n.kind === "gain").length;
    engine.stop();
    const gainsAfter = created.filter((n) => n.kind === "gain").length;
    expect(gainsAfter).toBe(gainsBefore);
    expect(engine.inspectVoiceClipGain("c1")).toBeTruthy();
    engine.dispose();
  });

  it("graph rebuild reuses one clip GainNode per voice", async () => {
    const { host, created } = createFadeHost();
    const registry = createStudioSourceAdapterRegistry(
      createDefaultStudioSourceAdapters({
        resolveBeatUrl: async () => ({
          url: "https://example.test/b.bin",
          expiresAt: Date.now() + 60_000,
        }),
        resolveTakeUrl: async () => null,
      }),
    );
    const engine = new StudioAudioEngine({
      host,
      registry,
      listener: {
        onPlayhead: () => {},
        onLifecycle: () => {},
        onError: () => {},
        onTimelineEnded: () => {},
      },
    });
    const c = clip({ id: "c1", fadeInMs: 500, durationMs: 4000 });
    engine.setDocument(docOf([c]));
    await engine.play(0);
    const g1 = engine.inspectVoiceClipGain("c1");
    engine.setDocument(docOf([{ ...c, fadeInMs: 800 }]));
    await engine.play(100);
    const g2 = engine.inspectVoiceClipGain("c1");
    expect(g1).toBe(g2);
    const mediaSources = created.filter((n) => n.kind === "mediaSource");
    expect(mediaSources.length).toBe(1);
    engine.dispose();
  });
});

describe("P6.7.1 architecture guards", () => {
  it("does not introduce FadeEngine / AutomationEngine / timers / PlayerProvider", () => {
    const fadeSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-clip-fade.ts"),
      "utf8",
    );
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(fadeSrc).not.toMatch(/FadeEngine|AutomationEngine|ClipFadeEngine/);
    expect(engineSrc).not.toMatch(/FadeEngine|AutomationEngine|ClipFadeEngine/);
    expect(fadeSrc).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(engineSrc).toMatch(/applyClipFadeGainParam/);
    expect(engineSrc).not.toMatch(/from ["']@\/components\/player/);
    expect(engineSrc).not.toMatch(/mix-graph/);
  });

  it("keeps meter helpers / topology markers unchanged in engine", () => {
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(engineSrc).toMatch(/subscribeMeter|subscribeTrackMeter/);
    expect(engineSrc).toMatch(/masterAnalyser|trackAnalyser/);
    expect(engineSrc).toMatch(/applyClipFadeGainParam/);
  });
});
