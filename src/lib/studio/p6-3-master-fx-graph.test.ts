/**
 * P6.3 — Master FX graph on StudioAudioEngine.
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
import { STUDIO_AUDIO_ERROR_CODES } from "@/lib/studio/studio-audio-errors";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import {
  defaultStudioFxParams,
  parseStudioFxChainForWrite,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";
import {
  buildStudioMasterFxChain,
  buildStudioTrackFxChain,
} from "@/lib/studio/studio-fx-graph";

const BEAT_ID = "11111111-1111-4111-8111-111111111111";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_EQ = "3fa85f64-5717-4562-b3fc-2c963f66afb1";
const ID_COMP = "3fa85f64-5717-4562-b3fc-2c963f66afb2";
const ID_DELAY = "3fa85f64-5717-4562-b3fc-2c963f66afb3";
const ID_REV = "3fa85f64-5717-4562-b3fc-2c963f66afb4";
const ID_LIM = "3fa85f64-5717-4562-b3fc-2c963f66afb5";

type FakeNode = {
  kind: string;
  connections: FakeNode[];
  disconnected: boolean;
  gain: { value: number };
  pan: { value: number };
  type: string;
  frequency: { value: number };
  Q: { value: number };
  threshold: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  knee: { value: number };
  delayTime: { value: number };
  buffer: unknown;
  normalize: boolean;
  connect(dest: FakeNode): FakeNode;
  disconnect(): void;
};

function fakeNode(kind: string): FakeNode {
  const node: FakeNode = {
    kind,
    connections: [],
    disconnected: false,
    gain: { value: 1 },
    pan: { value: 0 },
    type: "peaking",
    frequency: { value: 1000 },
    Q: { value: 1 },
    threshold: { value: -24 },
    ratio: { value: 3 },
    attack: { value: 0.01 },
    release: { value: 0.1 },
    knee: { value: 6 },
    delayTime: { value: 0.25 },
    buffer: null,
    normalize: true,
    connect(dest: FakeNode) {
      node.disconnected = false;
      if (!node.connections.includes(dest)) node.connections.push(dest);
      return dest;
    },
    disconnect() {
      node.connections = [];
      node.disconnected = true;
    },
  };
  return node;
}

function createTrackingHost(played: string[] = []): {
  host: StudioAudioEngineHost;
  created: FakeNode[];
  contexts: StudioAudioContextLike[];
} {
  const created: FakeNode[] = [];
  const contexts: StudioAudioContextLike[] = [];
  const dest = fakeNode("destination");
  created.push(dest);
  const ctx = {
    currentTime: 0,
    state: "running",
    sampleRate: 48000,
    destination: dest,
    resume: async () => undefined,
    close: async () => undefined,
    createGain: () => {
      const n = fakeNode("gain");
      created.push(n);
      return n;
    },
    createStereoPanner: () => {
      const n = fakeNode("panner");
      created.push(n);
      return n;
    },
    createBiquadFilter: () => {
      const n = fakeNode("biquad");
      created.push(n);
      return n;
    },
    createDynamicsCompressor: () => {
      const n = fakeNode("dynamics");
      created.push(n);
      return n;
    },
    createDelay: () => {
      const n = fakeNode("delay");
      created.push(n);
      return n;
    },
    createConvolver: () => {
      const n = fakeNode("convolver");
      created.push(n);
      return n;
    },
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createMediaElementSource: () => {
      const n = fakeNode("media");
      created.push(n);
      return n;
    },
  } as unknown as StudioAudioContextLike;
  contexts.push(ctx);

  const host: StudioAudioEngineHost = {
    createContext: () => ctx,
    createMediaElement: () => {
      const el: StudioMediaElement = {
        src: "",
        currentTime: 0,
        paused: true,
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        async play() {
          el.paused = false;
          played.push(el.src);
        },
        pause() {
          el.paused = true;
        },
        load() {
          /* noop */
        },
      };
      return el;
    },
    nowMs: () => 0,
    requestTick: () => 1,
    cancelTick: () => undefined,
  };
  return { host, created, contexts };
}

function track(
  id: string,
  overrides: Partial<StudioEngineTrack> = {},
): StudioEngineTrack {
  return {
    id,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...overrides,
  };
}

function clip(
  overrides: Partial<StudioEngineClip> &
    Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
): StudioEngineClip {
  return {
    sourceTakeId: null,
    sourceBeatId: null,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 5000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

function documentOf(
  tracks: StudioEngineTrack[],
  clips: StudioEngineClip[] = [],
  masterFxChain?: unknown,
): StudioEngineDocument {
  return {
    timelineLengthMs: 20_000,
    masterGainDb: 0,
    masterPan: 0,
    masterFxChain,
    tracks,
    clips,
  };
}

function effect(
  type: "eq" | "compressor" | "limiter" | "reverb" | "delay",
  id: string,
  extra: { enabled?: boolean; params?: Record<string, unknown> } = {},
) {
  return {
    id,
    type,
    enabled: extra.enabled ?? true,
    params: extra.params ?? defaultStudioFxParams(type),
  };
}

function chainOf(
  effects: ReturnType<typeof effect>[],
): { schemaVersion: 1; effects: ReturnType<typeof effect>[] } {
  return { schemaVersion: 1, effects };
}

function asFake(node: { connect: unknown } | null | undefined): FakeNode {
  if (!node) throw new Error("missing node");
  return node as unknown as FakeNode;
}

function engineWith(host: StudioAudioEngineHost) {
  const errors: string[] = [];
  const playheads: number[] = [];
  const lifecycles: string[] = [];
  const registry = createStudioSourceAdapterRegistry(
    createDefaultStudioSourceAdapters({
      resolveBeatUrl: async () => ({
        url: "https://cdn.example/beat.mp3",
        expiresAt: Date.now() + 60_000,
      }),
      resolveTakeUrl: async (id) => ({
        url: `https://cdn.example/${id}.wav`,
        expiresAt: Date.now() + 60_000,
      }),
    }),
  );
  const engine = new StudioAudioEngine({
    registry,
    host,
    listener: {
      onPlayhead: (ms) => playheads.push(ms),
      onLifecycle: (l) => lifecycles.push(l),
      onError: (e) => errors.push(e.code),
      onTimelineEnded: () => undefined,
    },
  });
  return { engine, errors, playheads, lifecycles };
}

describe("P6.3 Master factory / reuse", () => {
  it("reuses Track FX factory for Master (same adapters)", () => {
    expect(buildStudioMasterFxChain).toBe(buildStudioTrackFxChain);
  });

  it("builds empty Master chain as null (Σ tracks → Master Gain)", () => {
    const { host } = createTrackingHost();
    expect(
      buildStudioMasterFxChain(host.createContext(), chainOf([]), () => undefined),
    ).toBeNull();
  });

  it("builds EQ compressor limiter reverb delay for Master", () => {
    const { host, created } = createTrackingHost();
    const handle = buildStudioMasterFxChain(
      host.createContext(),
      chainOf([
        effect("eq", ID_EQ),
        effect("compressor", ID_COMP),
        effect("reverb", ID_REV),
        effect("delay", ID_DELAY),
        effect("limiter", ID_LIM),
      ]),
      () => undefined,
    );
    expect(handle?.inspect().map((s) => s.type)).toEqual([
      "eq",
      "compressor",
      "reverb",
      "delay",
      "limiter",
    ]);
    expect(created.some((n) => n.kind === "biquad")).toBe(true);
    expect(created.some((n) => n.kind === "dynamics")).toBe(true);
    expect(created.some((n) => n.kind === "convolver")).toBe(true);
    expect(created.some((n) => n.kind === "delay")).toBe(true);
  });
});

describe("P6.3 Master insert topology", () => {
  it("empty Master chain keeps masterInput → masterGain → masterPan", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(documentOf([track("beat"), track("vocal")]));
    const inspect = engine.inspectMasterFx();
    expect(inspect?.insert).toBe("dry");
    expect(asFake(inspect?.masterInput).connections).toContain(
      asFake(inspect?.masterGain),
    );
    expect(asFake(inspect?.masterGain).connections).toContain(
      asFake(inspect?.masterPan),
    );
  });

  it("inserts Master FX between track sum and Master Gain/Pan", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("beat"), track("vocal")],
        [],
        chainOf([effect("eq", ID_EQ), effect("limiter", ID_LIM)]),
      ),
    );
    const inspect = engine.inspectMasterFx();
    expect(inspect?.insert).toBe("fx");
    expect(inspect?.slots.map((s) => s.type)).toEqual(["eq", "limiter"]);
    expect(asFake(inspect?.masterInput).connections).not.toContain(
      asFake(inspect?.masterGain),
    );
    expect(asFake(inspect?.masterGain).connections).toContain(
      asFake(inspect?.masterPan),
    );
  });

  it("routes multiple tracks through one Master chain", async () => {
    const played: string[] = [];
    const { host } = createTrackingHost(played);
    const { engine } = engineWith(host);
    engine.setDocument(
      documentOf(
        [track("beat"), track("vocal")],
        [
          clip({
            id: "c-beat",
            trackId: "beat",
            sourceKind: "BEAT_REF",
            sourceBeatId: BEAT_ID,
            durationMs: 10_000,
          }),
          clip({
            id: "c-take-a",
            trackId: "vocal",
            sourceKind: "TAKE",
            sourceTakeId: TAKE_A,
            durationMs: 5000,
          }),
          clip({
            id: "c-take-b",
            trackId: "vocal",
            sourceKind: "TAKE",
            sourceTakeId: TAKE_B,
            durationMs: 5000,
          }),
        ],
        chainOf([effect("eq", ID_EQ), effect("delay", ID_DELAY)]),
      ),
    );
    await engine.play(500);
    expect(engine.getActiveVoiceCount()).toBe(3);
    const master = engine.inspectMasterFx();
    const beat = engine.inspectTrackFx("beat");
    const vocal = engine.inspectTrackFx("vocal");
    expect(master?.insert).toBe("fx");
    expect(asFake(beat?.trackPan).connections).toContain(asFake(master?.masterInput));
    expect(asFake(vocal?.trackPan).connections).toContain(asFake(master?.masterInput));
    expect(asFake(beat?.trackPan).connections).not.toContain(
      asFake(master?.masterGain),
    );
    expect(played).toHaveLength(3);
    engine.dispose();
  });

  it("Take preview stays dry of Master FX (→ Master Gain)", async () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("vocal")],
        [],
        chainOf([effect("reverb", ID_REV), effect("limiter", ID_LIM)]),
      ),
    );
    await engine.previewTake(TAKE_A, "https://cdn.example/preview.wav");
    const master = engine.inspectMasterFx();
    const gain = engine.inspectVoiceClipGain("__studio_preview__");
    expect(master?.insert).toBe("fx");
    expect(asFake(gain).connections).toContain(asFake(master?.masterGain));
    expect(asFake(gain).connections).not.toContain(asFake(master?.masterInput));
    engine.dispose();
  });
});

describe("P6.3 Master bypass / rebuild / params", () => {
  it("enabled=false bypasses without dropping the Master slot", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([
          effect("eq", ID_EQ, { enabled: false }),
          effect("limiter", ID_LIM),
        ]),
      ),
    );
    const inspect = engine.inspectMasterFx();
    expect(inspect?.slots.map((s) => s.mode)).toEqual(["bypass", "process"]);
    expect(inspect?.slots.map((s) => s.type)).toEqual(["eq", "limiter"]);
  });

  it("rebuilds Master on reorder/remove and disconnects previous nodes", () => {
    const { host, created } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([effect("eq", ID_EQ), effect("delay", ID_DELAY)]),
      ),
    );
    const delaysBefore = created.filter((n) => n.kind === "delay");
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([effect("delay", ID_DELAY), effect("eq", ID_EQ)]),
      ),
    );
    expect(engine.inspectMasterFx()?.slots.map((s) => s.type)).toEqual([
      "delay",
      "eq",
    ]);
    expect(
      delaysBefore.every((n) => n.disconnected || n.connections.length === 0),
    ).toBe(true);

    engine.setDocument(documentOf([track("beat")], [], chainOf([])));
    expect(engine.inspectMasterFx()?.insert).toBe("dry");
  });

  it("updates Master params in place without new AudioContext", () => {
    const { host, created, contexts } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([effect("delay", ID_DELAY)]),
      ),
    );
    const delayCount = created.filter((n) => n.kind === "delay").length;
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([
          effect("delay", ID_DELAY, {
            params: { ...defaultStudioFxParams("delay"), timeMs: 400, mix: 0.5 },
          }),
        ]),
      ),
    );
    expect(contexts).toHaveLength(1);
    expect(created.filter((n) => n.kind === "delay").length).toBe(delayCount);
    expect(created.filter((n) => n.kind === "delay").at(-1)?.delayTime.value).toBeCloseTo(
      0.4,
    );
  });
});

describe("P6.3 Master fail-closed + limiter-last validation", () => {
  it("unknown / invalid Master slots skip without crashing", () => {
    const { host } = createTrackingHost();
    const { engine, errors } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        {
          schemaVersion: 1,
          effects: [
            { id: ID_EQ, type: "autotune", enabled: true, params: {} },
            effect("eq", ID_COMP),
            {
              id: ID_DELAY,
              type: "delay",
              enabled: true,
              params: { mix: 9, timeMs: 100, feedback: 0.1 },
            },
          ],
        },
      ),
    );
    const inspect = engine.inspectMasterFx();
    expect(inspect?.slots.map((s) => s.type)).toEqual(["unknown", "eq", "unknown"]);
    expect(errors).toContain("AUDIO_FX_UNKNOWN_TYPE");
    expect(errors).toContain("AUDIO_FX_INVALID_PARAMS");
  });

  it("unsupported Master schema dries to Master Gain", () => {
    const { host } = createTrackingHost();
    const { engine, errors } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([track("beat")], [], { schemaVersion: 9, effects: [] }),
    );
    expect(engine.inspectMasterFx()?.insert).toBe("dry");
    expect(errors).toContain("AUDIO_FX_CHAIN_UNSUPPORTED");
  });

  it("validates limiter-last on Master writes via existing P6.1 validator", () => {
    expect(() =>
      parseStudioFxChainForWrite(
        chainOf([
          effect("eq", ID_EQ),
          effect("compressor", ID_COMP),
          effect("limiter", ID_LIM),
        ]),
        { role: "master" },
      ),
    ).not.toThrow();

    try {
      parseStudioFxChainForWrite(
        chainOf([
          effect("limiter", ID_LIM),
          effect("eq", ID_EQ),
        ]),
        { role: "master" },
      );
      expect.fail("expected FX_CHAIN_INVALID");
    } catch (error) {
      expect(error).toBeInstanceOf(StudioFxChainError);
      expect((error as StudioFxChainError).code).toBe("FX_CHAIN_INVALID");
    }
  });
});

describe("P6.3 transport / Gain-Pan / isolation", () => {
  it("STOP returns playhead 0 with Master FX active", async () => {
    const { host } = createTrackingHost();
    const { engine, playheads } = engineWith(host);
    engine.setDocument(
      documentOf(
        [track("beat")],
        [
          clip({
            id: "c-beat",
            trackId: "beat",
            sourceKind: "BEAT_REF",
            sourceBeatId: BEAT_ID,
          }),
        ],
        chainOf([effect("eq", ID_EQ)]),
      ),
    );
    await engine.play(1200);
    engine.pause();
    engine.stop();
    expect(playheads.at(-1)).toBe(0);
    expect(engine.getLifecycle()).toBe("stopped");
  });

  it("Master Gain/Pan remain downstream of Master FX", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([effect("compressor", ID_COMP), effect("limiter", ID_LIM)]),
      ),
    );
    engine.setDocument(
      documentOf(
        [track("beat")],
        [],
        chainOf([effect("compressor", ID_COMP), effect("limiter", ID_LIM)]),
      ),
    );
    // bump gain/pan
    engine.setDocument({
      ...documentOf(
        [track("beat")],
        [],
        chainOf([effect("compressor", ID_COMP), effect("limiter", ID_LIM)]),
      ),
      masterGainDb: -6,
      masterPan: 0.25,
    });
    const inspect = engine.inspectMasterFx();
    expect(inspect?.insert).toBe("fx");
    expect(asFake(inspect?.masterGain).gain.value).toBeCloseTo(10 ** (-6 / 20));
    expect(asFake(inspect?.masterPan).pan.value).toBeCloseTo(0.25);
    expect(asFake(inspect?.masterGain).connections).toContain(
      asFake(inspect?.masterPan),
    );
  });

  it("does not import PlayerProvider / Mix / second engine; uses Master factory", () => {
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_FX_NODE_FAILED");
    const files = [
      "src/lib/studio/studio-fx-graph.ts",
      "src/lib/studio/studio-audio-engine.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/mix-graph/);
      expect(src).not.toMatch(/MixPanel/);
      expect(src).not.toMatch(/player-provider/);
      expect(src).not.toMatch(/PlayerProvider/);
      expect(src).not.toMatch(/MasterAudioEngine/);
      expect(src).not.toMatch(/getUserMedia/);
    }
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(engineSrc).toMatch(/buildStudioMasterFxChain/);
    expect(engineSrc).toMatch(/syncMasterFx/);
    expect(engineSrc).toMatch(/masterInput/);
    expect(engineSrc.split("class StudioAudioEngine").length).toBe(2);

    const editorSrc = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editorSrc).toMatch(/masterFxChain/);

    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/master-fx/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/updateStudioMasterFxChain/);
  });

  it("documents Master CAS / AuthZ contracts already owned by P6.1", () => {
    const serviceSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(serviceSrc).toMatch(/updateStudioMasterFxChainFor/);
    expect(serviceSrc).toMatch(/studio_cas_apply_fx_chain/);
    expect(serviceSrc).toMatch(/assertOwnsProject/);

    const chainSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-fx-chain.ts"),
      "utf8",
    );
    expect(chainSrc).toMatch(/FX_CHAIN_VERSION_CONFLICT/);
    expect(chainSrc).toMatch(/StudioFxCasConflictError/);

    const apiErr = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-api-error.ts"),
      "utf8",
    );
    expect(apiErr).toMatch(/StudioFxCasConflictError/);
    expect(apiErr).toMatch(/UNAUTHENTICATED/);
  });
});
