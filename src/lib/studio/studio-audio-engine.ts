/**
 * P5.10 StudioAudioEngine — one AudioContext per Studio editor.
 * Mix SSOT is the Web Audio graph (not HTMLAudioElement.volume).
 * Isolated from catalog playback and E3 Mix.
 */

import {
  releaseSessionAudio,
  retainSessionAudio,
} from "@/lib/audio/session-audio-bytes";
import {
  createStudioClockEpoch,
  isVoiceInSync,
  playheadMsFromContextClock,
  type StudioClockEpoch,
} from "@/lib/studio/studio-audio-clock";
import type { StudioAudioErrorCode } from "@/lib/studio/studio-audio-errors";
import {
  masterGraphParams,
  planVoicesAtPlayhead,
  trackAutomationSchedule,
  trackGraphParams,
  type StudioEngineClip,
  type StudioEngineDocument,
  type StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import { automationLane, automationSignature } from "@/lib/studio/studio-automation";
import { MASTER_RENDER_SAMPLE_RATE } from "@/lib/studio/master/client";
import { peekAcousticBank, preloadAcousticBank } from "@/lib/studio/acoustic-load";
import { renderMidiNotes } from "@/lib/studio/studio-midi";
import { isTrackAudible } from "@/lib/studio/studio-track-ops";
import { applyClipFadeGainParam } from "@/lib/studio/studio-clip-fade";
import {
  clampScratchRate,
  persistedReverseCoastSec,
  persistedReverseHeardSec,
  persistedReverseShouldRestart,
  scratchJogOwnsClip,
} from "@/lib/studio/studio-scratch-state";
import type {
  StudioResolvedSource,
  StudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import {
  shouldReuseStudioVoice,
  studioClipSourceIdentity,
} from "@/lib/studio/studio-voice-identity";
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
import {
  STUDIO_METER_FFT_SIZE,
  STUDIO_METER_INTERVAL_MS,
  STUDIO_METER_NEUTRAL,
  buildMeterSnapshot,
  clearClipLatch,
  createClipLatchState,
  createPeakHoldState,
  samplePeakFromTimeDomain,
  updateClipLatch,
  updatePeakHold,
  type StudioClipLatchState,
  type StudioPeakHoldState,
  type StudioTrackLevelSnapshot,
  type StudioMeterSnapshot,
} from "@/lib/studio/studio-meter";
import { compensateStudioTuneLatency, enabledTuneCount } from "@/lib/studio/tune/tune";
import { ensureHarmonyWorklet, isHarmonyWorkletReady } from "@/lib/studio/mix-analysis/harmony-worklet";
import {
  ensurePocketWorklet,
  isPocketWorkletReady,
  pocketBeatTrackIds,
  postPocketPlayhead,
  readPocketSidechain,
} from "@/lib/studio/mix-analysis/pocket-worklet";
import { ensureVoiceWorklet, isVoiceWorkletReady } from "@/lib/studio/mix-analysis/voice-worklet";
import { ensureRiderWorklet, isRiderWorkletReady } from "@/lib/studio/mix-analysis/rider-worklet";
import { ensureTuneWorklet, isTuneWorkletReady } from "@/lib/studio/tune/tune-worklet";
import {
  bakedPlaybackChain,
  clipSourceOriginMs,
  tuneBakeClipKey,
  tuneBakeSpecForChain,
  type TuneBakeSpec,
} from "@/lib/studio/tune/tune-bake";
import { bakeTunedClipInBrowser, type TuneBakeRequest } from "@/lib/studio/tune/tune-bake-client";

export type { StudioMeterSnapshot } from "@/lib/studio/studio-meter";

export type StudioAudioEngineLifecycle =
  | "created"
  | "initialized"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "disposed";

/** Gain AudioParam-like — P6.7.1 may schedule cancel/set/linearRamp when present. */
type ParamValue = {
  value: number;
  cancelScheduledValues?: (when: number) => void;
  setValueAtTime?: (value: number, when: number) => void;
  linearRampToValueAtTime?: (value: number, when: number) => void;
};

type Connectable = {
  connect(dest: Connectable): Connectable;
  disconnect(dest?: Connectable): void;
};

type GainLike = Connectable & { gain: ParamValue };
type PannerLike = Connectable & { pan: ParamValue };

export type StudioAudioBufferLike = {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
};

export type StudioBufferSourceLike = Connectable & {
  buffer: StudioAudioBufferLike | null;
  playbackRate: ParamValue;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
};

/** P6.5 — Master meter tap (serial after Master Pan). */
export type AnalyserLike = Connectable & {
  fftSize: number;
  smoothingTimeConstant: number;
  frequencyBinCount: number;
  getFloatTimeDomainData(array: Float32Array): void;
};

export type StudioMediaElement = {
  src: string;
  currentTime: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  crossOrigin: string | null;
  preload: string;
  /** Linked Scratch rate. Optional so legacy test hosts keep compiling. */
  playbackRate?: number;
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
  createAnalyser(): AnalyserLike;
  createMediaElementSource(el: StudioMediaElement): Connectable;
  createBufferSource?(): StudioBufferSourceLike;
  createMediaStreamSource?(stream: MediaStream): Connectable;
  createBuffer?(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): StudioAudioBufferLike;
  decodeAudioData?(data: ArrayBuffer): Promise<StudioAudioBufferLike>;
  /** Chromium — optional AudioContext output routing (AUD-01). */
  setSinkId?(sinkId: string): Promise<void>;
  sinkId?: string;
  /** Present on a real AudioContext. MIDI PCM is rendered at this rate. */
  sampleRate?: number;
};

export type StudioAudioEngineHost = {
  createContext(): StudioAudioContextLike;
  createMediaElement(): StudioMediaElement;
  nowMs(): number;
  requestTick(cb: () => void): number;
  cancelTick(id: number): void;
  /** Decode a voice URL for BufferSource reverse. Tests inject a fixture. */
  decodeSource?(url: string): Promise<StudioAudioBufferLike | null>;
  /**
   * BRD Tune (Gold) live notes: bake one clip source (prefix FX + anchored
   * TuneCore) → playable URL. Absent → manual notes stay render-only.
   */
  bakeTune?(req: TuneBakeRequest, signal: AbortSignal): Promise<string | null>;
  revokeUrl?(url: string): void;
};

/** Bake rate is fixed so a context (re)creation never invalidates the cache. */
export const TUNE_BAKE_SAMPLE_RATE = 48000;
/** Edits in quick succession → only the last chain is baked. */
export const TUNE_BAKE_DEBOUNCE_MS = 150;
/** Unused baked clips kept for instant undo/redo. */
const TUNE_BAKE_KEEP_UNUSED = 4;

type TuneBakeEntry = {
  status: "pending" | "ready" | "failed";
  url: string | null;
  identity: string;
  abort: AbortController;
  usedAt: number;
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
  /** Tracks whose manual-note tuning is being (re)computed for live playback. */
  onTuneBake?: (pendingTrackIds: readonly string[]) => void;
};

type TrackGraph = {
  input: GainLike;
  gain: GainLike;
  pan: PannerLike;
  /** Broadband beat trim. Sits before pan so the track meter can keep pan's outputs. */
  pocketDuck: GainLike | null;
  fx: StudioTrackFxHandle | null;
  fingerprint: string;
  /** Gain / pan automation last scheduled: its signature, audibility and the clock epoch it was planned for. */
  autoSig?: string;
  autoEpoch?: unknown;
};

type Voice = {
  clipId: string;
  trackId: string;
  role: "timeline" | "preview";
  element: StudioMediaElement;
  mediaSource: Connectable;
  clipGain: GainLike;
  sourceUrl: string;
  /** WAVE 1.1 — beat|asset or take:id; used to detect master replacement. */
  identityKey: string | null;
  disposed: boolean;
  decodedBuffer: StudioAudioBufferLike | null;
  reversedBuffer: StudioAudioBufferLike | null;
  bufferSource: StudioBufferSourceLike | null;
  scratchReverse: boolean;
  /** Where a persisted reverse buffer started, so a normal tick does not restart it. */
  reverseAnchor: { heardSec: number; contextTime: number; rate: number } | null;
  reverseLoad: boolean;
  reverseToken: number;
};

const PREVIEW_VOICE_ID = "__studio_preview__";

export function reverseStudioAudioBuffer(
  ctx: StudioAudioContextLike | null,
  buffer: StudioAudioBufferLike,
): StudioAudioBufferLike {
  if (ctx?.createBuffer) {
    const reversed = ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const src = buffer.getChannelData(channel);
      const dest = reversed.getChannelData(channel);
      const last = src.length - 1;
      for (let i = 0; i <= last; i += 1) {
        dest[i] = src[last - i] ?? 0;
      }
    }
    return {
      numberOfChannels: reversed.numberOfChannels,
      length: reversed.length,
      sampleRate: reversed.sampleRate,
      duration: buffer.duration,
      getChannelData(channel: number) {
        return reversed.getChannelData(channel);
      },
    };
  }
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const src = buffer.getChannelData(channel);
    const dest = new Float32Array(src.length);
    const last = src.length - 1;
    for (let i = 0; i <= last; i += 1) {
      dest[i] = src[last - i] ?? 0;
    }
    channels.push(dest);
  }
  return {
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
    getChannelData(channel: number) {
      return channels[channel] ?? new Float32Array(buffer.length);
    },
  };
}

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
      // Smallest stable buffer the browser will give. Older webkit builds reject the option.
      try {
        return new Ctor({ latencyHint: "interactive" }) as unknown as StudioAudioContextLike;
      } catch {
        return new Ctor() as unknown as StudioAudioContextLike;
      }
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
    bakeTune: bakeTunedClipInBrowser,
    revokeUrl(url) {
      URL.revokeObjectURL(url);
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
  /** P6.5 — single Master analyser; created once per engine lifecycle. */
  private masterAnalyser: AnalyserLike | null = null;
  private meterTimeDomain: Float32Array | null = null;
  private meterTickId: number | null = null;
  private meterLastEmitMs = 0;
  private meterActive = false;
  private meterVisibilityPaused = false;
  private clipLatch: StudioClipLatchState = createClipLatchState();
  private lastMeterSnapshot: StudioMeterSnapshot = STUDIO_METER_NEUTRAL;
  private meterListeners = new Set<(snapshot: StudioMeterSnapshot) => void>();
  /** P6.6.1 — at most one Track analyser (selected track only). */
  private trackMeterTargetId: string | null = null;
  /** Actively wired in graph (pan → analyser → Σ). */
  private trackAnalyser: AnalyserLike | null = null;
  /** Disconnected pool — reuse across A→B so we never allocate N analysers. */
  private idleTrackAnalyser: AnalyserLike | null = null;
  private trackClipLatch: StudioClipLatchState = createClipLatchState();
  private lastTrackMeterSnapshot: StudioMeterSnapshot = STUDIO_METER_NEUTRAL;
  private trackMeterListeners = new Set<
    (snapshot: StudioMeterSnapshot) => void
  >();
  /** Stage 0 — per-track level taps (side-chain off post-pan, never inline). */
  private trackLevelsEnabled = false;
  private trackLevelTaps = new Map<
    string,
    {
      analyser: AnalyserLike;
      latch: StudioClipLatchState;
      hold: StudioPeakHoldState;
    }
  >();
  private trackLevelListeners = new Set<
    (levels: ReadonlyMap<string, StudioTrackLevelSnapshot>) => void
  >();
  private lastTrackLevels: ReadonlyMap<string, StudioTrackLevelSnapshot> =
    new Map();
  private tracks = new Map<string, TrackGraph>();
  private voices = new Map<string, Voice>();
  /** One BufferSource per track with notes, into that track's strip (gain / pan / mute). */
  private midiSources: StudioBufferSourceLike[] = [];
  private midiSig = "";
  private document: StudioEngineDocument | null = null;
  /** Document as given (before BRD Tune latency compensation). */
  private rawDocument: StudioEngineDocument | null = null;
  private lifecycle: StudioAudioEngineLifecycle = "created";
  private epoch: StudioClockEpoch | null = null;
  private tickId: number | null = null;
  /** Smoothed broadband trim for BEAT_REF tracks. 1 = no duck. */
  private pocketDuckLevel = 1;
  private lastSyncCheckMs = 0;
  private failedClips = new Set<string>();
  /** BRD Tune live bakes: clip bake key → entry. */
  private tuneBakes = new Map<string, TuneBakeEntry>();
  /** trackId → clipId → ready bake key currently played for that clip. */
  private tuneBakeAssign = new Map<string, Map<string, string>>();
  private tuneBakeQueue: Promise<void> = Promise.resolve();
  private tuneBakePendingSig = "";
  /** AUD-01 — preferred AudioContext sink ("" = system default). */
  private preferredSinkId: string | null = null;
  private scratchLive: {
    clipId: string | null;
    rate: number;
    reverse: boolean;
  } = { clipId: null, rate: 1, reverse: false };

  constructor(params: {
    registry: StudioSourceAdapterRegistry;
    listener: StudioAudioEngineListener;
    host?: StudioAudioEngineHost;
  }) {
    this.registry = params.registry;
    this.listener = params.listener;
    this.host = params.host ?? createBrowserStudioAudioEngineHost();
    if (typeof window !== "undefined") {
      void preloadAcousticBank().then(() => {
        this.midiSig = "";
      });
    }
  }

  /**
   * AUD-01 — route timeline output via AudioContext.setSinkId when supported.
   * null / "" = system default. No-op (resolves) when setSinkId is unavailable.
   */
  async setOutputSinkId(sinkId: string | null): Promise<{
    applied: boolean;
    reason?: "unsupported" | "no_context" | "disposed" | "error";
  }> {
    if (this.lifecycle === "disposed") {
      return { applied: false, reason: "disposed" };
    }
    const next =
      sinkId && sinkId.trim() !== "" ? sinkId.trim() : null;
    this.preferredSinkId = next;
    if (!this.ctx) {
      if (!this.initialize()) {
        return { applied: false, reason: "no_context" };
      }
    }
    return this.applyPreferredSinkId();
  }

  getLifecycle(): StudioAudioEngineLifecycle {
    return this.lifecycle;
  }

  /** Same Studio AudioContext for metronome click + dry input monitor. */
  getContextForAux(): StudioAudioContextLike | null {
    if (this.lifecycle === "disposed") return null;
    if (!this.ctx) this.initialize();
    return this.ctx;
  }

  getActiveVoiceCount(): number {
    let n = 0;
    for (const voice of this.voices.values()) {
      if (voice.disposed) continue;
      if (voice.bufferSource || !voice.element.paused) n += 1;
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

  /** P6.5 diagnostic — Master Pan → Analyser → Destination series tap. */
  inspectMasterMeter(): {
    analyser: AnalyserLike;
    masterPan: PannerLike;
    destination: Connectable;
    fftSize: number;
  } | null {
    if (!this.ctx || !this.masterPan || !this.masterAnalyser) return null;
    return {
      analyser: this.masterAnalyser,
      masterPan: this.masterPan,
      destination: this.ctx.destination,
      fftSize: this.masterAnalyser.fftSize,
    };
  }

  getMeterSnapshot(): StudioMeterSnapshot {
    return this.lastMeterSnapshot;
  }

  /** Subscribe to throttled Master meter snapshots (≤12 Hz). */
  subscribeMeter(listener: (snapshot: StudioMeterSnapshot) => void): () => void {
    this.meterListeners.add(listener);
    listener(this.lastMeterSnapshot);
    return () => {
      this.meterListeners.delete(listener);
    };
  }

  /**
   * Visibility pause — stops reader without disposing analyser / AudioContext.
   * Resume only resumes when play metering is active.
   * P6.6.1: same pause/resume gates Master + selected Track snapshots.
   */
  setMeterDocumentHidden(hidden: boolean): void {
    this.meterVisibilityPaused = hidden;
    if (hidden) {
      this.stopMeterReader();
      return;
    }
    this.ensureMeterReader();
  }

  /**
   * P6.6.1 — select which Track (if any) receives the single on-demand analyser.
   * Runtime-only; never persisted. Max one Track analyser at a time.
   */
  setTrackMeterTarget(trackId: string | null): void {
    if (this.lifecycle === "disposed") return;
    const next = trackId && trackId.length > 0 ? trackId : null;
    if (next === this.trackMeterTargetId) {
      if (next) this.ensureTrackMeterAttached();
      return;
    }
    this.detachTrackMeter({ emitNeutral: true });
    this.trackMeterTargetId = next;
    if (!next) return;
    if (!this.ctx) {
      if (!this.initialize()) {
        this.trackMeterTargetId = null;
        return;
      }
    }
    this.ensureTrackMeterAttached();
    if (this.meterActive && !this.meterVisibilityPaused) {
      this.ensureMeterReader();
    }
  }

  getTrackMeterTargetId(): string | null {
    return this.trackMeterTargetId;
  }

  getTrackMeterSnapshot(): StudioMeterSnapshot {
    return this.lastTrackMeterSnapshot;
  }

  /** Subscribe to throttled selected-Track meter snapshots (≤12 Hz). */
  subscribeTrackMeter(
    listener: (snapshot: StudioMeterSnapshot) => void,
  ): () => void {
    this.trackMeterListeners.add(listener);
    listener(this.lastTrackMeterSnapshot);
    return () => {
      this.trackMeterListeners.delete(listener);
    };
  }

  /**
   * Stage 0 — enable/disable per-track meters (one analyser per track, tapped
   * in parallel off pan; shares the master meter tick). Disabled = 0 taps.
   */
  setTrackLevelsEnabled(enabled: boolean): void {
    if (this.lifecycle === "disposed") return;
    if (enabled === this.trackLevelsEnabled) return;
    this.trackLevelsEnabled = enabled;
    if (enabled) {
      this.syncTrackLevelTaps();
      if (this.meterActive && !this.meterVisibilityPaused) this.ensureMeterReader();
    } else {
      this.disposeTrackLevelTaps();
      this.emitTrackLevels(new Map());
    }
  }

  subscribeTrackLevels(
    listener: (levels: ReadonlyMap<string, StudioTrackLevelSnapshot>) => void,
  ): () => void {
    this.trackLevelListeners.add(listener);
    listener(this.lastTrackLevels);
    return () => {
      this.trackLevelListeners.delete(listener);
    };
  }

  /** Diagnostic for tests. */
  getTrackLevelTapCount(): number {
    return this.trackLevelTaps.size;
  }

  private emitTrackLevels(
    levels: ReadonlyMap<string, StudioTrackLevelSnapshot>,
  ): void {
    this.lastTrackLevels = levels;
    for (const listener of this.trackLevelListeners) listener(levels);
  }

  /** (Re)connect taps; Web Audio connect() of an existing pair is a no-op. */
  private syncTrackLevelTaps(): void {
    if (!this.trackLevelsEnabled || !this.ctx) return;
    for (const [trackId, graph] of this.tracks) {
      let tap = this.trackLevelTaps.get(trackId);
      if (!tap) {
        try {
          const analyser = this.ctx.createAnalyser();
          analyser.fftSize = STUDIO_METER_FFT_SIZE;
          analyser.smoothingTimeConstant = 0;
          tap = {
            analyser,
            latch: createClipLatchState(),
            hold: createPeakHoldState(),
          };
          this.trackLevelTaps.set(trackId, tap);
        } catch {
          continue;
        }
      }
      try {
        graph.pan.connect(tap.analyser);
      } catch {
        /* ignore — metering must never break playback */
      }
    }
    for (const [trackId, tap] of this.trackLevelTaps) {
      if (this.tracks.has(trackId)) continue;
      try {
        tap.analyser.disconnect();
      } catch {
        /* ignore */
      }
      this.trackLevelTaps.delete(trackId);
    }
  }

  private disposeTrackLevelTaps(): void {
    for (const [trackId, tap] of this.trackLevelTaps) {
      const graph = this.tracks.get(trackId);
      try {
        if (graph) graph.pan.disconnect(tap.analyser);
      } catch {
        /* ignore */
      }
      try {
        tap.analyser.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.trackLevelTaps.clear();
  }

  private readTrackLevels(now: number, buffer: Float32Array): void {
    if (!this.trackLevelsEnabled || this.trackLevelTaps.size === 0) return;
    const levels = new Map<string, StudioTrackLevelSnapshot>();
    for (const [trackId, tap] of this.trackLevelTaps) {
      tap.analyser.getFloatTimeDomainData(buffer);
      const peak = samplePeakFromTimeDomain(buffer);
      const clipping = updateClipLatch(tap.latch, peak, now);
      const hold = updatePeakHold(tap.hold, peak, now);
      levels.set(trackId, {
        ...buildMeterSnapshot({ peak, clipping, timestamp: now }),
        hold,
      });
    }
    this.emitTrackLevels(levels);
  }

  private resetTrackLevels(): void {
    if (this.trackLevelTaps.size === 0 && this.lastTrackLevels.size === 0) return;
    for (const tap of this.trackLevelTaps.values()) {
      clearClipLatch(tap.latch);
      tap.hold.value = 0;
      tap.hold.untilMs = 0;
    }
    this.emitTrackLevels(new Map());
  }

  /** P6.6.1 diagnostic — Track Pan → (0|1 Analyser) → Σ. */
  inspectTrackMeter(): {
    trackId: string | null;
    analyser: AnalyserLike | null;
    trackPan: PannerLike | null;
    masterInput: GainLike | null;
    trackAnalyserCount: 0 | 1;
    fftSize: number | null;
  } {
    const graph = this.trackMeterTargetId
      ? this.tracks.get(this.trackMeterTargetId)
      : null;
    return {
      trackId: this.trackMeterTargetId,
      analyser: this.trackAnalyser,
      trackPan: graph?.pan ?? null,
      masterInput: this.masterInput,
      trackAnalyserCount: this.trackAnalyser ? 1 : 0,
      fftSize: this.trackAnalyser?.fftSize ?? null,
    };
  }

  inspectVoiceClipGain(clipId: string): GainLike | null {
    return this.voices.get(clipId)?.clipGain ?? null;
  }

  private async applyPreferredSinkId(): Promise<{
    applied: boolean;
    reason?: "unsupported" | "no_context" | "disposed" | "error";
  }> {
    if (this.lifecycle === "disposed") {
      return { applied: false, reason: "disposed" };
    }
    const ctx = this.ctx;
    if (!ctx) return { applied: false, reason: "no_context" };
    if (typeof ctx.setSinkId !== "function") {
      return { applied: false, reason: "unsupported" };
    }
    try {
      await ctx.setSinkId(this.preferredSinkId ?? "");
      return { applied: true };
    } catch {
      return { applied: false, reason: "error" };
    }
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
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = STUDIO_METER_FFT_SIZE;
      this.masterAnalyser.smoothingTimeConstant = 0;
      this.meterTimeDomain = new Float32Array(this.masterAnalyser.fftSize);
      this.masterInput.connect(this.masterGain);
      this.masterGain.connect(this.masterPan);
      // P6.5: MasterPan → Analyser → Destination (series; no parallel path)
      this.masterPan.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);
      this.setLifecycle("initialized");
      this.setLifecycle("ready");
      if (this.rawDocument) {
        this.withTuneCompensation(this.rawDocument);
        this.ensurePreviewWorklets(this.rawDocument);
      }
      if (this.preferredSinkId != null) {
        void this.applyPreferredSinkId();
      }
      return true;
    } catch {
      this.listener.onError({ code: "AUDIO_CONTEXT_UNAVAILABLE" });
      return false;
    }
  }

  /**
   * Scratch DJ v1 live rate + reverse on existing timeline voices.
   * Reverse uses BufferSource in this same AudioContext — no second engine.
   */
  applyScratchLive(params: {
    clipId?: string | null;
    rate: number;
    reverse?: boolean;
  }): boolean {
    this.scratchLive = {
      clipId: params.clipId ?? null,
      rate: params.rate,
      reverse: Boolean(params.reverse),
    };
    let applied = false;
    for (const voice of this.voices.values()) {
      if (voice.role !== "timeline" || voice.disposed) continue;
      if (params.clipId && voice.clipId !== params.clipId) continue;
      if (this.applyScratchToVoice(voice)) applied = true;
    }
    return applied;
  }

  releaseScratchLive(): void {
    this.applyScratchLive({
      clipId: this.scratchLive.clipId,
      rate: 1,
      reverse: false,
    });
  }

  private applyScratchToVoice(voice: Voice): boolean {
    const rate = this.scratchLive.rate;
    const reverse = this.scratchLive.reverse;
    if (!reverse) {
      this.stopBufferSource(voice);
      if (typeof voice.element.playbackRate === "number") {
        voice.element.playbackRate = rate;
      }
      voice.scratchReverse = false;
      return typeof voice.element.playbackRate === "number";
    }
    if (!this.ctx?.createBufferSource) return false;
    if (voice.decodedBuffer) {
      return this.startReversedBufferSource(voice, rate);
    }
    void this.ensureDecodedBuffer(voice).then((ok) => {
      if (!ok || voice.disposed) return;
      if (!this.scratchLive.reverse) return;
      if (this.scratchLive.clipId && this.scratchLive.clipId !== voice.clipId) {
        return;
      }
      this.startReversedBufferSource(voice, this.scratchLive.rate);
    });
    return true;
  }

  private async ensureDecodedBuffer(voice: Voice): Promise<boolean> {
    if (voice.decodedBuffer) return true;
    try {
      const buffer = this.host.decodeSource
        ? await this.host.decodeSource(voice.sourceUrl)
        : await this.decodeSourceOnContext(voice.sourceUrl);
      if (!buffer || voice.disposed) return false;
      voice.decodedBuffer = buffer;
      voice.reversedBuffer = reverseStudioAudioBuffer(this.ctx, buffer);
      return true;
    } catch {
      return false;
    }
  }

  private async decodeSourceOnContext(
    url: string,
  ): Promise<StudioAudioBufferLike | null> {
    if (!this.ctx?.decodeAudioData) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    return this.ctx.decodeAudioData(await response.arrayBuffer());
  }

  private startReversedBufferSource(voice: Voice, rate: number, heardSec?: number): boolean {
    if (!this.ctx?.createBufferSource) return false;
    const buffer = voice.reversedBuffer ?? voice.decodedBuffer;
    if (!buffer) return false;
    this.stopBufferSource(voice);
    try {
      voice.element.pause();
    } catch {
      /* ignore */
    }
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(voice.clipGain);
      const duration = buffer.duration || 0;
      const heard = heardSec ?? Math.max(0, voice.element.currentTime);
      const offset = Math.max(0, Math.min(duration, duration - Math.max(0, heard)));
      source.start(0, offset);
      source.onended = () => {
        if (voice.bufferSource === source) voice.bufferSource = null;
      };
      voice.bufferSource = source;
      voice.scratchReverse = true;
      if (heardSec != null) {
        voice.reverseAnchor = { heardSec, contextTime: this.ctx.currentTime, rate };
      }
      return true;
    } catch {
      return false;
    }
  }

  private stopBufferSource(voice: Voice): void {
    const source = voice.bufferSource;
    voice.bufferSource = null;
    voice.scratchReverse = false;
    voice.reverseAnchor = null;
    if (!source) return;
    try {
      source.onended = null;
      source.stop();
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  setDocument(rawDocument: StudioEngineDocument): void {
    this.rawDocument = rawDocument;
    this.ensurePreviewWorklets(rawDocument);
    const document = this.withTuneCompensation(this.withTuneBakes(rawDocument));
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
    if (
      this.trackMeterTargetId &&
      !document.tracks.some((t) => t.id === this.trackMeterTargetId)
    ) {
      this.detachTrackMeter({ emitNeutral: true });
      this.trackMeterTargetId = null;
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

  /**
   * Gaps P1 #5: a take's playable source changed (cleaned ↔ original). Drop its timeline
   * voices so the next sync re-resolves + re-decodes; re-sync now when playing.
   */
  invalidateTakeSource(takeId: string): void {
    const document = this.document;
    if (!document || !takeId) return;
    const stale: string[] = [];
    for (const [key, entry] of this.tuneBakes) {
      if (entry.identity !== `take:${takeId}`) continue;
      entry.abort.abort();
      if (entry.url) stale.push(entry.url);
      this.tuneBakes.delete(key);
    }
    if (stale.length && this.rawDocument) {
      this.setDocument(this.rawDocument);
      for (const url of stale) this.host.revokeUrl?.(url);
    }
    let dropped = false;
    for (const clip of document.clips) {
      if (clip.sourceTakeId === takeId && this.voices.has(clip.id)) {
        this.disposeVoice(clip.id);
        dropped = true;
      }
    }
    if (!dropped || !this.ctx || this.lifecycle !== "playing" || !this.epoch) return;
    const playhead = playheadMsFromContextClock({
      epoch: this.epoch,
      contextTime: this.ctx.currentTime,
      timelineLengthMs: document.timelineLengthMs,
    });
    void this.syncVoices(playhead, true);
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
    // Start meter reader immediately on Play (≤12 Hz), before async voice sync.
    this.startMetering();
    await this.syncVoices(playheadMs, true);
    postPocketPlayhead(playheadMs);
    this.applyPocketBeatDuck();
    this.startClock();
  }

  pause(): void {
    this.stopPreviewInternal();
    let playheadMs = 0;
    if (this.ctx && this.epoch && this.document) {
      playheadMs = playheadMsFromContextClock({
        epoch: this.epoch,
        contextTime: this.ctx.currentTime,
        timelineLengthMs: this.document.timelineLengthMs,
      });
    }
    this.stopClock();
    postPocketPlayhead(playheadMs);
    this.pauseAllTimelineVoices();
    // Hold fade envelope at current position — cancel forward ramps (P6.7.1).
    this.applyTimelineClipFades(playheadMs, false);
    this.stopMetering({ reset: false });
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
    if (shouldPlay) {
      this.setLifecycle("playing");
      this.startMetering();
    } else {
      this.stopMetering({ reset: false });
    }
    await this.syncVoices(playheadMs, shouldPlay);
    postPocketPlayhead(playheadMs);
    this.applyPocketBeatDuck();
    if (shouldPlay) {
      this.startClock();
    }
  }

  stop(): void {
    this.stopPreviewInternal();
    this.stopClock();
    this.pauseAllTimelineVoices();
    // Neutral fade hold at playhead 0 (existing STOP → playhead 0).
    this.applyTimelineClipFades(0, false);
    this.stopMetering({ reset: true });
    this.epoch = null;
    this.setLifecycle("stopped");
    postPocketPlayhead(0);
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
    this.stopMetering({ reset: false });
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
      identityKey: null,
      disposed: false,
      decodedBuffer: null,
      reversedBuffer: null,
      bufferSource: null,
      scratchReverse: false,
      reverseAnchor: null,
      reverseLoad: false,
      reverseToken: 0,
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
    this.haltMidiSources();
    for (const entry of this.tuneBakes.values()) {
      entry.abort.abort();
      if (entry.url) this.host.revokeUrl?.(entry.url);
    }
    this.tuneBakes.clear();
    this.tuneBakeAssign.clear();
    this.stopClock();
    this.stopMetering({ reset: true });
    this.meterListeners.clear();
    this.trackMeterListeners.clear();
    this.disposeTrackLevelTaps();
    this.trackLevelListeners.clear();
    this.trackLevelsEnabled = false;
    this.detachTrackMeter({ emitNeutral: false });
    this.trackMeterTargetId = null;
    try {
      this.idleTrackAnalyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.idleTrackAnalyser = null;
    this.lastTrackMeterSnapshot = STUDIO_METER_NEUTRAL;
    for (const id of [...this.voices.keys()]) {
      this.disposeVoice(id);
    }
    this.voices.clear();
    for (const graph of this.tracks.values()) {
      try {
        graph.fx?.dispose();
        graph.input.disconnect();
        graph.gain.disconnect();
        graph.pocketDuck?.disconnect();
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
      this.masterAnalyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.masterFx = null;
    this.masterFxFingerprint = "";
    this.masterInput = null;
    this.masterGain = null;
    this.masterPan = null;
    this.masterAnalyser = null;
    this.meterTimeDomain = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.epoch = null;
    this.document = null;
    this.rawDocument = null;
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
      postPocketPlayhead(playhead);
      this.applyPocketBeatDuck();
      this.listener.onPlayhead(playhead);
      if (playhead >= this.document.timelineLengthMs) {
        this.pauseAllTimelineVoices();
        this.stopClock();
        this.stopMetering({ reset: true });
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

  private startMetering(): void {
    this.meterActive = true;
    this.ensureMeterReader();
  }

  private stopMetering(opts: { reset: boolean }): void {
    this.meterActive = false;
    this.stopMeterReader();
    if (opts.reset) {
      clearClipLatch(this.clipLatch);
      this.emitMeterSnapshot(
        buildMeterSnapshot({
          peak: 0,
          clipping: false,
          timestamp: this.host.nowMs(),
        }),
      );
      clearClipLatch(this.trackClipLatch);
      this.emitTrackMeterSnapshot(
        buildMeterSnapshot({
          peak: 0,
          clipping: false,
          timestamp: this.host.nowMs(),
        }),
      );
      this.resetTrackLevels();
    }
  }

  private ensureMeterReader(): void {
    if (!this.meterActive || this.meterVisibilityPaused) return;
    if (this.meterTickId != null) return;
    if (!this.masterAnalyser || !this.meterTimeDomain) return;

    const tick = () => {
      this.meterTickId = null;
      if (
        !this.meterActive ||
        this.meterVisibilityPaused ||
        !this.masterAnalyser ||
        !this.meterTimeDomain
      ) {
        return;
      }
      const now = this.host.nowMs();
      if (now - this.meterLastEmitMs >= STUDIO_METER_INTERVAL_MS) {
        this.meterLastEmitMs = now;
        this.masterAnalyser.getFloatTimeDomainData(this.meterTimeDomain);
        const peak = samplePeakFromTimeDomain(this.meterTimeDomain);
        const clipping = updateClipLatch(this.clipLatch, peak, now);
        this.emitMeterSnapshot(
          buildMeterSnapshot({ peak, clipping, timestamp: now }),
        );
        // P6.6.1 — same shared reader tick samples optional Track analyser.
        if (this.trackAnalyser) {
          this.trackAnalyser.getFloatTimeDomainData(this.meterTimeDomain);
          const trackPeak = samplePeakFromTimeDomain(this.meterTimeDomain);
          const trackClipping = updateClipLatch(
            this.trackClipLatch,
            trackPeak,
            now,
          );
          this.emitTrackMeterSnapshot(
            buildMeterSnapshot({
              peak: trackPeak,
              clipping: trackClipping,
              timestamp: now,
            }),
          );
        }
        // Stage 0 — per-track levels on the same shared tick.
        this.readTrackLevels(now, this.meterTimeDomain);
      }
      this.meterTickId = this.host.requestTick(tick);
    };
    this.meterTickId = this.host.requestTick(tick);
  }

  private stopMeterReader(): void {
    if (this.meterTickId != null) {
      this.host.cancelTick(this.meterTickId);
      this.meterTickId = null;
    }
  }

  private emitMeterSnapshot(snapshot: StudioMeterSnapshot): void {
    this.lastMeterSnapshot = snapshot;
    for (const listener of this.meterListeners) {
      listener(snapshot);
    }
  }

  private emitTrackMeterSnapshot(snapshot: StudioMeterSnapshot): void {
    this.lastTrackMeterSnapshot = snapshot;
    for (const listener of this.trackMeterListeners) {
      listener(snapshot);
    }
  }

  /**
   * P6.6.1 — wire pan → Track Analyser → Σ for the selected track.
   * Isolated: createAnalyser failure restores dry pan→Σ and does not throw.
   */
  private ensureTrackMeterAttached(): void {
    if (this.lifecycle === "disposed") return;
    const trackId = this.trackMeterTargetId;
    if (!trackId || !this.ctx || !this.masterInput) return;
    if (
      this.document &&
      !this.document.tracks.some((t) => t.id === trackId)
    ) {
      this.detachTrackMeter({ emitNeutral: true });
      this.trackMeterTargetId = null;
      return;
    }

    let graph: TrackGraph;
    try {
      graph = this.ensureTrackGraph(trackId);
    } catch {
      this.detachTrackMeter({ emitNeutral: true });
      this.trackMeterTargetId = null;
      return;
    }

    if (!this.trackAnalyser) {
      let analyser = this.idleTrackAnalyser;
      if (!analyser) {
        try {
          analyser = this.ctx.createAnalyser();
          analyser.fftSize = STUDIO_METER_FFT_SIZE;
          analyser.smoothingTimeConstant = 0;
        } catch {
          // Isolate Track metering failure — Master graph stays intact.
          try {
            graph.pan.disconnect();
          } catch {
            /* ignore */
          }
          try {
            graph.pan.connect(this.masterInput);
          } catch {
            /* ignore */
          }
          return;
        }
      }
      this.idleTrackAnalyser = null;
      this.trackAnalyser = analyser;
    }

    this.wireTrackMeter(graph);
    this.syncTrackLevelTaps();
  }

  private wireTrackMeter(graph: TrackGraph): void {
    if (!this.trackAnalyser || !this.masterInput) return;
    try {
      graph.pan.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.trackAnalyser.disconnect();
    } catch {
      /* ignore */
    }
    try {
      graph.pan.connect(this.trackAnalyser);
      this.trackAnalyser.connect(this.masterInput);
    } catch {
      // Restore dry path if wiring fails mid-way.
      try {
        graph.pan.disconnect();
      } catch {
        /* ignore */
      }
      try {
        this.trackAnalyser.disconnect();
      } catch {
        /* ignore */
      }
      this.idleTrackAnalyser = this.trackAnalyser;
      this.trackAnalyser = null;
      try {
        graph.pan.connect(this.masterInput);
      } catch {
        /* ignore */
      }
    }
  }

  /** Disconnect Track analyser and restore pan → Σ. Target id unchanged. */
  private detachTrackMeter(opts: { emitNeutral: boolean }): void {
    const trackId = this.trackMeterTargetId;
    const graph = trackId ? this.tracks.get(trackId) : null;
    const analyser = this.trackAnalyser;
    this.trackAnalyser = null;
    if (analyser) {
      try {
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      this.idleTrackAnalyser = analyser;
    }
    if (graph && this.masterInput) {
      try {
        graph.pan.disconnect();
      } catch {
        /* ignore */
      }
      try {
        graph.pan.connect(this.masterInput);
      } catch {
        /* ignore */
      }
    }
    clearClipLatch(this.trackClipLatch);
    this.syncTrackLevelTaps();
    if (opts.emitNeutral) {
      this.emitTrackMeterSnapshot(
        buildMeterSnapshot({
          peak: 0,
          clipping: false,
          timestamp: this.host.nowMs(),
        }),
      );
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
      if (!voice || voice.bufferSource || voice.element.paused) continue;
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

  /**
   * Track gain / pan. Static tracks set the value as before. Tracks with automation are scheduled as AudioParam
   * events from the playhead — only when the plan changes (play, seek, document, mute / solo), never on every
   * clock tick, because a static write would wipe the ramps.
   */
  private syncTrackStrip(graph: TrackGraph, track: StudioEngineTrack, anySolo: boolean): void {
    const ctx = this.ctx;
    const staticParams = trackGraphParams(track, anySolo);
    const wantsAutomation = automationLane(track.automation, "gainDb") !== null || automationLane(track.automation, "pan") !== null;
    if (!wantsAutomation || !ctx) {
      if (graph.autoSig !== undefined) {
        graph.autoSig = undefined;
        graph.autoEpoch = undefined;
        graph.gain.gain.cancelScheduledValues?.(ctx?.currentTime ?? 0);
        graph.pan.pan.cancelScheduledValues?.(ctx?.currentTime ?? 0);
      }
      graph.gain.gain.value = staticParams.gain;
      graph.pan.pan.value = staticParams.pan;
      return;
    }
    const playing = this.lifecycle === "playing" && this.epoch !== null;
    const audible = isTrackAudible({ muted: track.muted, solo: track.solo, anySolo });
    const sig = `${automationSignature(track.automation)}|${track.gainDb}|${track.pan}|${audible ? 1 : 0}`;
    const epoch = playing ? this.epoch : null;
    if (graph.autoSig === sig && graph.autoEpoch === epoch) return;
    graph.autoSig = sig;
    graph.autoEpoch = epoch;
    const playhead = playing
      ? playheadMsFromContextClock({ epoch: this.epoch!, contextTime: ctx.currentTime, timelineLengthMs: this.document?.timelineLengthMs ?? 0 })
      : 0;
    const plan = trackAutomationSchedule(track, anySolo, playhead);
    const now = ctx.currentTime;
    const apply = (param: ParamValue, schedule: { start: number; events: { atMs: number; value: number }[] } | null, staticValue: number) => {
      param.cancelScheduledValues?.(now);
      if (!schedule) {
        param.value = staticValue;
        return;
      }
      if (!playing || !param.setValueAtTime || !param.linearRampToValueAtTime) {
        param.value = schedule.start;
        return;
      }
      param.setValueAtTime(schedule.start, now);
      for (const e of schedule.events) param.linearRampToValueAtTime(e.value, now + e.atMs / 1000);
    };
    apply(graph.gain.gain, plan.gain, staticParams.gain);
    apply(graph.pan.pan, plan.pan, staticParams.pan);
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
      this.syncTrackStrip(graph, track, anySolo);
      this.syncTrackFx(track.id, track.effectsChain);
    }
    for (const [id, graph] of this.tracks) {
      if (seen.has(id)) continue;
      if (id === this.trackMeterTargetId) {
        this.detachTrackMeter({ emitNeutral: true });
        this.trackMeterTargetId = null;
      }
      try {
        graph.fx?.dispose();
        graph.input.disconnect();
        graph.gain.disconnect();
        graph.pocketDuck?.disconnect();
        graph.pan.disconnect();
      } catch {
        /* ignore */
      }
      this.tracks.delete(id);
    }
    if (this.trackMeterTargetId) {
      this.ensureTrackMeterAttached();
    }
    this.syncTrackLevelTaps();
    this.syncPocketDucks();
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
      pocketDuck: null,
      fx: null,
      fingerprint: "",
    };
    this.tracks.set(trackId, graph);
    return graph;
  }

  /**
   * Broadband trim on beat tracks only, between track gain and pan.
   * Does not disconnect pan, so ensureTrackMeterAttached keeps the meter.
   * Split-band mid duck stays in renderMixStereo.
   */
  private syncPocketDucks(): void {
    if (!this.ctx || !this.document) return;
    const beatIds = pocketBeatTrackIds(this.document.clips);
    for (const [id, graph] of this.tracks) {
      if (beatIds.has(id)) this.ensurePocketDuck(graph);
      else this.clearPocketDuck(graph);
    }
  }

  private ensurePocketDuck(graph: TrackGraph): void {
    if (graph.pocketDuck || !this.ctx) return;
    let duck: GainLike;
    try {
      duck = this.ctx.createGain();
      duck.gain.value = this.pocketDuckLevel;
    } catch {
      return;
    }
    try {
      graph.gain.disconnect(graph.pan);
      graph.gain.connect(duck);
      duck.connect(graph.pan);
    } catch {
      try {
        graph.gain.connect(graph.pan);
      } catch {
        /* original edge already gone */
      }
      try {
        duck.disconnect();
      } catch {
        /* ignore */
      }
      return;
    }
    graph.pocketDuck = duck;
  }

  private clearPocketDuck(graph: TrackGraph): void {
    const duck = graph.pocketDuck;
    if (!duck) return;
    graph.pocketDuck = null;
    try {
      graph.gain.disconnect(duck);
    } catch {
      /* ignore */
    }
    try {
      duck.disconnect();
    } catch {
      /* ignore */
    }
    try {
      graph.gain.connect(graph.pan);
    } catch {
      /* ignore */
    }
  }

  private applyPocketBeatDuck(): void {
    if (!this.document) return;
    const side = readPocketSidechain();
    const target = 1 - side.depth * Math.min(1, Math.max(0, side.key) * 3);
    this.pocketDuckLevel += (target - this.pocketDuckLevel) * 0.45;
    const beatIds = pocketBeatTrackIds(this.document.clips);
    for (const id of beatIds) {
      const duck = this.tracks.get(id)?.pocketDuck;
      if (duck) duck.gain.value = this.pocketDuckLevel;
    }
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

  /**
   * BRD Tune: the worklet streams with a fixed delay → tuned tracks' clips
   * start earlier (plugin-delay compensation, same helper as the per-sample
   * offline render). Only once the worklet is live; until then tune is a dry
   * wire and nothing is shifted. Kicks off the worklet load when needed.
   */
  /** Loads rider, harmony, voice and pocket worklets once. Until then those slots are dry. */
  private ensurePreviewWorklets(document: StudioEngineDocument): void {
    this.loadInsertWorklet(document, "rider", isRiderWorkletReady, ensureRiderWorklet);
    this.loadInsertWorklet(document, "harmony", isHarmonyWorkletReady, ensureHarmonyWorklet);
    this.loadInsertWorklet(document, "voice", isVoiceWorkletReady, ensureVoiceWorklet);
    this.loadInsertWorklet(document, "pocket", isPocketWorkletReady, ensurePocketWorklet);
  }

  private loadInsertWorklet(
    document: StudioEngineDocument,
    type: string,
    isReady: (ctx: object) => boolean,
    ensure: (ctx: object) => Promise<boolean>,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const needs = document.tracks.some((t) => {
      const effects = (t.effectsChain as { effects?: { type?: string; enabled?: boolean }[] } | null)?.effects;
      return Array.isArray(effects) && effects.some((e) => e.type === type && e.enabled !== false);
    });
    if (!needs || isReady(ctx)) return;
    void ensure(ctx).then((ok) => {
      if (!ok || this.ctx !== ctx || this.lifecycle === "disposed") return;
      for (const graph of this.tracks.values()) {
        if (!graph.fx?.inspect().some((slot) => slot.type === type)) continue;
        graph.fx.dispose();
        graph.fx = null;
        graph.fingerprint = "";
      }
      if (this.rawDocument) this.setDocument(this.rawDocument);
    });
  }

  private withTuneCompensation(document: StudioEngineDocument): StudioEngineDocument {
    const ctx = this.ctx;
    if (!ctx || !document.tracks.some((t) => enabledTuneCount(t.effectsChain) > 0)) return document;
    if (isTuneWorkletReady(ctx)) return compensateStudioTuneLatency(document);
    void ensureTuneWorklet(ctx).then((ok) => {
      if (!ok || this.ctx !== ctx || this.lifecycle === "disposed") return;
      // Rebuild chains that were wired dry while the worklet was loading.
      for (const graph of this.tracks.values()) {
        if (!graph.fx?.inspect().some((slot) => slot.type === "tune")) continue;
        graph.fx.dispose();
        graph.fx = null;
        graph.fingerprint = "";
      }
      if (this.rawDocument) this.setDocument(this.rawDocument);
    });
    return document;
  }

  /** Ready baked source for a clip of a baked track, else null (realtime path). */
  private tuneBakedSourceFor(clip: StudioEngineClip): { url: string; key: string } | null {
    const key = this.tuneBakeAssign.get(clip.trackId)?.get(clip.id);
    const entry = key ? this.tuneBakes.get(key) : undefined;
    return key && entry?.status === "ready" && entry.url ? { url: entry.url, key } : null;
  }

  /**
   * BRD Tune (Gold) live notes. Tracks whose tune insert carries manual notes
   * play per-clip baked audio (prefix FX + anchored TuneCore, same engine as
   * the note preview and the E3 render) and run only the effects after the
   * insert live. Until every clip of a track is baked the track keeps its
   * previous bake (edit) or the realtime auto-tune path (first bake).
   */
  private withTuneBakes(raw: StudioEngineDocument): StudioEngineDocument {
    const bake = this.host.bakeTune;
    if (!bake && this.tuneBakes.size === 0) return raw;
    const now = this.host.nowMs();
    const desired = new Set<string>();
    const pending: string[] = [];
    const nextAssign = new Map<string, Map<string, string>>();
    const chains = new Map<string, unknown>();
    if (bake) {
      for (const track of raw.tracks) {
        const spec = tuneBakeSpecForChain(track.effectsChain);
        if (!spec) continue;
        const clips = raw.clips.filter((c) => c.trackId === track.id);
        const want = new Map<string, string>();
        let allReady = true;
        let anyFailed = false;
        for (const clip of clips) {
          const identity = studioClipSourceIdentity(clip) ?? `${clip.sourceKind}:${clip.id}`;
          const key = tuneBakeClipKey(spec, clip, identity, TUNE_BAKE_SAMPLE_RATE);
          want.set(clip.id, key);
          desired.add(key);
          const entry = this.tuneBakes.get(key) ?? this.startTuneBake(key, clip, spec, identity);
          entry.usedAt = now;
          if (entry.status !== "ready") allReady = false;
          if (entry.status === "failed") anyFailed = true;
        }
        let assign: Map<string, string> | null = allReady ? want : null;
        if (!assign) {
          const prev = this.tuneBakeAssign.get(track.id);
          if (prev && clips.length > 0 && clips.every((c) => this.tuneBakes.get(prev.get(c.id) ?? "")?.status === "ready")) {
            assign = new Map(clips.map((c) => [c.id, prev.get(c.id)!]));
          }
          if (!anyFailed) pending.push(track.id);
        }
        if (assign) {
          nextAssign.set(track.id, assign);
          for (const key of assign.values()) desired.add(key);
          chains.set(track.id, bakedPlaybackChain(track.effectsChain, spec));
        }
      }
    }
    // Clips whose played source changes → drop the voice (re-created on sync).
    const trackIds = new Set([...this.tuneBakeAssign.keys(), ...nextAssign.keys()]);
    for (const clip of raw.clips) {
      if (!trackIds.has(clip.trackId)) continue;
      const before = this.tuneBakeAssign.get(clip.trackId)?.get(clip.id);
      const after = nextAssign.get(clip.trackId)?.get(clip.id);
      if (before !== after && this.voices.has(clip.id)) this.disposeVoice(clip.id);
    }
    this.tuneBakeAssign = nextAssign;
    this.pruneTuneBakes(desired);
    const sig = pending.join(",");
    if (sig !== this.tuneBakePendingSig) {
      this.tuneBakePendingSig = sig;
      this.listener.onTuneBake?.(pending);
    }
    if (chains.size === 0) return raw;
    return {
      ...raw,
      tracks: raw.tracks.map((t) => (chains.has(t.id) ? { ...t, effectsChain: chains.get(t.id) } : t)),
    };
  }

  private startTuneBake(key: string, clip: StudioEngineClip, spec: TuneBakeSpec, identity: string): TuneBakeEntry {
    const entry: TuneBakeEntry = { status: "pending", url: null, identity, abort: new AbortController(), usedAt: this.host.nowMs() };
    this.tuneBakes.set(key, entry);
    const snapshot = { ...clip };
    const signal = entry.abort.signal;
    // Serial queue: one decode + bake at a time (bounded memory on phones).
    this.tuneBakeQueue = this.tuneBakeQueue.then(async () => {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, TUNE_BAKE_DEBOUNCE_MS));
      if (signal.aborted) return;
      try {
        const adapter = this.registry.get(snapshot.sourceKind);
        const resolved = adapter ? await adapter.resolve(snapshot) : null;
        const url =
          resolved?.ok && this.host.bakeTune
            ? await this.host.bakeTune(
                {
                  url: resolved.source.url,
                  sampleRate: TUNE_BAKE_SAMPLE_RATE,
                  prefix: spec.prefix,
                  tune: spec.tune,
                  originMs: clipSourceOriginMs(snapshot),
                },
                signal,
              )
            : null;
        if (signal.aborted) {
          if (url) this.host.revokeUrl?.(url);
          return;
        }
        entry.url = url;
        entry.status = url ? "ready" : "failed";
      } catch {
        if (signal.aborted) return;
        entry.status = "failed";
      }
      if (this.tuneBakes.get(key) === entry && this.rawDocument && this.lifecycle !== "disposed") {
        this.setDocument(this.rawDocument);
      }
    });
    return entry;
  }

  private pruneTuneBakes(desired: ReadonlySet<string>): void {
    const unusedReady: [string, TuneBakeEntry][] = [];
    for (const [key, entry] of this.tuneBakes) {
      if (desired.has(key)) continue;
      if (entry.status === "ready") {
        unusedReady.push([key, entry]);
        continue;
      }
      entry.abort.abort();
      this.tuneBakes.delete(key);
    }
    unusedReady.sort((a, b) => b[1].usedAt - a[1].usedAt);
    for (const [key, entry] of unusedReady.slice(TUNE_BAKE_KEEP_UNUSED)) {
      if (entry.url) this.host.revokeUrl?.(entry.url);
      this.tuneBakes.delete(key);
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
    this.syncMidiPlayback(playheadMs, shouldPlay);
    const plans = planVoicesAtPlayhead(this.document, playheadMs);
    const wanted = new Set(plans.map((p) => p.clipId));

    for (const [clipId, voice] of this.voices) {
      if (voice.role !== "timeline") continue;
      if (!wanted.has(clipId)) {
        this.stopBufferSource(voice);
        voice.element.pause();
      }
    }

    for (const plan of plans) {
      if (this.failedClips.has(plan.clipId)) continue;
      const clip = this.document.clips.find((c) => c.id === plan.clipId);
      if (!clip) continue;
      const voice = await this.ensureTimelineVoice(clip);
      if (!voice) continue;
      this.applyClipFade(voice, clip, playheadMs, shouldPlay);
      const jogOwns = scratchJogOwnsClip({
        clipId: clip.id,
        liveClipId: this.scratchLive.clipId,
        liveReverse: this.scratchLive.reverse,
        liveRate: this.scratchLive.rate,
      });
      const persistedReverse = Boolean(clip.scratchReverse) && !jogOwns;
      if (!persistedReverse && Math.abs(voice.element.currentTime - plan.sourceOffsetSeconds) > 0.04) {
        voice.element.currentTime = plan.sourceOffsetSeconds;
      }
      if (!shouldPlay) {
        this.stopBufferSource(voice);
        voice.element.pause();
        continue;
      }
      if (jogOwns) {
        if (voice.scratchReverse || voice.bufferSource) continue;
      } else if (persistedReverse) {
        this.holdPersistedReverse(voice, clip, playheadMs);
        try {
          voice.element.pause();
        } catch {
          /* ignore */
        }
        continue;
      } else if (voice.scratchReverse || voice.bufferSource) {
        this.stopBufferSource(voice);
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

  /** Saved reverse on an ordinary clip. The scratch jog keeps its own path. */
  private holdPersistedReverse(voice: Voice, clip: StudioEngineClip, playheadMs: number): void {
    const target = this.heardSecForPersistedReverse(voice, clip, playheadMs);
    const anchor = voice.reverseAnchor;
    const coast = anchor && this.ctx
      ? persistedReverseCoastSec({
          anchorHeardSec: anchor.heardSec,
          elapsedSec: this.ctx.currentTime - anchor.contextTime,
          rate: anchor.rate,
        })
      : target ?? 0;
    const running = Boolean(voice.bufferSource && voice.scratchReverse && anchor);
    if (target != null && target <= 0 && !running) return;
    const restart = target == null || persistedReverseShouldRestart({
      bufferRunning: running,
      coastHeardSec: coast,
      targetHeardSec: target ?? coast,
    });
    if (!restart || voice.reverseLoad) return;
    voice.reverseLoad = true;
    voice.reverseToken += 1;
    const token = voice.reverseToken;
    void this.ensureDecodedBuffer(voice).then((ok) => {
      voice.reverseLoad = false;
      if (!ok || voice.disposed || voice.reverseToken !== token || !this.ctx) return;
      if (
        scratchJogOwnsClip({
          clipId: voice.clipId,
          liveClipId: this.scratchLive.clipId,
          liveReverse: this.scratchLive.reverse,
          liveRate: this.scratchLive.rate,
        })
      ) {
        return;
      }
      const fresh = this.document?.clips.find((item) => item.id === voice.clipId);
      if (!fresh?.scratchReverse) return;
      const playhead = this.epoch
        ? playheadMsFromContextClock({
            epoch: this.epoch,
            contextTime: this.ctx.currentTime,
            timelineLengthMs: this.document?.timelineLengthMs ?? 0,
          })
        : playheadMs;
      const heard = this.heardSecForPersistedReverse(voice, fresh, playhead);
      if (heard == null) return;
      const freshRate = clampScratchRate(fresh.scratchRate ?? 1);
      this.startReversedBufferSource(voice, freshRate, heard);
    });
  }

  private heardSecForPersistedReverse(
    voice: Voice,
    clip: StudioEngineClip,
    playheadMs: number,
  ): number | null {
    const durationSec = voice.decodedBuffer?.duration ?? voice.reversedBuffer?.duration ?? 0;
    if (!(durationSec > 0)) return null;
    return persistedReverseHeardSec({
      sourceOffsetMs: clip.sourceOffsetMs,
      localMs: Math.max(0, playheadMs - clip.timelineStartMs),
      cueMs: clip.scratchCueMs ?? 0,
      rate: clip.scratchRate ?? 1,
      sourceDurationMs: durationSec * 1000,
    });
  }

  /** P6.7.1 — apply/hold/schedule fade on existing Clip GainNode only. */
  private applyClipFade(
    voice: Voice,
    clip: StudioEngineClip,
    playheadMs: number,
    scheduleForward: boolean,
  ): void {
    const contextTime = this.ctx?.currentTime ?? 0;
    applyClipFadeGainParam(
      voice.clipGain.gain,
      clip,
      playheadMs,
      contextTime,
      scheduleForward,
    );
  }

  private applyTimelineClipFades(
    playheadMs: number,
    scheduleForward: boolean,
  ): void {
    if (!this.document) return;
    for (const voice of this.voices.values()) {
      if (voice.role !== "timeline" || voice.disposed) continue;
      const clip = this.document.clips.find((c) => c.id === voice.clipId);
      if (!clip) continue;
      this.applyClipFade(voice, clip, playheadMs, scheduleForward);
    }
  }

  private async ensureTimelineVoice(
    clip: StudioEngineClip,
  ): Promise<Voice | null> {
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

    const baked = this.tuneBakedSourceFor(clip);
    if (baked) {
      const existing = this.voices.get(clip.id);
      if (existing && !existing.disposed && existing.sourceUrl === baked.url) return existing;
      if (existing) this.disposeVoice(clip.id);
      try {
        return this.createVoice(clip, { url: baked.url, expiresAt: Number.MAX_SAFE_INTEGER }, `tune-bake:${baked.key}`);
      } catch {
        this.failedClips.add(clip.id);
        this.listener.onError({ code: "AUDIO_OUTPUT_ERROR", sourceKind: clip.sourceKind, clipId: clip.id });
        return null;
      }
    }

    // TAKE identity is immutable (replace → new take id). BEAT_REF must
    // re-resolve so master replacement (new assetId) can replace the voice.
    const existingEarly = this.voices.get(clip.id);
    if (
      existingEarly &&
      !existingEarly.disposed &&
      clip.sourceKind !== "BEAT_REF"
    ) {
      return existingEarly;
    }

    const resolved = await adapter.resolve(clip);
    const nextIdentity = studioClipSourceIdentity(clip);

    // WAVE 1.1: after await, reuse only when identity still matches.
    const existingAfterResolve = this.voices.get(clip.id);
    if (existingAfterResolve && !existingAfterResolve.disposed) {
      if (
        shouldReuseStudioVoice({
          existingIdentityKey: existingAfterResolve.identityKey,
          nextIdentityKey: nextIdentity,
          existingSourceUrl: existingAfterResolve.sourceUrl,
          nextSourceUrl: resolved.ok ? resolved.source.url : null,
        })
      ) {
        return existingAfterResolve;
      }
      // Master (or identity) changed — drop stale MediaElement before create.
      this.disposeVoice(clip.id);
    }

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
      return this.createVoice(clip, resolved.source, nextIdentity);
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
    identityKey: string | null,
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
    if (identityKey && source.url.startsWith("blob:")) {
      retainSessionAudio(identityKey);
    }
    const mediaSource = this.ctx.createMediaElementSource(element);
    const clipGain = this.ctx.createGain();
    // Initial hold; syncVoices applies position-correct fade schedule.
    applyClipFadeGainParam(
      clipGain.gain,
      clip,
      clip.timelineStartMs,
      this.ctx.currentTime,
      false,
    );
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
      identityKey,
      disposed: false,
      decodedBuffer: null,
      reversedBuffer: null,
      bufferSource: null,
      scratchReverse: false,
      reverseAnchor: null,
      reverseLoad: false,
      reverseToken: 0,
    };
    this.voices.set(clip.id, voice);
    if (this.scratchLive.reverse || this.scratchLive.rate !== 1) {
      if (!this.scratchLive.clipId || this.scratchLive.clipId === clip.id) {
        this.applyScratchToVoice(voice);
      }
    }
    return voice;
  }

  private haltMidiSources(): void {
    const sources = this.midiSources;
    this.midiSources = [];
    this.midiSig = "";
    for (const source of sources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  /**
   * Schedule rendered note PCM on each track input of this AudioContext.
   * Mute / solo / gain / pan stay on the track strip. Replanned only when the clock epoch or the notes change.
   */
  private syncMidiPlayback(playheadMs: number, shouldPlay: boolean): void {
    const ctx = this.ctx;
    const document = this.document;
    if (!shouldPlay || this.lifecycle !== "playing" || !ctx || !document || !this.epoch) {
      this.haltMidiSources();
      return;
    }
    const sr = ctx.sampleRate && ctx.sampleRate > 0 ? ctx.sampleRate : MASTER_RENDER_SAMPLE_RATE;
    const body = document.tracks
      .map((t) => {
        const notes = t.midi?.notes ?? [];
        if (!t.midi || notes.length === 0) return `${t.id}:`;
        return `${t.id}:${t.midi.instrument}:${notes.map((n) => `${n.t}.${n.dur}.${n.pitch}.${n.vel}`).join(",")}`;
      })
      .join("|");
    const sig = `${this.epoch.epochContextTime}|${this.epoch.epochPlayheadMs}|${sr}|${peekAcousticBank() ? "rec" : "syn"}|${body}`;
    if (sig === this.midiSig) return;
    this.haltMidiSources();
    this.midiSig = sig;
    if (!ctx.createBuffer || !ctx.createBufferSource) return;
    for (const track of document.tracks) {
      const notes = track.midi?.notes ?? [];
      if (!track.midi || notes.length === 0) continue;
      const pcm = renderMidiNotes({
        notes,
        instrument: track.midi.instrument,
        sampleRate: sr,
        durationMs: document.timelineLengthMs,
        bank: peekAcousticBank(),
      });
      if (pcm.length === 0) continue;
      try {
        const buffer = ctx.createBuffer(1, pcm.length, sr);
        buffer.getChannelData(0).set(pcm);
        const source = ctx.createBufferSource();
        source.buffer = buffer as StudioAudioBufferLike;
        source.connect(this.ensureTrackGraph(track.id).input);
        const offset = Math.max(0, playheadMs / 1000);
        if (offset >= pcm.length / sr) {
          source.disconnect();
          continue;
        }
        this.midiSources.push(source);
        source.start(ctx.currentTime, offset);
      } catch {
        /* context cannot schedule this buffer */
      }
    }
  }

  private pauseAllTimelineVoices(): void {
    this.haltMidiSources();
    for (const voice of this.voices.values()) {
      if (voice.role !== "timeline") continue;
      this.stopBufferSource(voice);
      voice.element.pause();
    }
  }

  private stopPreviewInternal(): void {
    this.disposeVoice(PREVIEW_VOICE_ID);
  }

  private disposeVoice(id: string): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.disposed = true;
    this.stopBufferSource(voice);
    const pinnedKey = voice.identityKey;
    const wasBlob = voice.sourceUrl.startsWith("blob:");
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
    if (pinnedKey && wasBlob) {
      releaseSessionAudio(pinnedKey);
    }
  }
}
