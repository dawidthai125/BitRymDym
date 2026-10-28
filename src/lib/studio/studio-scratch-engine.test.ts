import { describe, expect, it } from "vitest";

import {
  reverseStudioAudioBuffer,
  StudioAudioEngine,
  type StudioAudioBufferLike,
  type StudioAudioContextLike,
  type StudioAudioEngineHost,
  type StudioBufferSourceLike,
  type StudioMediaElement,
} from "@/lib/studio/studio-audio-engine";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";

const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeNode() {
  return {
    gain: { value: 1 },
    pan: { value: 0 },
    connect(dest: never) {
      return dest;
    },
    disconnect() {},
  };
}

function createHost(): StudioAudioEngineHost {
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: fakeNode(),
    async resume() {},
    async close() {},
    createGain: () => fakeNode(),
    createStereoPanner: () => fakeNode(),
    createAnalyser: () => {
      const node = fakeNode() as ReturnType<typeof fakeNode> & {
        fftSize: number;
        smoothingTimeConstant: number;
        frequencyBinCount: number;
        getFloatTimeDomainData: (array: Float32Array) => void;
      };
      node.fftSize = 256;
      node.smoothingTimeConstant = 0;
      node.frequencyBinCount = 128;
      node.getFloatTimeDomainData = (array: Float32Array) => {
        array.fill(0);
      };
      return node;
    },
    createMediaElementSource: () => fakeNode(),
    createBufferSource: () => {
      throw new Error("createBufferSource not stubbed");
    },
    createBuffer(
      numberOfChannels: number,
      length: number,
      sampleRate: number,
    ) {
      const channels = Array.from(
        { length: numberOfChannels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData(channel: number) {
          return channels[channel] ?? new Float32Array(length);
        },
      };
    },
    async decodeAudioData() {
      return {
        numberOfChannels: 1,
        length: 8,
        sampleRate: 8,
        duration: 1,
        getChannelData() {
          return new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
        },
      };
    },
  } as unknown as StudioAudioContextLike;
  return {
    createContext() {
      return ctx;
    },
    createMediaElement() {
      const el: StudioMediaElement = {
        src: "",
        currentTime: 0,
        paused: true,
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        playbackRate: 1,
        async play() {
          this.paused = false;
        },
        pause() {
          this.paused = true;
        },
        load() {},
      };
      return el;
    },
    nowMs() {
      return 0;
    },
    requestTick() {
      return 1;
    },
    cancelTick() {},
  };
}

describe("StudioAudioEngine Scratch live rate", () => {
  it("applies linked rate on existing timeline voices and releases to 1", async () => {
    const rates: number[] = [];
    const host = createHost();
    const originalCreate = host.createMediaElement;
    host.createMediaElement = () => {
      const el = originalCreate();
      Object.defineProperty(el, "playbackRate", {
        get() {
          return rates[rates.length - 1] ?? 1;
        },
        set(value: number) {
          rates.push(value);
        },
        configurable: true,
      });
      el.playbackRate = 1;
      return el;
    };

    const engine = new StudioAudioEngine({
      registry: createStudioSourceAdapterRegistry(
        createDefaultStudioSourceAdapters({
          resolveBeatUrl: async () => null,
          resolveTakeUrl: async () => ({
            url: "https://cdn.example/take.wav",
            expiresAt: Date.now() + 60_000,
          }),
        }),
      ),
      host,
      listener: {
        onPlayhead: () => undefined,
        onLifecycle: () => undefined,
        onError: () => undefined,
        onTimelineEnded: () => undefined,
      },
    });

    const track: StudioEngineTrack = {
      id: "vocal",
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
    };
    const clip: StudioEngineClip = {
      id: "c1",
      trackId: "vocal",
      sourceKind: "TAKE",
      sourceTakeId: TAKE_A,
      sourceBeatId: null,
      sourceOffsetMs: 0,
      timelineStartMs: 0,
      durationMs: 4000,
      gainDb: 0,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    };
    const document: StudioEngineDocument = {
      timelineLengthMs: 10_000,
      masterGainDb: 0,
      masterPan: 0,
      projectBeatId: null,
      tracks: [track],
      clips: [clip],
    };
    engine.setDocument(document);
    await engine.play(0);
    expect(engine.applyScratchLive({ rate: 1.5 })).toBe(true);
    expect(rates).toContain(1.5);
    engine.releaseScratchLive();
    expect(rates.at(-1)).toBe(1);
    engine.dispose();
  });

  it("starts BufferSource reverse on the same engine and restores HTML rate", async () => {
    const started: number[] = [];
    const host = createHost();
    const ctx = host.createContext();
    host.createContext = () => ctx;
    host.decodeSource = async () => ({
      numberOfChannels: 1,
      length: 4,
      sampleRate: 4,
      duration: 1,
      getChannelData() {
        return new Float32Array([1, 2, 3, 4]);
      },
    });
    ctx.createBufferSource = () => {
      const source = {
        buffer: null as StudioAudioBufferLike | null,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        connect() {
          return source;
        },
        disconnect() {},
        start(_when?: number, offset?: number) {
          started.push(offset ?? 0);
        },
        stop() {},
      };
      return source as unknown as StudioBufferSourceLike;
    };

    const engine = new StudioAudioEngine({
      registry: createStudioSourceAdapterRegistry(
        createDefaultStudioSourceAdapters({
          resolveBeatUrl: async () => null,
          resolveTakeUrl: async () => ({
            url: "https://cdn.example/take.wav",
            expiresAt: Date.now() + 60_000,
          }),
        }),
      ),
      host,
      listener: {
        onPlayhead: () => undefined,
        onLifecycle: () => undefined,
        onError: () => undefined,
        onTimelineEnded: () => undefined,
      },
    });

    const track: StudioEngineTrack = {
      id: "vocal",
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
    };
    const clip: StudioEngineClip = {
      id: "c1",
      trackId: "vocal",
      sourceKind: "TAKE",
      sourceTakeId: TAKE_A,
      sourceBeatId: null,
      sourceOffsetMs: 0,
      timelineStartMs: 0,
      durationMs: 4000,
      gainDb: 0,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    };
    engine.setDocument({
      timelineLengthMs: 10_000,
      masterGainDb: 0,
      masterPan: 0,
      projectBeatId: null,
      tracks: [track],
      clips: [clip],
    });
    await engine.play(0);
    expect(engine.applyScratchLive({ rate: 1.25, reverse: true })).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(started.length).toBeGreaterThan(0);
    expect(engine.applyScratchLive({ rate: 1, reverse: false })).toBe(true);
    engine.dispose();
  });
});

describe("reverseStudioAudioBuffer", () => {
  it("reverses channel samples without a second engine", () => {
    const source: StudioAudioBufferLike = {
      numberOfChannels: 1,
      length: 4,
      sampleRate: 4,
      duration: 1,
      getChannelData() {
        return new Float32Array([1, 2, 3, 4]);
      },
    };
    const reversed = reverseStudioAudioBuffer(null, source);
    expect(Array.from(reversed.getChannelData(0))).toEqual([4, 3, 2, 1]);
    expect(reversed.duration).toBe(source.duration);
  });

  it("keeps duration when reversing through context createBuffer", () => {
    const source: StudioAudioBufferLike = {
      numberOfChannels: 1,
      length: 4,
      sampleRate: 4,
      duration: 1,
      getChannelData() {
        return new Float32Array([1, 2, 3, 4]);
      },
    };
    const ctx = {
      createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
        const data = new Float32Array(length);
        return {
          numberOfChannels,
          length,
          sampleRate,
          getChannelData() {
            return data;
          },
        };
      },
    } as unknown as StudioAudioContextLike;
    const reversed = reverseStudioAudioBuffer(ctx, source);
    expect(reversed.duration).toBe(1);
    expect(Array.from(reversed.getChannelData(0))).toEqual([4, 3, 2, 1]);
  });
});
