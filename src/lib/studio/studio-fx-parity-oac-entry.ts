/**
 * Browser entry for Stage I.13b plane A — OfflineAudioContext @ 44100.
 * Bundled via esbuild IIFE; not imported by production app routes.
 */

import { gainDbToLinearVolume } from "@/lib/studio/studio-beat-audio";
import { effectiveClipGain } from "@/lib/studio/studio-clip-fade";
import {
  buildStudioMasterFxChain,
  buildStudioTrackFxChain,
  type StudioFxGraphContext,
} from "@/lib/studio/studio-fx-graph";
import {
  masterGraphParams,
  trackGraphParams,
  type StudioEngineDocument,
} from "@/lib/studio/studio-audio-schedule";

export type OacRenderRequest = {
  sampleRate: number;
  /** Base64 of Float32 interleaved stereo source PCM. */
  sourcePcmB64: string;
  sourceFrames: number;
  document: StudioEngineDocument;
  exportDurationMs: number;
};

export type OacRenderResponse = {
  sampleRate: number;
  frames: number;
  interleavedB64: string;
  error?: string;
};

function b64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);
}

function f32ToB64(f32: Float32Array): string {
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function asFxContext(ctx: OfflineAudioContext): StudioFxGraphContext {
  return ctx as unknown as StudioFxGraphContext;
}

/**
 * Render one-track / one-clip Studio document through live FX graph builders
 * hosted on OfflineAudioContext (plane A).
 */
export async function renderWithOfflineAudioContext(
  req: OacRenderRequest,
): Promise<OacRenderResponse> {
  try {
    const sr = req.sampleRate;
    const frames = Math.max(1, Math.floor((req.exportDurationMs / 1000) * sr));
    const ctx = new OfflineAudioContext(2, frames, sr);
    const fxCtx = asFxContext(ctx);
    const doc = req.document;
    const track = doc.tracks[0];
    const clip = doc.clips[0];
    if (!track || !clip) {
      return {
        sampleRate: sr,
        frames: 0,
        interleavedB64: "",
        error: "Document requires one track and one clip.",
      };
    }

    const sourcePcm = b64ToF32(req.sourcePcmB64);
    const buffer = ctx.createBuffer(2, req.sourceFrames, sr);
    const l = buffer.getChannelData(0);
    const r = buffer.getChannelData(1);
    for (let i = 0; i < req.sourceFrames; i++) {
      l[i] = sourcePcm[i * 2] ?? 0;
      r[i] = sourcePcm[i * 2 + 1] ?? 0;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const clipGain = ctx.createGain();
    const trackGain = ctx.createGain();
    const trackPan = ctx.createStereoPanner();
    const masterGain = ctx.createGain();
    const masterPan = ctx.createStereoPanner();

    const anySolo = doc.tracks.some((t) => t.solo);
    const tp = trackGraphParams(track, anySolo);
    const mp = masterGraphParams(doc);

    // Mute / solo / clip mute → silence.
    const clipSilent = clip.muted || tp.gain <= 0;
    const baseClipLin = clipSilent ? 0 : gainDbToLinearVolume(clip.gainDb);

    // Approximate fade envelope with per-10ms breakpoints (matches effectiveClipGain shape).
    const timelineMs = doc.timelineLengthMs;
    clipGain.gain.setValueAtTime(0, 0);
    const stepMs = 10;
    for (let ms = 0; ms <= timelineMs; ms += stepMs) {
      const env = clipSilent ? 0 : effectiveClipGain(clip, ms);
      // effectiveClipGain already includes clip gainDb × fades.
      const g = clipSilent ? 0 : env;
      clipGain.gain.setValueAtTime(g, ms / 1000);
    }
    // After clip end: 0 (tails come only from delay/reverb FX state).
    clipGain.gain.setValueAtTime(0, Math.max(timelineMs, clip.timelineStartMs + clip.durationMs) / 1000);

    // If no fades, force constant base (avoids step artifacts).
    if (clip.fadeInMs <= 0 && clip.fadeOutMs <= 0) {
      clipGain.gain.cancelScheduledValues(0);
      clipGain.gain.setValueAtTime(baseClipLin, 0);
      clipGain.gain.setValueAtTime(
        0,
        (clip.timelineStartMs + clip.durationMs) / 1000,
      );
    }

    trackGain.gain.value = tp.gain;
    trackPan.pan.value = tp.pan;
    masterGain.gain.value = mp.gain;
    masterPan.pan.value = mp.pan;

    const trackFx = buildStudioTrackFxChain(
      fxCtx,
      track.effectsChain,
      () => undefined,
    );
    const masterFx = buildStudioMasterFxChain(
      fxCtx,
      doc.masterFxChain,
      () => undefined,
    );

    src.connect(clipGain);
    let node: AudioNode = clipGain;
    if (trackFx) {
      clipGain.connect(trackFx.input as unknown as AudioNode);
      node = trackFx.output as unknown as AudioNode;
    }
    node.connect(trackGain);
    trackGain.connect(trackPan);

    let bus: AudioNode = trackPan;
    if (masterFx) {
      trackPan.connect(masterFx.input as unknown as AudioNode);
      bus = masterFx.output as unknown as AudioNode;
    }
    bus.connect(masterGain);
    masterGain.connect(masterPan);
    masterPan.connect(ctx.destination);

    const startAt = clip.timelineStartMs / 1000;
    src.start(startAt, clip.sourceOffsetMs / 1000);
    src.stop(startAt + clip.durationMs / 1000);

    const rendered = await ctx.startRendering();
    const outL = rendered.getChannelData(0);
    const outR = rendered.getChannelData(1);
    const interleaved = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      interleaved[i * 2] = outL[i] ?? 0;
      interleaved[i * 2 + 1] = outR[i] ?? 0;
    }
    return {
      sampleRate: sr,
      frames,
      interleavedB64: f32ToB64(interleaved),
    };
  } catch (err) {
    return {
      sampleRate: req.sampleRate,
      frames: 0,
      interleavedB64: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __studioFxParityOac: {
    renderWithOfflineAudioContext: typeof renderWithOfflineAudioContext;
  };
}

globalThis.__studioFxParityOac = { renderWithOfflineAudioContext };
