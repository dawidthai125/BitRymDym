/**
 * SFM-2 / SFM-3 — Offline Studio timeline PCM renderer (Node-safe, no OfflineAudioContext).
 *
 * Consumes SFM-1 interpretStudioSessionAtPlayhead + injected decoded PCM.
 * Does NOT download Storage, claim jobs, encode MP3, or start Contabo.
 *
 * FX policy (SFM-3D): empty/null → dry; enabled eq/compressor/limiter/delay/
 * reverb via offline adapters; unsupported schema → FX_UNSUPPORTED;
 * bypass/skip → passthrough. Live order: clip → track FX → track gain/pan
 * → Σ → master FX → master gain/pan. No E3 server-basic substitute.
 * Limiter/reverb are NOT True Peak. Reverb IR buffers count toward PCM budget.
 */

import { AUDIO_CODEC, AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS } from "@/config/audio-render";
import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import {
  trackGraphParams,
  type StudioEngineDocument,
} from "@/lib/studio/studio-audio-schedule";
import { effectiveClipGain } from "@/lib/studio/studio-clip-fade";
import {
  buildStudioOfflineFxChain,
  studioOfflineFxStateBytes,
  StudioOfflineFxError,
  type StudioOfflineFxChainHandle,
} from "@/lib/studio/studio-offline-fx";
import { interpretStudioSessionAtPlayhead } from "@/lib/studio/studio-session-interpretation";

export const STUDIO_OFFLINE_RENDER_ENGINE = "studio-offline-pcm-v1" as const;

export const STUDIO_OFFLINE_RENDER_SAMPLE_RATE = AUDIO_CODEC.WAV_SAMPLE_RATE; // 44100
export const STUDIO_OFFLINE_RENDER_CHANNELS = AUDIO_CODEC.CHANNELS; // 2

/** Fail-closed max timeline length (ms) — aligns with render source ceiling. */
export const STUDIO_OFFLINE_RENDER_MAX_DURATION_MS =
  AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS * 1000;

export type StudioOfflineRenderErrorCode =
  | "STUDIO_RENDER_EMPTY_SESSION"
  | "STUDIO_RENDER_ARTIFACT_UNSUPPORTED"
  | "STUDIO_RENDER_SOURCE_MISSING"
  | "STUDIO_RENDER_SOURCE_INVALID"
  | "STUDIO_RENDER_FX_UNSUPPORTED"
  | "STUDIO_RENDER_DURATION_CAP"
  /** OD-SFM-F04: timeline + required FX post-roll exceeds hard cap (no silent trim). */
  | "STUDIO_RENDER_TAIL_DURATION_CAP"
  | "STUDIO_RENDER_MEMORY_CAP"
  | "STUDIO_RENDER_INVALID_DOCUMENT";

export class StudioOfflineRenderError extends Error {
  readonly code: StudioOfflineRenderErrorCode;

  constructor(code: StudioOfflineRenderErrorCode, message: string) {
    super(message);
    this.name = "StudioOfflineRenderError";
    this.code = code;
  }
}

function checkedPcmBytes(frames: number, channels: number): number {
  if (!Number.isFinite(frames) || frames < 0 || !Number.isFinite(channels)) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_MEMORY_CAP",
      "Invalid PCM size computation.",
    );
  }
  const perFrame = channels * 4;
  if (frames > 0 && frames > Math.floor(Number.MAX_SAFE_INTEGER / perFrame)) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_MEMORY_CAP",
      "PCM byte size exceeds safe integer range.",
    );
  }
  return frames * perFrame;
}

/** Bytes for stereo float32 interleaved PCM covering `durationMs` at render SR. */
export function studioOfflineRenderOutputBytesForDurationMs(
  durationMs: number,
): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const frames = Math.floor(
    (durationMs / 1000) * STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
  );
  return checkedPcmBytes(frames, STUDIO_OFFLINE_RENDER_CHANNELS);
}

/**
 * Default max **output** buffer bytes (stereo f32 for full duration cap).
 * Independent of DURATION_CAP: a shorter timeline can still exceed a tighter
 * `maxOutputBytes` option → MEMORY_CAP.
 * ~180s × 44100 × 2 × 4 ≈ 63.5 MiB.
 */
export const STUDIO_OFFLINE_RENDER_MAX_OUTPUT_BYTES =
  studioOfflineRenderOutputBytesForDurationMs(
    STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
  );

/**
 * Default max **total** PCM bytes = output + cached source buffers.
 * Justification (SFM-2.1 bench): full 180s × 2 sources + output ≈ 190 MiB PCM;
 * RSS peaked ~260 MiB on win32/node — budget 256 MiB for PCM plane only.
 * Callers may lower via `maxTotalPcmBytes`.
 */
export const STUDIO_OFFLINE_RENDER_MAX_TOTAL_PCM_BYTES = 256 * 1024 * 1024;

/** Injectable PCM — caller owns AuthZ / decode; renderer never fetches Storage. */
export type StudioOfflinePcmSourceKey =
  | { kind: "TAKE"; takeId: string }
  | { kind: "BEAT_REF"; beatId: string };

export type StudioOfflinePcmResolver = (
  key: StudioOfflinePcmSourceKey,
) => DecodedPcmStereo | null | Promise<DecodedPcmStereo | null>;

export type StudioOfflineRenderResult = {
  engineId: typeof STUDIO_OFFLINE_RENDER_ENGINE;
  sampleRate: typeof STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
  channels: typeof STUDIO_OFFLINE_RENDER_CHANNELS;
  frames: number;
  durationMs: number;
  /** Interleaved stereo Float32. */
  interleaved: Float32Array;
  /** Peak absolute sample after master. */
  peakAbs: number;
  /** RMS of interleaved buffer. */
  rms: number;
};

export type StudioOfflineRenderOptions = {
  document: StudioEngineDocument;
  resolvePcm: StudioOfflinePcmResolver;
  /**
   * Optional shorter render window (ms). Must be in 1…MAX_DURATION.
   * Does not raise the duration cap. Ignored when `exportDurationMs` is set.
   */
  maxDurationMs?: number;
  /**
   * Explicit export length (ms), including FX post-roll past timeline.
   * Must be in 1…MAX_DURATION and ≥ timelineLengthMs.
   * Callers that need OD-SFM-F04 post-roll must pre-validate via
   * `planStudioExportDuration` — this renderer does not silently trim tails.
   */
  exportDurationMs?: number;
  /**
   * Public output-buffer budget (bytes). Default = MAX_OUTPUT_BYTES (180s stereo f32).
   * Timeline within duration cap can still fail MEMORY_CAP when this is tighter.
   */
  maxOutputBytes?: number;
  /**
   * Public total PCM budget (output + cached sources). Default = MAX_TOTAL_PCM_BYTES.
   */
  maxTotalPcmBytes?: number;
};

function keyForVoice(voice: {
  sourceKind: string;
  sourceTakeId: string | null;
  sourceBeatId: string | null;
}): StudioOfflinePcmSourceKey | null {
  if (voice.sourceKind === "TAKE") {
    if (!voice.sourceTakeId) return null;
    return { kind: "TAKE", takeId: voice.sourceTakeId };
  }
  if (voice.sourceKind === "BEAT_REF") {
    if (!voice.sourceBeatId) return null;
    return { kind: "BEAT_REF", beatId: voice.sourceBeatId };
  }
  return null;
}

function sourceCacheKey(key: StudioOfflinePcmSourceKey): string {
  return key.kind === "TAKE" ? `TAKE:${key.takeId}` : `BEAT_REF:${key.beatId}`;
}

function assertValidPcm(
  pcm: DecodedPcmStereo,
  label: string,
): asserts pcm is DecodedPcmStereo {
  if (pcm.sampleRate !== STUDIO_OFFLINE_RENDER_SAMPLE_RATE) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_SOURCE_INVALID",
      `${label}: sampleRate must be ${STUDIO_OFFLINE_RENDER_SAMPLE_RATE}, got ${pcm.sampleRate}.`,
    );
  }
  if (pcm.channels !== 2) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_SOURCE_INVALID",
      `${label}: channels must be 2.`,
    );
  }
  if (
    !Number.isFinite(pcm.frames) ||
    pcm.frames < 1 ||
    pcm.interleaved.length !== pcm.frames * 2
  ) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_SOURCE_INVALID",
      `${label}: invalid PCM frame buffer.`,
    );
  }
  for (let i = 0; i < Math.min(pcm.interleaved.length, 64); i++) {
    if (!Number.isFinite(pcm.interleaved[i]!)) {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_SOURCE_INVALID",
        `${label}: non-finite PCM sample.`,
      );
    }
  }
}

/** Equal-power-linear pan law matching server-basic applyGainPan shape (linear gain). */
export function applyLinearGainPanSample(
  left: number,
  right: number,
  linearGain: number,
  pan: number,
): { left: number; right: number } {
  const g = Number.isFinite(linearGain) && linearGain > 0 ? linearGain : 0;
  const p = Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
  const leftG = g * Math.min(1, 1 - p);
  const rightG = g * Math.min(1, 1 + p);
  return { left: left * leftG, right: right * rightG };
}

function readSourceSample(
  pcm: DecodedPcmStereo,
  sourceOffsetMs: number,
  playheadMsFloor: number,
  tMs: number,
): { left: number; right: number } | null {
  // Continuous media position: clip.sourceOffset + local time
  // At floor ms, voice.sourceOffsetMs = clip.sourceOffset + (floor - start)
  // Continuous: sourceOffsetMs + (tMs - playheadMsFloor)
  const srcMs = sourceOffsetMs + (tMs - playheadMsFloor);
  if (srcMs < 0) return null;
  const srcFrame = Math.floor((srcMs / 1000) * STUDIO_OFFLINE_RENDER_SAMPLE_RATE);
  if (srcFrame < 0 || srcFrame >= pcm.frames) {
    // Source ended before clip window — silence (not success fake file).
    return { left: 0, right: 0 };
  }
  const i = srcFrame * 2;
  return {
    left: pcm.interleaved[i] ?? 0,
    right: pcm.interleaved[i + 1] ?? 0,
  };
}

function peakAndRms(interleaved: Float32Array): { peakAbs: number; rms: number } {
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < interleaved.length; i++) {
    const s = interleaved[i] ?? 0;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSq += s * s;
  }
  const rms =
    interleaved.length > 0 ? Math.sqrt(sumSq / interleaved.length) : 0;
  return { peakAbs: peak, rms };
}

function mapOfflineFxError(err: unknown): never {
  if (err instanceof StudioOfflineFxError) {
    throw new StudioOfflineRenderError(
      err.code === "STUDIO_OFFLINE_FX_UNSUPPORTED"
        ? "STUDIO_RENDER_FX_UNSUPPORTED"
        : "STUDIO_RENDER_INVALID_DOCUMENT",
      err.message,
    );
  }
  throw err;
}

/**
 * Build track/master FX inserts. Fail-closed for enabled unsupported types.
 * Empty chains → null (dry wire).
 */
function buildOfflineFxInserts(
  document: StudioEngineDocument,
  sampleRate: number,
): {
  trackFx: Map<string, StudioOfflineFxChainHandle | null>;
  masterFx: StudioOfflineFxChainHandle | null;
  stateBytes: number;
} {
  try {
    const trackFx = new Map<string, StudioOfflineFxChainHandle | null>();
    for (const track of document.tracks) {
      trackFx.set(
        track.id,
        buildStudioOfflineFxChain(track.effectsChain, "track", sampleRate),
      );
    }
    const masterFx = buildStudioOfflineFxChain(
      document.masterFxChain,
      "master",
      sampleRate,
    );
    const stateBytes = studioOfflineFxStateBytes([
      ...trackFx.values(),
      masterFx,
    ]);
    return { trackFx, masterFx, stateBytes };
  } catch (err) {
    mapOfflineFxError(err);
  }
}

/**
 * Render Studio engine document to stereo PCM using shared session interpretation.
 */
export async function renderStudioDocumentOffline(
  options: StudioOfflineRenderOptions,
): Promise<StudioOfflineRenderResult> {
  const document = options.document;
  if (!document || !Array.isArray(document.tracks) || !Array.isArray(document.clips)) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_INVALID_DOCUMENT",
      "Studio engine document is invalid.",
    );
  }

  if (
    !Number.isFinite(document.timelineLengthMs) ||
    document.timelineLengthMs < 1
  ) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_EMPTY_SESSION",
      "Timeline length must be a positive integer ms.",
    );
  }

  for (const clip of document.clips) {
    if (clip.sourceKind === "ARTIFACT") {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_ARTIFACT_UNSUPPORTED",
        "ARTIFACT clips are not supported by Studio offline render.",
      );
    }
  }

  const maxCap = STUDIO_OFFLINE_RENDER_MAX_DURATION_MS;
  const timelineMs = Math.trunc(document.timelineLengthMs);
  if (timelineMs > maxCap) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_DURATION_CAP",
      `Timeline ${timelineMs}ms exceeds cap ${maxCap}ms.`,
    );
  }

  const exportDuration = options.exportDurationMs;
  const requestedMax = options.maxDurationMs;
  let durationMs: number;
  if (exportDuration !== undefined) {
    if (
      !Number.isFinite(exportDuration) ||
      exportDuration < 1 ||
      exportDuration > maxCap
    ) {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_DURATION_CAP",
        `exportDurationMs must be in 1…${maxCap}.`,
      );
    }
    const exportMs = Math.trunc(exportDuration);
    if (exportMs < timelineMs) {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_DURATION_CAP",
        `exportDurationMs ${exportMs} must be ≥ timeline ${timelineMs}ms.`,
      );
    }
    durationMs = exportMs;
  } else {
    if (
      requestedMax !== undefined &&
      (!Number.isFinite(requestedMax) ||
        requestedMax < 1 ||
        requestedMax > maxCap)
    ) {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_DURATION_CAP",
        `maxDurationMs must be in 1…${maxCap}.`,
      );
    }
    /** Optional shorter window for tests; never extends past timeline or cap. */
    durationMs = Math.min(timelineMs, requestedMax ?? timelineMs);
  }

  const maxOutputBytes =
    options.maxOutputBytes ?? STUDIO_OFFLINE_RENDER_MAX_OUTPUT_BYTES;
  const maxTotalPcmBytes =
    options.maxTotalPcmBytes ?? STUDIO_OFFLINE_RENDER_MAX_TOTAL_PCM_BYTES;
  if (
    !Number.isFinite(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    !Number.isFinite(maxTotalPcmBytes) ||
    maxTotalPcmBytes < 1
  ) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_MEMORY_CAP",
      "Memory budgets must be positive finite byte counts.",
    );
  }

  const frames = Math.max(
    1,
    Math.floor((durationMs / 1000) * STUDIO_OFFLINE_RENDER_SAMPLE_RATE),
  );
  // MEMORY vs DURATION are independent: duration already passed; output size checked here.
  const outputBytes = checkedPcmBytes(frames, STUDIO_OFFLINE_RENDER_CHANNELS);
  if (outputBytes > maxOutputBytes) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_MEMORY_CAP",
      `Output buffer ${outputBytes} bytes exceeds maxOutputBytes ${maxOutputBytes}.`,
    );
  }
  if (outputBytes > maxTotalPcmBytes) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_MEMORY_CAP",
      `Output buffer ${outputBytes} bytes exceeds maxTotalPcmBytes ${maxTotalPcmBytes}.`,
    );
  }

  // FX inserts before PCM alloc — fail-closed for unsupported enabled effects.
  const { trackFx, masterFx, stateBytes: fxStateBytes } = buildOfflineFxInserts(
    document,
    STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
  );
  if (outputBytes + fxStateBytes > maxTotalPcmBytes) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_MEMORY_CAP",
      `Output + FX state ${outputBytes + fxStateBytes} bytes exceeds maxTotalPcmBytes ${maxTotalPcmBytes}.`,
    );
  }

  // Probe audible voices on the document timeline only (not FX post-roll silence).
  const probeEndMs = timelineMs;
  let anyVoice = false;
  const probeStep = Math.max(1, Math.floor(probeEndMs / 32));
  for (let ms = 0; ms < probeEndMs; ms += probeStep) {
    if (interpretStudioSessionAtPlayhead(document, ms).voices.length > 0) {
      anyVoice = true;
      break;
    }
  }
  if (
    !anyVoice &&
    interpretStudioSessionAtPlayhead(document, Math.max(0, probeEndMs - 1))
      .voices.length === 0
  ) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_EMPTY_SESSION",
      "No audible TAKE/BEAT_REF voices on the Studio timeline.",
    );
  }

  const pcmCache = new Map<string, DecodedPcmStereo>();
  let cachedSourcesBytes = 0;

  async function loadPcm(key: StudioOfflinePcmSourceKey): Promise<DecodedPcmStereo> {
    const ck = sourceCacheKey(key);
    const hit = pcmCache.get(ck);
    if (hit) return hit;
    const pcm = await options.resolvePcm(key);
    if (!pcm) {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_SOURCE_MISSING",
        `Missing PCM for ${ck}.`,
      );
    }
    assertValidPcm(pcm, ck);
    const srcBytes = checkedPcmBytes(pcm.frames, pcm.channels);
    if (
      outputBytes + fxStateBytes + cachedSourcesBytes + srcBytes >
      maxTotalPcmBytes
    ) {
      throw new StudioOfflineRenderError(
        "STUDIO_RENDER_MEMORY_CAP",
        `Total PCM ${outputBytes + fxStateBytes + cachedSourcesBytes + srcBytes} bytes exceeds maxTotalPcmBytes ${maxTotalPcmBytes}.`,
      );
    }
    cachedSourcesBytes += srcBytes;
    pcmCache.set(ck, pcm);
    return pcm;
  }

  // Prefetch sources referenced by clips (AuthZ is caller's responsibility).
  for (const clip of document.clips) {
    if (clip.sourceKind === "TAKE" && clip.sourceTakeId) {
      await loadPcm({ kind: "TAKE", takeId: clip.sourceTakeId });
    } else if (clip.sourceKind === "BEAT_REF" && clip.sourceBeatId) {
      await loadPcm({ kind: "BEAT_REF", beatId: clip.sourceBeatId });
    }
  }

  // Allocate output only after duration + memory + FX gates.
  const interleaved = new Float32Array(frames * 2);
  const clipById = new Map(document.clips.map((c) => [c.id, c]));
  const trackIndex = new Map(document.tracks.map((t, idx) => [t.id, idx]));
  const busL = new Float64Array(document.tracks.length);
  const busR = new Float64Array(document.tracks.length);
  // Track buses are scratch (not retained PCM); counted only as FX state above.

  let cachedMs = -1;
  let cachedInterp = interpretStudioSessionAtPlayhead(document, 0);

  for (let i = 0; i < frames; i++) {
    const tMs = (i / STUDIO_OFFLINE_RENDER_SAMPLE_RATE) * 1000;
    const playheadMsFloor = Math.floor(tMs);
    if (playheadMsFloor !== cachedMs) {
      cachedMs = playheadMsFloor;
      cachedInterp = interpretStudioSessionAtPlayhead(document, playheadMsFloor);
    }

    busL.fill(0);
    busR.fill(0);

    for (const voice of cachedInterp.voices) {
      if (voice.sourceKind === "ARTIFACT") {
        throw new StudioOfflineRenderError(
          "STUDIO_RENDER_ARTIFACT_UNSUPPORTED",
          "ARTIFACT voice encountered during offline render.",
        );
      }
      const key = keyForVoice(voice);
      if (!key) {
        throw new StudioOfflineRenderError(
          "STUDIO_RENDER_SOURCE_MISSING",
          `Voice ${voice.clipId} missing source id.`,
        );
      }
      const pcm = pcmCache.get(sourceCacheKey(key));
      if (!pcm) {
        throw new StudioOfflineRenderError(
          "STUDIO_RENDER_SOURCE_MISSING",
          `PCM not loaded for ${sourceCacheKey(key)}.`,
        );
      }

      const sample = readSourceSample(
        pcm,
        voice.sourceOffsetMs,
        playheadMsFloor,
        tMs,
      );
      if (!sample) continue;

      const clip = clipById.get(voice.clipId);
      const clipGain = clip
        ? effectiveClipGain(clip, tMs)
        : voice.effectiveClipGain;
      const withClip = applyLinearGainPanSample(
        sample.left,
        sample.right,
        clipGain,
        0,
      );
      const ti = trackIndex.get(voice.trackId);
      if (ti === undefined) continue;
      busL[ti] += withClip.left;
      busR[ti] += withClip.right;
    }

    let left = 0;
    let right = 0;
    for (let ti = 0; ti < document.tracks.length; ti++) {
      const track = document.tracks[ti]!;
      let tl = busL[ti] ?? 0;
      let tr = busR[ti] ?? 0;
      const fx = trackFx.get(track.id);
      if (fx) {
        const wet = fx.process({ left: tl, right: tr });
        tl = wet.left;
        tr = wet.right;
      }
      const tp = trackGraphParams(track, cachedInterp.anySolo);
      const withTrack = applyLinearGainPanSample(tl, tr, tp.gain, tp.pan);
      left += withTrack.left;
      right += withTrack.right;
    }

    if (masterFx) {
      const wet = masterFx.process({ left, right });
      left = wet.left;
      right = wet.right;
    }

    const mastered = applyLinearGainPanSample(
      left,
      right,
      cachedInterp.master.gain,
      cachedInterp.master.pan,
    );
    interleaved[i * 2] = mastered.left;
    interleaved[i * 2 + 1] = mastered.right;
  }

  const { peakAbs, rms } = peakAndRms(interleaved);
  return {
    engineId: STUDIO_OFFLINE_RENDER_ENGINE,
    sampleRate: STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
    channels: STUDIO_OFFLINE_RENDER_CHANNELS,
    frames,
    durationMs,
    interleaved,
    peakAbs,
    rms,
  };
}
