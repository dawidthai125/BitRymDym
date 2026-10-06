/**
 * P5.10 StudioAudioEngine — one AudioContext per Studio editor.
 * Mix SSOT is the Web Audio graph (not HTMLAudioElement.volume).
 * Isolated from catalog playback and E3 Mix.
 */

import {
  createStudioClockEpoch,
  isVoiceInSync,
  playheadMsFromContextClock,
  type StudioClockEpoch,
} from "@/lib/studio/studio-audio-clock";
import type { StudioAudioErrorCode } from "@/lib/studio/studio-audio-errors";
import {
  clipGraphGain,
  masterGraphParams,
  planVoicesAtPlayhead,
  trackGraphParams,
  type StudioEngineClip,
  type StudioEngineDocument,
} from "@/lib/studio/studio-audio-schedule";
import type {
  StudioResolvedSource,
  StudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import {
  interpretStudioFxChainForPlayback,
  studioFxPlaybackFingerprint,
} from "@/lib/studio/studio-fx-chain";
import {
  buildStudioMasterFxChain,
  buildStudioTrackFxChain,
  type StudioFxGraphContext,
  type StudioFxSlotInspect,
  type StudioTrackFxHandle,
} from "@/lib/studio/studio-fx-graph";

export type StudioAudioEngineLifecycle =
  | "created"
  | "initialized"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "disposed";

type ParamValue = { value: number };

type Connectable = {
  connect(dest: Connectable): Connectable;
  disconnect(): void;
};

type GainLike = Connectable & { gain: ParamValue };
type PannerLike = Connectable & { pan: ParamValue };

export type StudioMediaElement = {
  src: string;
  currentTime: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  crossOrigin: string | null;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
};

export type StudioAudioContextLike = StudioFxGraphContext & {
  currentTime: number;
  state: string;
  destination: Connectable;
  resume(): Promise<void>;
  close(): Promise<void>;
  createStereoPanner(): PannerLike;
  createMediaElementSource(el: StudioMediaElement): Connectable;
};

export type StudioAudioEngineHost = {
  createContext(): StudioAudioContextLike;
  createMediaElement(): StudioMediaElement;
  nowMs(): number;
  requestTick(cb: () => void): number;
  cancelTick(id: number): void;
};

export type StudioAudioEngineListener = {
  onPlayhead: (playheadMs: number) => void;
  onLifecycle: (lifecycle: StudioAudioEngineLifecycle) => void;
  onError: (params: {
    code: StudioAudioErrorCode;
    sourceKind?: string;
    clipId?: string;
  }) => void;
  onTimelineEnded: () => void;
};

type TrackGraph = {
  input: GainLike;
  gain: GainLike;
  pan: PannerLike;
  fx: StudioTrackFxHandle | null;
  fingerprint: string;
};

type Voice = {
  clipId: string;
  trackId: string;
  role: "timeline" | "preview";
  element: StudioMediaElement;
  mediaSource: Connectable;
  clipGain: GainLike;
  sourceUrl: string;
  disposed: boolean;
};

const PREVIEW_VOICE_ID = "__studio_preview__";

export function createBrowserStudioAudioEngineHost(): StudioAudioEngineHost {
  return {
    createContext() {
      const Ctor =
        typeof window !== "undefined"
          ? window.AudioContext ||
            (
              window as unknown as {
                webkitAudioContext?: typeof AudioContext;
              }
            ).webkitAudioContext
          : undefined;
      if (!Ctor) {
        throw new Error("AUDIO_CONTEXT_UNAVAILABLE");
      }
      return new Ctor() as unknown as StudioAudioContextLike;
    },
    createMediaElement() {
      const el = document.createElement("audio");
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.volume = 1;
      el.muted = false;
      el.className = "hidden";
      return el as unknown as StudioMediaElement;
    },
    nowMs() {
      return Date.now();
    },
    requestTick(cb) {
      return requestAnimationFrame(() => cb());
    },
    cancelTick(id) {
      cancelAnimationFrame(id);
    },
  };
}

export class StudioAudioEngine {
  readonly marker = "StudioAudioEngine";

  private host: StudioAudioEngineHost;
  private registry: StudioSourceAdapterRegistry;
  private listener: StudioAudioEngineListener;
  private ctx: StudioAudioContextLike | null = null;
  /** Sum of track pans — feeds Master FX (or Master Gain when dry). */
  private masterInput: GainLike | null = null;
  private masterFx: StudioTrackFxHandle | null = null;
  private masterFxFingerprint = "";
  private masterGain: GainLike | null = null;
  private masterPan: PannerLike | null = null;
  private tracks = new Map<string, TrackGraph>();
  private voices = new Map<string, Voice>();
  private document: StudioEngineDocument | null = null;
  private lifecycle: StudioAudioEngineLifecycle = "created";
  private epoch: StudioClockEpoch | null = null;
  private tickId: number | null = null;
  private lastSyncCheckMs = 0;
  private failedClips = new Set<string>();

  constructor(params: {
    registry: StudioSourceAdapterRegistry;
    listener: StudioAudioEngineListener;
    host?: StudioAudioEngineHost;
  }) {
    this.registry = params.registry;
    this.listener = params.listener;
    this.host = params.host ?? createBrowserStudioAudioEngineHost();
  }

  getLifecycle(): StudioAudioEngineLifecycle {
    return this.lifecycle;
  }

  getActiveVoiceCount(): number {
    let n = 0;
    for (const voice of this.voices.values()) {
      if (!voice.disposed && !voice.element.paused) n += 1;
    }
    return n;
  }

  /** P6.2 diagnostic — Track insert between summing input and track fader. */
  inspectTrackFx(trackId: string): {
    insert: "dry" | "fx";
    fingerprint: string;
    slots: StudioFxSlotInspect[];
    summingInput: GainLike;
    trackGain: GainLike;
    trackPan: PannerLike;
  } | null {
    const graph = this.tracks.get(trackId);
    if (!graph) return null;
    return {
      insert: graph.fx ? "fx" : "dry",
      fingerprint: graph.fingerprint,
      slots: graph.fx?.inspect() ?? [],
      summingInput: graph.input,
      trackGain: graph.gain,
      trackPan: graph.pan,
    };
  }

  /** P6.3 diagnostic — Master insert between track-sum and Master Gain/Pan. */
  inspectMasterFx(): {
    insert: "dry" | "fx";
    fingerprint: string;
    slots: StudioFxSlotInspect[];
    masterInput: GainLike;
    masterGain: GainLike;
    masterPan: PannerLike;
  } | null {
    if (!this.masterInput || !this.masterGain || !this.masterPan) return null;
    return {
      insert: this.masterFx ? "fx" : "dry",
      fingerprint: this.masterFxFingerprint,
      slots: this.masterFx?.inspect() ?? [],
      masterInput: this.masterInput,
      masterGain: this.masterGain,
      masterPan: this.masterPan,
    };
  }

  inspectVoiceClipGain(clipId: string): GainLike | null {
    return this.voices.get(clipId)?.clipGain ?? null;
  }

  initialize(): boolean {
    if (this.lifecycle === "disposed") return false;
    if (this.ctx) {
      this.setLifecycle("ready");
      return true;
    }
    try {
      this.ctx = this.host.createContext();
      this.masterInput = this.ctx.createGain();
      this.masterGain = this.ctx.createGain();
      this.masterPan = this.ctx.createStereoPanner();
      this.masterInput.connect(this.masterGain);
      this.masterGain.connect(this.masterPan);
      this.masterPan.connect(this.ctx.destination);
      this.setLifecycle("initialized");
      this.setLifecycle("ready");
      return true;
    } catch {
      this.listener.onError({ code: "AUDIO_CONTEXT_UNAVAILABLE" });
      return false;
    }
  }

  setDocument(document: StudioEngineDocument): void {
    this.document = document;
    const clipIds = new Set(document.clips.map((c) => c.id));
    for (const failedId of [...this.failedClips]) {
      if (!clipIds.has(failedId)) this.failedClips.delete(failedId);
    }
    for (const [clipId, voice] of this.voices) {
      if (voice.role === "timeline" && !clipIds.has(clipId)) {
        this.disposeVoice(clipId);
      }
    }
    if (!this.ctx || !this.masterGain) return;
    this.syncGraphParams();
    if (this.lifecycle === "playing" && this.epoch) {
      const playhead = playheadMsFromContextClock({
        epoch: this.epoch,
        contextTime: this.ctx.currentTime,
        timelineLengthMs: document.timelineLengthMs,
      });
      void this.syncVoices(playhead, true);
    }
  }

  async play(playheadMs: number): Promise<void> {
    if (!this.initialize() || !this.ctx) return;
    this.stopPreviewInternal();
    this.failedClips.clear();
    try {
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
    } catch {
      this.listener.onError({ code: "AUDIO_CONTEXT_UNAVAILABLE" });
      return;
    }
    if (this.ctx.state === "suspended") {
      this.listener.onError({ code: "AUDIO_CONTEXT_UNAVAILABLE" });
      return;
    }
    this.epoch = createStudioClockEpoch({
      contextTime: this.ctx.currentTime,
      playheadMs,
    });
    this.setLifecycle("playing");
    this.listener.onPlayhead(playheadMs);
    await this.syncVoices(playheadMs, true);
    this.startClock();
  }

  pause(): void {
    this.stopPreviewInternal();
    this.stopClock();
    this.pauseAllTimelineVoices();
    if (this.lifecycle !== "disposed" && this.lifecycle !== "stopped") {
      this.setLifecycle("paused");
    }
  }

  async seek(playheadMs: number, shouldPlay: boolean): Promise<void> {
    if (!this.initialize() || !this.ctx || !this.document) {
      this.listener.onPlayhead(playheadMs);
      return;
    }
    this.stopPreviewInternal();
    this.failedClips.clear();
    this.epoch = createStudioClockEpoch({
      contextTime: this.ctx.currentTime,
      playheadMs,
    });
    this.listener.onPlayhead(playheadMs);
    await this.syncVoices(playheadMs, shouldPlay);
    if (shouldPlay) {
      this.setLifecycle("playing");
      this.startClock();
    }
  }

  stop(): void {
    this.stopPreviewInternal();
    this.stopClock();
    this.pauseAllTimelineVoices();
    this.epoch = null;
    this.setLifecycle("stopped");
    this.listener.onPlayhead(0);
  }

  async previewTake(_takeId: string, url: string): Promise<void> {
    if (!this.initialize() || !this.ctx || !this.masterGain) {
      this.listener.onError({
        code: "AUDIO_PLAYBACK_FAILED",
        sourceKind: "TAKE",
      });
      throw new Error("AUDIO_PLAYBACK_FAILED");
    }
    this.pauseAllTimelineVoices();
    this.stopClock();
    if (this.lifecycle === "playing") this.setLifecycle("paused");

    this.disposeVoice(PREVIEW_VOICE_ID);
    const element = this.host.createMediaElement();
    element.crossOrigin = "anonymous";
    element.volume = 1;
    element.muted = false;
    element.src = url;
    element.load();
    element.currentTime = 0;

    let mediaSource: Connectable;
    try {
      mediaSource = this.ctx.createMediaElementSource(element);
    } catch {
      this.listener.onError({
        code: "AUDIO_OUTPUT_ERROR",
        sourceKind: "TAKE",
      });
      throw new Error("AUDIO_OUTPUT_ERROR");
    }
    const clipGain = this.ctx.createGain();
    clipGain.gain.value = 1;
    mediaSource.connect(clipGain);
    // P6 freeze: Take preview stays dry of Track FX and Master FX → Master Gain.
    clipGain.connect(this.masterGain);

    this.voices.set(PREVIEW_VOICE_ID, {
      clipId: PREVIEW_VOICE_ID,
      trackId: "",
      role: "preview",
      element,
      mediaSource,
      clipGain,
      sourceUrl: url,
      disposed: false,
    });

    try {
      await element.play();
    } catch {
      this.disposeVoice(PREVIEW_VOICE_ID);
      this.listener.onError({
        code: "AUDIO_PLAYBACK_FAILED",
        sourceKind: "TAKE",
      });
      throw new Error("AUDIO_PLAYBACK_FAILED");
    }
  }

  stopPreview(): void {
    this.stopPreviewInternal();
  }

  dispose(): void {
    this.stopClock();
    for (const id of [...this.voices.keys()]) {
      this.disposeVoice(id);
    }
    this.voices.clear();
    for (const graph of this.tracks.values()) {
      try {
        graph.fx?.dispose();
        graph.input.disconnect();
        graph.gain.disconnect();
        graph.pan.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.tracks.clear();
    try {
      this.masterFx?.dispose();
      this.masterInput?.disconnect();
      this.masterGain?.disconnect();
      this.masterPan?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.masterFx = null;
    this.masterFxFingerprint = "";
    this.masterInput = null;
    this.masterGain = null;
    this.masterPan = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.epoch = null;
    this.document = null;
    this.setLifecycle("disposed");
    void ctx?.close().catch(() => undefined);
  }

  private setLifecycle(next: StudioAudioEngineLifecycle): void {
    this.lifecycle = next;
    this.listener.onLifecycle(next);
  }

  private startClock(): void {
    this.stopClock();
    const tick = () => {
      this.tickId = null;
      if (this.lifecycle !== "playing" || !this.ctx || !this.document || !this.epoch) {
        return;
      }
      const playhead = playheadMsFromContextClock({
        epoch: this.epoch,
        contextTime: this.ctx.currentTime,
        timelineLengthMs: this.document.timelineLengthMs,
      });
      this.listener.onPlayhead(playhead);
      if (playhead >= this.document.timelineLengthMs) {
        this.pauseAllTimelineVoices();
        this.stopClock();
        this.setLifecycle("stopped");
        this.listener.onTimelineEnded();
        return;
      }
      void this.syncVoices(playhead, true);
      this.maybeCheckSync(playhead);
      this.tickId = this.host.requestTick(tick);
    };
    this.tickId = this.host.requestTick(tick);
  }

  private stopClock(): void {
    if (this.tickId != null) {
      this.host.cancelTick(this.tickId);
      this.tickId = null;
    }
  }

  private maybeCheckSync(playheadMs: number): void {
    const now = this.host.nowMs();
    if (now - this.lastSyncCheckMs < 500) return;
    this.lastSyncCheckMs = now;
    if (!this.document) return;
    const plans = planVoicesAtPlayhead(this.document, playheadMs);
    for (const plan of plans) {
      const voice = this.voices.get(plan.clipId);
      if (!voice || voice.element.paused) continue;
      if (
        !isVoiceInSync({
          expectedSourceSeconds: plan.sourceOffsetSeconds,
          actualSourceSeconds: voice.element.currentTime,
        })
      ) {
        this.listener.onError({
          code: "AUDIO_SYNC_FAILED",
          sourceKind: plan.sourceKind,
          clipId: plan.clipId,
        });
      }
    }
  }

  private syncGraphParams(): void {
    if (
      !this.ctx ||
      !this.masterInput ||
      !this.masterGain ||
      !this.masterPan ||
      !this.document
    ) {
      return;
    }
    const master = masterGraphParams(this.document);
    this.masterGain.gain.value = master.gain;
    this.masterPan.pan.value = master.pan;
    this.syncMasterFx(this.document.masterFxChain);

    const anySolo = this.document.tracks.some((t) => t.solo);
    const seen = new Set<string>();
    for (const track of this.document.tracks) {
      seen.add(track.id);
      const graph = this.ensureTrackGraph(track.id);
      const params = trackGraphParams(track, anySolo);
      graph.gain.gain.value = params.gain;
      graph.pan.pan.value = params.pan;
      this.syncTrackFx(track.id, track.effectsChain);
    }
    for (const [id, graph] of this.tracks) {
      if (seen.has(id)) continue;
      try {
        graph.fx?.dispose();
        graph.input.disconnect();
        graph.gain.disconnect();
        graph.pan.disconnect();
      } catch {
        /* ignore */
      }
      this.tracks.delete(id);
    }
  }

  private ensureTrackGraph(trackId: string): TrackGraph {
    const existing = this.tracks.get(trackId);
    if (existing) return existing;
    if (!this.ctx || !this.masterInput) {
      throw new Error("AUDIO_OUTPUT_ERROR");
    }
    const input = this.ctx.createGain();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    input.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterInput);
    const graph: TrackGraph = {
      input,
      gain,
      pan,
      fx: null,
      fingerprint: "",
    };
    this.tracks.set(trackId, graph);
    return graph;
  }

  /**
   * P6.3 — Master FX between Σ track pans (masterInput) and Master Gain/Pan.
   * Preview Take stays connected to masterGain (dry of Master FX).
   */
  private syncMasterFx(rawChain: unknown): void {
    if (!this.ctx || !this.masterInput || !this.masterGain) return;
    const plan = interpretStudioFxChainForPlayback(rawChain);
    const fingerprint = studioFxPlaybackFingerprint(plan);
    if (this.masterFxFingerprint === fingerprint) return;
    if (this.masterFx && this.masterFx.applyPlan(plan)) {
      this.masterFxFingerprint = fingerprint;
      return;
    }
    try {
      this.masterInput.disconnect();
    } catch {
      /* ignore */
    }
    this.masterFx?.dispose();
    this.masterFx = null;
    if (plan.kind === "unsupported") {
      this.listener.onError({ code: "AUDIO_FX_CHAIN_UNSUPPORTED" });
      this.masterInput.connect(this.masterGain);
      this.masterFxFingerprint = fingerprint;
      return;
    }
    if (plan.slots.length === 0) {
      this.masterInput.connect(this.masterGain);
      this.masterFxFingerprint = fingerprint;
      return;
    }
    try {
      const handle = buildStudioMasterFxChain(this.ctx, rawChain, (code) => {
        this.listener.onError({ code });
      });
      if (!handle) {
        this.masterInput.connect(this.masterGain);
        this.masterFxFingerprint = fingerprint;
        return;
      }
      this.masterFx = handle;
      this.masterInput.connect(handle.input);
      handle.output.connect(this.masterGain);
      this.masterFxFingerprint = handle.fingerprint;
    } catch {
      this.listener.onError({ code: "AUDIO_FX_NODE_FAILED" });
      this.masterFx = null;
      this.masterInput.connect(this.masterGain);
      this.masterFxFingerprint = fingerprint;
    }
  }

  private syncTrackFx(trackId: string, rawChain: unknown): void {
    if (!this.ctx) return;
    const graph = this.tracks.get(trackId);
    if (!graph) return;
    const plan = interpretStudioFxChainForPlayback(rawChain);
    const fingerprint = studioFxPlaybackFingerprint(plan);
    if (graph.fingerprint === fingerprint) return;
    if (graph.fx && graph.fx.applyPlan(plan)) {
      graph.fingerprint = fingerprint;
      return;
    }
    try {
      graph.input.disconnect();
    } catch {
      /* ignore */
    }
    graph.fx?.dispose();
    graph.fx = null;
    if (plan.kind === "unsupported") {
      this.listener.onError({ code: "AUDIO_FX_CHAIN_UNSUPPORTED", clipId: trackId });
      graph.input.connect(graph.gain);
      graph.fingerprint = fingerprint;
      return;
    }
    if (plan.slots.length === 0) {
      graph.input.connect(graph.gain);
      graph.fingerprint = fingerprint;
      return;
    }
    try {
      const handle = buildStudioTrackFxChain(this.ctx, rawChain, (code) => {
        this.listener.onError({ code, clipId: trackId });
      });
      if (!handle) {
        graph.input.connect(graph.gain);
        graph.fingerprint = fingerprint;
        return;
      }
      graph.fx = handle;
      graph.input.connect(handle.input);
      handle.output.connect(graph.gain);
      graph.fingerprint = handle.fingerprint;
    } catch {
      this.listener.onError({ code: "AUDIO_FX_NODE_FAILED", clipId: trackId });
      graph.fx = null;
      graph.input.connect(graph.gain);
      graph.fingerprint = fingerprint;
    }
  }

  private async syncVoices(
    playheadMs: number,
    shouldPlay: boolean,
  ): Promise<void> {
    if (!this.document || !this.ctx) return;
    this.syncGraphParams();
    const plans = planVoicesAtPlayhead(this.document, playheadMs);
    const wanted = new Set(plans.map((p) => p.clipId));

    for (const [clipId, voice] of this.voices) {
      if (voice.role !== "timeline") continue;
      if (!wanted.has(clipId)) {
        voice.element.pause();
      }
    }

    for (const plan of plans) {
      if (this.failedClips.has(plan.clipId)) continue;
      const clip = this.document.clips.find((c) => c.id === plan.clipId);
      if (!clip) continue;
      const voice = await this.ensureTimelineVoice(clip);
      if (!voice) continue;
      voice.clipGain.gain.value = clipGraphGain(clip);
      if (Math.abs(voice.element.currentTime - plan.sourceOffsetSeconds) > 0.04) {
        voice.element.currentTime = plan.sourceOffsetSeconds;
      }
      if (!shouldPlay) {
        voice.element.pause();
        continue;
      }
      if (voice.element.paused) {
        try {
          await voice.element.play();
        } catch {
          this.listener.onError({
            code: "AUDIO_PLAYBACK_FAILED",
            sourceKind: plan.sourceKind,
            clipId: plan.clipId,
          });
        }
      }
    }
  }

  private async ensureTimelineVoice(
    clip: StudioEngineClip,
  ): Promise<Voice | null> {
    const existing = this.voices.get(clip.id);
    if (existing && !existing.disposed) return existing;
    if (!this.ctx) return null;

    const adapter = this.registry.get(clip.sourceKind);
    if (!adapter) {
      this.failedClips.add(clip.id);
      this.listener.onError({
        code: "AUDIO_SOURCE_UNAVAILABLE",
        sourceKind: clip.sourceKind,
        clipId: clip.id,
      });
      return null;
    }

    const resolved = await adapter.resolve(clip);
    if (!resolved.ok) {
      this.failedClips.add(clip.id);
      this.listener.onError({
        code: resolved.code,
        sourceKind: clip.sourceKind,
        clipId: clip.id,
      });
      return null;
    }

    try {
      return this.createVoice(clip, resolved.source);
    } catch {
      this.failedClips.add(clip.id);
      this.listener.onError({
        code: "AUDIO_OUTPUT_ERROR",
        sourceKind: clip.sourceKind,
        clipId: clip.id,
      });
      return null;
    }
  }

  private createVoice(
    clip: StudioEngineClip,
    source: StudioResolvedSource,
  ): Voice {
    if (!this.ctx) {
      throw new Error("AUDIO_CONTEXT_UNAVAILABLE");
    }
    const trackGraph = this.ensureTrackGraph(clip.trackId);
    const element = this.host.createMediaElement();
    element.crossOrigin = "anonymous";
    element.volume = 1;
    element.muted = false;
    element.src = source.url;
    element.load();
    const mediaSource = this.ctx.createMediaElementSource(element);
    const clipGain = this.ctx.createGain();
    clipGain.gain.value = clipGraphGain(clip);
    mediaSource.connect(clipGain);
    clipGain.connect(trackGraph.input);
    const voice: Voice = {
      clipId: clip.id,
      trackId: clip.trackId,
      role: "timeline",
      element,
      mediaSource,
      clipGain,
      sourceUrl: source.url,
      disposed: false,
    };
    this.voices.set(clip.id, voice);
    return voice;
  }

  private pauseAllTimelineVoices(): void {
    for (const voice of this.voices.values()) {
      if (voice.role === "timeline") voice.element.pause();
    }
  }

  private stopPreviewInternal(): void {
    this.disposeVoice(PREVIEW_VOICE_ID);
  }

  private disposeVoice(id: string): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.disposed = true;
    try {
      voice.element.pause();
      voice.element.src = "";
      voice.element.load();
    } catch {
      /* ignore */
    }
    try {
      voice.clipGain.disconnect();
      voice.mediaSource.disconnect();
    } catch {
      /* ignore */
    }
    this.voices.delete(id);
  }
}
