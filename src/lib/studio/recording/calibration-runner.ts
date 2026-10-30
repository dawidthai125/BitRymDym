/**
 * Browser side of latency calibration: play clicks on the Studio AudioContext,
 * capture them through the same TakeMediaRecorder the takes use, decode and
 * measure. Pure math lives in ./latency.
 */

import {
  CLAP_CALIBRATION,
  CLICK_CALIBRATION,
  calibrationClickTimesMs,
  measureLatency,
  renderCalibrationClick,
  type LatencyMeasurement,
} from "@/lib/studio/recording/latency";
import { TakeMediaRecorder } from "@/lib/takes/media-recorder";

export type CalibrationMode = "click" | "clap";

type Ctx = AudioContext;

function scheduleClicks(ctx: Ctx, atCtxTimes: number[], amplitude: number): () => void {
  const pcm = renderCalibrationClick(ctx.sampleRate, amplitude);
  const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buffer.copyToChannel(pcm, 0);
  const nodes = atCtxTimes.map((t) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(t);
    return src;
  });
  return () =>
    nodes.forEach((n) => {
      try {
        n.stop();
        n.disconnect();
      } catch {
        // already finished
      }
    });
}

async function decodeMono(ctx: Ctx, blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i += 1) out[i]! += ch[i]! / buf.numberOfChannels;
  }
  return { samples: out, sampleRate: buf.sampleRate };
}

export type CalibrationProgress = { beat: number; total: number };

export async function runLatencyCalibration(params: {
  ctx: Ctx;
  mode: CalibrationMode;
  audioDeviceId?: string;
  onProgress?: (p: CalibrationProgress) => void;
  signal?: AbortSignal;
}): Promise<LatencyMeasurement> {
  const { ctx, mode } = params;
  const cfg = mode === "click" ? CLICK_CALIBRATION : CLAP_CALIBRATION;
  if (ctx.state !== "running") await ctx.resume();
  const recorder = new TakeMediaRecorder();
  await recorder.start({ audioDeviceId: params.audioDeviceId || undefined, rawAudio: true });
  let cancelClicks: (() => void) | null = null;
  try {
    const recT0 = (await recorder.waitForStarted()) ?? performance.now();
    // Map ctx clock → performance clock at one instant.
    const perfNow = performance.now();
    const ctxNow = ctx.currentTime;
    const elapsedSinceStart = perfNow - recT0;
    const times = calibrationClickTimesMs(cfg.count, cfg.firstMs, cfg.spacingMs);
    // times are relative to the recording start → ctx times.
    const ctxTimes = times.map((ms) => ctxNow + (ms - elapsedSinceStart) / 1000);
    cancelClicks = scheduleClicks(ctx, ctxTimes, mode === "click" ? 0.6 : 0.35);
    const endMs = times[times.length - 1]! + cfg.window.afterMs + 250;
    const t0 = performance.now();
    await new Promise<void>((resolve, reject) => {
      const id = window.setInterval(() => {
        if (params.signal?.aborted) {
          window.clearInterval(id);
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        const rel = performance.now() - recT0;
        const beat = times.filter((t) => t <= rel).length;
        params.onProgress?.({ beat, total: times.length });
        if (performance.now() - t0 >= endMs - elapsedSinceStart) {
          window.clearInterval(id);
          resolve();
        }
      }, 50);
    });
    const result = await recorder.stop();
    const { samples, sampleRate } = await decodeMono(ctx, result.blob);
    const measured = mode === "clap" ? times.slice(CLAP_CALIBRATION.leadIn) : times;
    return measureLatency(samples, sampleRate, measured, {
      window: cfg.window,
      maxSpreadMs: cfg.maxSpreadMs,
      minValidRatio: cfg.minValidRatio,
    });
  } catch (error) {
    void recorder.cancel();
    throw error;
  } finally {
    cancelClicks?.();
  }
}
