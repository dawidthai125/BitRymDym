import { fftMag } from "@/lib/studio/studio-clip-noise";
import { audioFeaturesFromPcm } from "@/lib/studio/video/ai-cover/listen";

export type BeatMeasure = {
  peakDb: number;
  rmsDb: number;
  centroidHz: number;
  suggestion: "hot" | "quiet" | "mud" | "ok";
  lowerByDb: number;
};

const CENTROID_N = 1024;

function hann(i: number, n: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
}

/** Windowed radix-2 centroid. The cover-mood DFT leaks too much to judge bass. */
function centroidHzOf(samples: Float32Array, sampleRate: number): number {
  if (samples.length < CENTROID_N || sampleRate <= 0) return 0;
  const scan = Math.min(samples.length, Math.floor(sampleRate * 20));
  let peak = 0;
  let at = 0;
  for (let i = 0; i < scan; i += 1) {
    const a = Math.abs(samples[i] ?? 0);
    if (a > peak) {
      peak = a;
      at = i;
    }
  }
  const start = Math.max(0, Math.min(samples.length - CENTROID_N, at - (CENTROID_N >> 1)));
  const frame = new Float32Array(CENTROID_N);
  for (let i = 0; i < CENTROID_N; i += 1) frame[i] = (samples[start + i] ?? 0) * hann(i, CENTROID_N);
  const mags = fftMag(frame);
  let magSum = 0;
  let weighted = 0;
  for (let k = 1; k < mags.length; k += 1) {
    const mag = mags[k] ?? 0;
    magSum += mag;
    weighted += mag * ((k * sampleRate) / CENTROID_N);
  }
  return magSum > 0 ? weighted / magSum : 0;
}

/** Peak, RMS and centroid over at most 20 seconds. Does not change the file. */
export function measureBeatWindow(samples: Float32Array, sampleRate: number): BeatMeasure {
  const features = audioFeaturesFromPcm(samples, sampleRate);
  const centroidHz = centroidHzOf(samples, sampleRate);
  const count = Math.min(samples.length, Math.max(0, Math.floor(sampleRate * 20)));
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  const rms = count > 0 ? Math.sqrt(sum / count) : 0;
  const rmsDb = rms > 1e-8 ? 20 * Math.log10(rms) : -120;
  let suggestion: BeatMeasure["suggestion"] = "ok";
  let lowerByDb = 0;
  if (features.peakDb > -1) {
    suggestion = "hot";
    lowerByDb = Math.max(1, Math.round(features.peakDb + 6));
  } else if (features.peakDb < -18 || rmsDb < -24) {
    suggestion = "quiet";
  } else if (centroidHz > 0 && centroidHz < 800) {
    suggestion = "mud";
  }
  return {
    peakDb: features.peakDb,
    rmsDb,
    centroidHz,
    suggestion,
    lowerByDb,
  };
}
