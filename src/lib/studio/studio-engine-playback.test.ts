/**
 * Playback engine on a simulated clock: elements advance with the AudioContext time,
 * sources resolve and report metadata with a delay, ticks run like requestAnimationFrame.
 */
import { describe, expect, it } from "vitest";

import {
  StudioAudioEngine,
  type StudioAudioBufferLike,
  type StudioAudioContextLike,
  type StudioAudioEngineHost,
  type StudioMediaElement,
} from "@/lib/studio/studio-audio-engine";
import {
  clipGraphGain,
  masterGraphParams,
  trackGraphParams,
  type StudioEngineClip,
  type StudioEngineDocument,
} from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import { emptyMidi } from "@/lib/studio/studio-midi";

const flush = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

type SimElement = StudioMediaElement & { log: string[] };

function createSim(opts: { resolveMs?: number; metadataMs?: number; startLagMs?: number; fileSec?: number } = {}) {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const later = (ms: number, fn: () => void) => timers.push({ at: now + ms, fn });
  const delay = (ms: number) =>
    ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => later(ms, resolve));
  let ticks: { id: number; cb: () => void }[] = [];
  let tickId = 0;
  let maxTicks = 0;
  const elements: SimElement[] = [];
  const resolves: string[] = [];
  const sources: { buffer: unknown; offset: number; at: number; stopped: boolean; end: () => void }[] = [];
  const created: unknown[] = [];
  let decodes = 0;
  const node = () => ({
    gain: { value: 1 },
    pan: { value: 0 },
    connect: (d: unknown) => d,
    disconnect() {},
  });
  const makeBuffer = (channels: number, length: number, sampleRate: number): StudioAudioBufferLike => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c]! };
  };
  const ctx = {
    get currentTime() {
      return now / 1000;
    },
    state: "running",
    sampleRate: 8000,
    destination: node(),
    async resume() {},
    async close() {},
    createGain: node,
    createStereoPanner: node,
    createAnalyser: () => ({ ...node(), fftSize: 256, smoothingTimeConstant: 0, frequencyBinCount: 128, getFloatTimeDomainData() {} }),
    createMediaElementSource: node,
    createBuffer: (c: number, l: number, sr: number) => {
      const b = makeBuffer(c, l, sr);
      created.push(b);
      return b;
    },
    createBufferSource: () => {
      const src = {
        ...node(),
        buffer: null as unknown,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        start(_when: number, offset: number) {
          sources.push({
            buffer: src.buffer,
            offset,
            at: now,
            stopped: false,
            end: () => src.onended?.(),
          });
        },
        stop() {},
      };
      return src;
    },
  } as unknown as StudioAudioContextLike;

  const host: StudioAudioEngineHost = {
    createContext: () => ctx,
    createMediaElement() {
      let base = 0;
      let playingSince: number | null = null;
      let ready = false;
      let src = "";
      const listeners = new Map<string, (() => void)[]>();
      const fileSec = opts.fileSec ?? 600;
      const position = () =>
        Math.min(fileSec, playingSince == null ? base : base + Math.max(0, now - playingSince) / 1000);
      const el: SimElement = {
        log: [],
        get src() {
          return src;
        },
        set src(value: string) {
          src = value;
        },
        get currentTime() {
          return position();
        },
        set currentTime(value: number) {
          // Browsers ignore a seek before the metadata is there.
          if (!ready) {
            el.log.push("seek-ignored");
            return;
          }
          base = value;
          if (playingSince != null) playingSince = now;
          el.log.push(`seek:${value.toFixed(2)}`);
        },
        get paused() {
          return playingSince == null || position() >= fileSec;
        },
        set paused(_value: boolean) {},
        get ended() {
          return ready && position() >= fileSec;
        },
        get duration() {
          return ready ? fileSec : Number.NaN;
        },
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        get readyState() {
          return ready ? 1 : 0;
        },
        async play() {
          el.log.push(`play@${now}`);
          if (position() >= fileSec) base = 0;
          playingSince = now + (opts.startLagMs ?? 0);
        },
        pause() {
          if (playingSince == null) return;
          base = position();
          playingSince = null;
          el.log.push(`pause@${now}`);
        },
        load() {
          if (!src) return;
          const finish = () => {
            ready = true;
            for (const fn of listeners.get("loadedmetadata") ?? []) fn();
          };
          if ((opts.metadataMs ?? 0) > 0) later(opts.metadataMs!, finish);
          else finish();
        },
        addEventListener(type, fn) {
          listeners.set(type, [...(listeners.get(type) ?? []), fn]);
        },
        removeEventListener() {},
      };
      elements.push(el);
      return el;
    },
    nowMs: () => now,
    requestTick(cb) {
      tickId += 1;
      ticks.push({ id: tickId, cb });
      maxTicks = Math.max(maxTicks, ticks.length);
      return tickId;
    },
    cancelTick(id) {
      ticks = ticks.filter((t) => t.id !== id);
    },
    async decodeSource() {
      decodes += 1;
      return makeBuffer(1, 8000 * 20, 8000);
    },
  };

  const playheads: number[] = [];
  const errors: string[] = [];
  let ended = 0;
  let onPlayhead: ((ms: number) => void) | null = null;
  const engine = new StudioAudioEngine({
    registry: createStudioSourceAdapterRegistry(
      createDefaultStudioSourceAdapters({
        resolveBeatUrl: async (id) => {
          resolves.push(`beat:${id}`);
          await delay(opts.resolveMs ?? 0);
          return { url: `https://x/${id}.mp3`, expiresAt: Date.now() + 1e6 };
        },
        resolveTakeUrl: async (id) => {
          resolves.push(`take:${id}`);
          await delay(opts.resolveMs ?? 0);
          return { url: `https://x/${id}.wav`, expiresAt: Date.now() + 1e6 };
        },
      }),
    ),
    host,
    listener: {
      onPlayhead: (ms) => {
        playheads.push(ms);
        onPlayhead?.(ms);
      },
      onLifecycle: () => undefined,
      onError: (e) => errors.push(e.code),
      onTimelineEnded: () => {
        ended += 1;
      },
    },
  });

  return {
    engine,
    elements,
    resolves,
    sources,
    created,
    playheads,
    errors,
    ended: () => ended,
    decodes: () => decodes,
    maxTicks: () => maxTicks,
    now: () => now,
    element: (name: string) => elements.find((e) => e.src.includes(name))!,
    setOnPlayhead: (fn: (ms: number) => void) => {
      onPlayhead = fn;
    },
    async advance(ms: number) {
      const until = now + ms;
      await flush();
      while (now < until) {
        now += 10;
        for (const t of timers.filter((x) => x.at <= now)) {
          timers.splice(timers.indexOf(t), 1);
          t.fn();
        }
        await flush();
        const due = ticks;
        ticks = [];
        for (const t of due) t.cb();
        await flush();
      }
    },
  };
}

const track = (id: string) => ({ id, gainDb: 0, pan: 0, muted: false, solo: false });
const clip = (o: Partial<StudioEngineClip> & { id: string }): StudioEngineClip => ({
  trackId: "t",
  sourceKind: "TAKE",
  sourceTakeId: o.id,
  sourceBeatId: null,
  sourceOffsetMs: 0,
  timelineStartMs: 0,
  durationMs: 10_000,
  gainDb: 0,
  muted: false,
  fadeInMs: 0,
  fadeOutMs: 0,
  ...o,
});
const beat = (o: Partial<StudioEngineClip> = {}) =>
  clip({ id: "beat", sourceKind: "BEAT_REF", sourceTakeId: null, sourceBeatId: "B", durationMs: 60_000, ...o });
const doc = (clips: StudioEngineClip[], o: Partial<StudioEngineDocument> = {}): StudioEngineDocument => ({
  timelineLengthMs: 60_000,
  masterGainDb: 0,
  masterPan: 0,
  tracks: [track("t")],
  clips,
  ...o,
});
const pauses = (el: SimElement) => el.log.filter((l) => l.startsWith("pause")).length;
const plays = (el: SimElement) => el.log.filter((l) => l.startsWith("play")).length;

describe("beat keeps playing", () => {
  it("6 s of playback asks for the beat address once and never pauses it", async () => {
    const sim = createSim({ resolveMs: 150 });
    sim.engine.setDocument(doc([beat()]));
    void sim.engine.play(0);
    await sim.advance(6000);
    expect(sim.resolves).toEqual(["beat:B"]);
    expect(plays(sim.element("B"))).toBe(1);
    expect(pauses(sim.element("B"))).toBe(0);
    expect(sim.element("B").currentTime).toBeGreaterThan(5.5);
  });

  it("every Play checks the beat once more (a replaced master), ticks do not", async () => {
    const sim = createSim();
    sim.engine.setDocument(doc([beat()]));
    void sim.engine.play(0);
    await sim.advance(1000);
    sim.engine.pause();
    void sim.engine.play(1000);
    await sim.advance(1000);
    expect(sim.resolves).toEqual(["beat:B", "beat:B"]);
  });

  it("a take that loads late does not touch the beat, is asked for once and joins in time", async () => {
    const sim = createSim({ resolveMs: 800, metadataMs: 100 });
    sim.engine.setDocument(doc([beat(), clip({ id: "vox", timelineStartMs: 300 })]));
    void sim.engine.play(0);
    await sim.advance(4000);
    expect(sim.resolves.filter((r) => r === "take:vox")).toHaveLength(1);
    expect(pauses(sim.element("B"))).toBe(0);
    const heard = sim.element("vox").currentTime * 1000 + 300;
    expect(Math.abs(heard - sim.playheads.at(-1)!)).toBeLessThan(60);
  });

  it("upcoming clips are loaded before the playhead reaches them", async () => {
    const sim = createSim({ resolveMs: 400 });
    sim.engine.setDocument(doc([beat(), clip({ id: "soon", timelineStartMs: 9000 }), clip({ id: "far", timelineStartMs: 40_000 })]));
    void sim.engine.play(0);
    await sim.advance(2500);
    expect(sim.resolves).toContain("take:soon");
    expect(sim.resolves).not.toContain("take:far");
    await sim.advance(8000);
    const el = sim.element("soon");
    expect(el.log.find((l) => l.startsWith("play"))).toBeDefined();
    expect(el.log).not.toContain("seek-ignored");
    expect(Math.abs(el.currentTime * 1000 + 9000 - sim.playheads.at(-1)!)).toBeLessThan(45);
  });

  it("a beat file shorter than its clip ends once and does not start over", async () => {
    const sim = createSim({ fileSec: 2 });
    sim.engine.setDocument(doc([beat({ durationMs: 10_000 })]));
    void sim.engine.play(0);
    await sim.advance(4000);
    expect(plays(sim.element("B"))).toBe(1);
  });
});

describe("shared start", () => {
  it("metadata, then position while paused, then all elements in the same moment", async () => {
    const sim = createSim({ resolveMs: 200, metadataMs: 300, startLagMs: 40 });
    sim.engine.setDocument(doc([beat(), clip({ id: "a" }), clip({ id: "b", sourceOffsetMs: 500 })]));
    void sim.engine.play(2000);
    await sim.advance(3000);
    const starts = sim.elements.map((e) => e.log.find((l) => l.startsWith("play")));
    expect(new Set(starts).size).toBe(1);
    for (const el of sim.elements) {
      expect(el.log).not.toContain("seek-ignored");
      expect(el.log.findIndex((l) => l.startsWith("seek"))).toBeLessThan(el.log.findIndex((l) => l.startsWith("play")));
      expect(pauses(el)).toBe(0);
    }
    // The clock follows the audible start, so line and sound agree.
    const heard = sim.element("/B").currentTime * 1000;
    expect(Math.abs(heard - sim.playheads.at(-1)!)).toBeLessThan(60);
  });

  it("seek while playing holds the clock until the voices are in place", async () => {
    const sim = createSim({ resolveMs: 500 });
    sim.engine.setDocument(doc([beat(), clip({ id: "late", timelineStartMs: 30_000 })]));
    void sim.engine.play(0);
    await sim.advance(2000);
    const n = sim.playheads.length;
    void sim.engine.seek(31_000, true);
    await sim.advance(300);
    expect(new Set(sim.playheads.slice(n))).toEqual(new Set([31_000]));
    await sim.advance(1500);
    expect(Math.abs(sim.element("late").currentTime * 1000 + 30_000 - sim.playheads.at(-1)!)).toBeLessThan(60);
  });

  it("Play, Stop, Play while loading leaves one clock and one start", async () => {
    const sim = createSim({ resolveMs: 400 });
    sim.engine.setDocument(doc([beat()]));
    void sim.engine.play(0);
    await sim.advance(100);
    sim.engine.stop();
    void sim.engine.play(0);
    await sim.advance(2000);
    expect(plays(sim.element("B"))).toBe(1);
    // One transport tick plus one meter tick.
    expect(sim.maxTicks()).toBeLessThanOrEqual(2);
  });

  it("stop during loading starts nothing", async () => {
    const sim = createSim({ resolveMs: 400 });
    sim.engine.setDocument(doc([beat()]));
    void sim.engine.play(0);
    await sim.advance(100);
    sim.engine.stop();
    await sim.advance(1000);
    expect(sim.elements.every((e) => e.paused)).toBe(true);
    expect(sim.errors).toEqual([]);
  });

  it("a loop wrap from the listener keeps a single clock", async () => {
    const sim = createSim();
    sim.engine.setDocument(doc([beat()]));
    sim.setOnPlayhead((ms) => {
      if (ms >= 1000) void sim.engine.seek(0, true);
    });
    void sim.engine.play(0);
    await sim.advance(5000);
    expect(sim.maxTicks()).toBeLessThanOrEqual(2);
    expect(Math.max(...sim.playheads)).toBeLessThan(1100);
    expect(sim.resolves).toEqual(["beat:B"]);
  });
});

describe("clips with tempo / pitch", () => {
  it("bakes once, plays the real buffer from the playhead, and a seek restarts it there", async () => {
    const sim = createSim({ resolveMs: 100 });
    sim.engine.setDocument(doc([clip({ id: "p", pitchCents: 300, durationMs: 18_000 })]));
    void sim.engine.play(2000);
    await sim.advance(1000);
    expect(sim.sources).toHaveLength(1);
    expect(sim.sources[0]!.offset).toBeCloseTo(2, 1);
    // AudioBufferSourceNode refuses anything but an AudioBuffer made by the context.
    expect(sim.created).toContain(sim.sources[0]!.buffer);
    const baked = sim.created.length;
    void sim.engine.seek(10_000, true);
    await sim.advance(500);
    expect(sim.sources).toHaveLength(2);
    expect(sim.sources[1]!.offset).toBeCloseTo(10, 1);
    sim.engine.pause();
    void sim.engine.play(10_500);
    await sim.advance(500);
    expect(sim.sources).toHaveLength(3);
    expect(sim.decodes()).toBe(1);
    expect(sim.created.length).toBe(baked);
  });

  it("a buffer that ended before its clip is not baked or started again", async () => {
    const sim = createSim();
    // 20 s file at double speed = 10 s of sound in a 15 s clip.
    sim.engine.setDocument(doc([clip({ id: "f", stretchRatio: 0.5, durationMs: 15_000 })]));
    void sim.engine.play(9500);
    await sim.advance(400);
    expect(sim.sources).toHaveLength(1);
    const baked = sim.created.length;
    sim.sources[0]!.end();
    await sim.advance(2000);
    expect(sim.sources).toHaveLength(1);
    expect(sim.created.length).toBe(baked);
    void sim.engine.seek(12_000, true);
    await sim.advance(500);
    expect(sim.sources).toHaveLength(1);
  });

  it("moving the clip during playback moves its sound", async () => {
    const sim = createSim();
    const c = clip({ id: "m", pitchCents: 100, durationMs: 15_000 });
    sim.engine.setDocument(doc([c]));
    void sim.engine.play(5000);
    await sim.advance(200);
    sim.engine.setDocument(doc([{ ...c, timelineStartMs: 1000 }]));
    await sim.advance(100);
    expect(sim.sources).toHaveLength(2);
    expect(sim.sources[1]!.offset).toBeCloseTo(4.2, 0);
  });
});

describe("song end, notes, levels", () => {
  it("stops at the song end, but plays on when started behind it", async () => {
    const sim = createSim();
    sim.engine.setDocument(doc([beat({ durationMs: 2000 })]));
    sim.engine.setPlayEndMs(2000);
    void sim.engine.play(1000);
    await sim.advance(3000);
    expect(sim.ended()).toBe(1);
    expect(sim.playheads.at(-1)).toBe(2000);
    void sim.engine.play(5000);
    await sim.advance(2000);
    expect(sim.ended()).toBe(1);
    expect(sim.playheads.at(-1)!).toBeGreaterThan(6000);
  });

  it("notes start at the clock position and are rendered only up to the last note, once", async () => {
    const sim = createSim();
    const midi = { ...emptyMidi(), notes: [{ t: 0, dur: 3000, pitch: 60, vel: 0.8 }] };
    sim.engine.setDocument(doc([], { tracks: [{ ...track("t"), midi }] }));
    void sim.engine.play(1000);
    await sim.advance(200);
    expect(sim.sources).toHaveLength(1);
    expect(sim.sources[0]!.offset).toBeCloseTo(1, 1);
    expect((sim.sources[0]!.buffer as StudioAudioBufferLike).length).toBe(3 * 8000);
    void sim.engine.seek(5000, true);
    await sim.advance(200);
    expect(sim.sources).toHaveLength(1);
  });

  it("boosts above 0 dB are heard on track, clip and Master", () => {
    const boost = Math.pow(10, 6 / 20);
    expect(trackGraphParams({ ...track("t"), gainDb: 6 }, false).gain).toBeCloseTo(boost, 5);
    expect(clipGraphGain({ gainDb: 6, muted: false })).toBeCloseTo(boost, 5);
    expect(masterGraphParams({ masterGainDb: 6, masterPan: 0 }).gain).toBeCloseTo(boost, 5);
    expect(masterGraphParams({ masterGainDb: 40, masterPan: 0 }).gain).toBeCloseTo(Math.pow(10, 12 / 20), 5);
  });
});
