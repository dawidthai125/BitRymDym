/**
 * Browser entry — Stage I.13D Plane B.
 * Real StudioAudioEngine + MediaElement blob source + AudioWorklet PCM tap.
 * Bundled as IIFE for Playwright. Not used by production routes.
 */

import {
  StudioAudioEngine,
  createBrowserStudioAudioEngineHost,
} from "@/lib/studio/studio-audio-engine";
import {
  createStudioSourceAdapterRegistry,
  createTakeSourceAdapter,
} from "@/lib/studio/studio-audio-source-adapter";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import { PARITY_TAKE_ID } from "@/lib/studio/studio-fx-parity-fixtures";

export type PlaneBRenderRequest = {
  /** Base64 Float32 interleaved source @ sourceSampleRate. */
  sourcePcmB64: string;
  sourceFrames: number;
  sourceSampleRate: number;
  document: StudioEngineDocument;
  /** Capture wall duration (ms) — typically export/timeline (+ post-roll). */
  captureDurationMs: number;
  /** Extra settle ms after play before hard stop. */
  settleMs?: number;
};

export type PlaneBRenderResponse = {
  sampleRate: number;
  frames: number;
  interleavedB64: string;
  captureMs: number;
  engineLifecycle: string;
  errors: string[];
  error?: string;
};

const WORKLET_SOURCE = `
class ParityCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'stop') this._active = false;
    };
  }
  process(inputs) {
    if (!this._active) return false;
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const left = input[0];
    const right = input[1] || input[0];
    // Copy — worklet input buffers are reused.
    this.port.postMessage({
      type: 'chunk',
      left: left.slice(0),
      right: right.slice(0),
    });
    return true;
  }
}
registerProcessor('parity-capture-processor', ParityCaptureProcessor);
`;

function b64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer, u8.byteOffset, Math.floor(u8.byteLength / 4));
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

/** Minimal PCM16 stereo WAV for MediaElement (browser-safe). */
function encodeWavPcm16(
  interleaved: Float32Array,
  sampleRate: number,
): Blob {
  const frames = Math.floor(interleaved.length / 2);
  const dataSize = frames * 2 * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < 2; ch++) {
      let s = interleaved[i * 2 + ch] ?? 0;
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function renderWithStudioAudioEngine(
  req: PlaneBRenderRequest,
): Promise<PlaneBRenderResponse> {
  const errors: string[] = [];
  let blobUrl: string | null = null;
  let workletUrl: string | null = null;
  let engine: StudioAudioEngine | null = null;

  try {
    const sourcePcm = b64ToF32(req.sourcePcmB64);
    const wav = encodeWavPcm16(sourcePcm, req.sourceSampleRate);
    blobUrl = URL.createObjectURL(wav);

    const registry = createStudioSourceAdapterRegistry([
      createTakeSourceAdapter(async (id) => {
        if (id !== PARITY_TAKE_ID) return null;
        return { url: blobUrl!, expiresAt: Date.now() + 60_000 };
      }),
    ]);

    engine = new StudioAudioEngine({
      registry,
      host: createBrowserStudioAudioEngineHost(),
      listener: {
        onPlayhead() {},
        onLifecycle() {},
        onTimelineEnded() {},
        onError(err) {
          errors.push(`${err.code}${err.clipId ? `:${err.clipId}` : ""}`);
        },
      },
    });

    if (!engine.initialize()) {
      return {
        sampleRate: 0,
        frames: 0,
        interleavedB64: "",
        captureMs: 0,
        engineLifecycle: engine.getLifecycle(),
        errors,
        error: "StudioAudioEngine.initialize() failed",
      };
    }

    const meter = engine.inspectMasterMeter();
    if (!meter) {
      return {
        sampleRate: 0,
        frames: 0,
        interleavedB64: "",
        captureMs: 0,
        engineLifecycle: engine.getLifecycle(),
        errors,
        error: "inspectMasterMeter() unavailable",
      };
    }

    // Access underlying AudioContext via destination (AnalyserNode.context).
    const analyserNode = meter.analyser as unknown as AnalyserNode;
    const audioCtx = analyserNode.context as AudioContext;
    const sampleRate = audioCtx.sampleRate;

    workletUrl = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
    );
    await audioCtx.audioWorklet.addModule(workletUrl);

    const captureNode = new AudioWorkletNode(
      audioCtx,
      "parity-capture-processor",
      { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] },
    );

    const leftChunks: Float32Array[] = [];
    const rightChunks: Float32Array[] = [];
    let capturedFrames = 0;
    const maxFrames = Math.ceil(
      ((req.captureDurationMs + (req.settleMs ?? 250)) / 1000) * sampleRate,
    ) + sampleRate; // +1s hard cap slack

    captureNode.port.onmessage = (ev: MessageEvent) => {
      const data = ev.data as {
        type: string;
        left?: Float32Array;
        right?: Float32Array;
      };
      if (data?.type !== "chunk" || !data.left || !data.right) return;
      if (capturedFrames >= maxFrames) return;
      leftChunks.push(data.left);
      rightChunks.push(data.right);
      capturedFrames += data.left.length;
    };

    // Series tap: Analyser → CaptureWorklet → Destination (replace direct link).
    try {
      analyserNode.disconnect(meter.destination as unknown as AudioNode);
    } catch {
      analyserNode.disconnect();
    }
    analyserNode.connect(captureNode);
    captureNode.connect(audioCtx.destination);

    engine.setDocument(req.document);
    await audioCtx.resume();
    await engine.play(0);

    const t0 = performance.now();
    await sleep(req.captureDurationMs + (req.settleMs ?? 250));
    const captureMs = performance.now() - t0;

    captureNode.port.postMessage({ type: "stop" });
    engine.stop();
    await sleep(50);

    // Assemble interleaved
    const frames = Math.min(capturedFrames, maxFrames);
    const interleaved = new Float32Array(frames * 2);
    let write = 0;
    for (let c = 0; c < leftChunks.length && write < frames; c++) {
      const L = leftChunks[c]!;
      const R = rightChunks[c]!;
      for (let i = 0; i < L.length && write < frames; i++) {
        interleaved[write * 2] = L[i] ?? 0;
        interleaved[write * 2 + 1] = R[i] ?? 0;
        write++;
      }
    }

    if (frames < 16) {
      return {
        sampleRate,
        frames,
        interleavedB64: f32ToB64(interleaved),
        captureMs,
        engineLifecycle: engine.getLifecycle(),
        errors,
        error: "Captured fewer than 16 frames — live MediaElement/Worklet path failed",
      };
    }

    return {
      sampleRate,
      frames,
      interleavedB64: f32ToB64(interleaved.subarray(0, frames * 2)),
      captureMs,
      engineLifecycle: engine.getLifecycle(),
      errors,
    };
  } catch (err) {
    return {
      sampleRate: 0,
      frames: 0,
      interleavedB64: "",
      captureMs: 0,
      engineLifecycle: engine?.getLifecycle() ?? "error",
      errors,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      engine?.dispose();
    } catch {
      /* ignore */
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (workletUrl) URL.revokeObjectURL(workletUrl);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __studioFxParityPlaneB: {
    renderWithStudioAudioEngine: typeof renderWithStudioAudioEngine;
  };
}

globalThis.__studioFxParityPlaneB = { renderWithStudioAudioEngine };
