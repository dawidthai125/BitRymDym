import { MOOD_COVERS } from "@/lib/studio/video/ai-cover/moods";

type MoodId = (typeof MOOD_COVERS)[number]["id"];

function cover(moodId: MoodId): { moodId: MoodId; prompt: string } {
  const mood = MOOD_COVERS.find((item) => item.id === moodId);
  if (!mood) throw new Error(`Unknown mood ${moodId}`);
  return { moodId: mood.id, prompt: mood.prompt };
}

/** Loudest window's spectral centroid and peak. Does not call a model. */
export function audioFeaturesFromPcm(
  samples: Float32Array,
  sampleRate: number,
): { centroidHz: number; peakDb: number } {
  const n = Math.min(1024, samples.length);
  if (n < 64 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { centroidHz: 0, peakDb: -120 };
  }
  const scan = Math.min(samples.length, Math.floor(sampleRate * 20));
  let peak = 0;
  let loudAt = 0;
  for (let i = 0; i < scan; i += 1) {
    const a = Math.abs(samples[i] ?? 0);
    if (a > peak) {
      peak = a;
      loudAt = i;
    }
  }
  const peakDb = peak > 1e-8 ? 20 * Math.log10(Math.min(1, peak)) : -120;
  const start = Math.max(0, Math.min(samples.length - n, loudAt - (n >> 1)));
  const bins = n >> 1;
  let magSum = 0;
  let weighted = 0;
  for (let k = 1; k < bins; k += 1) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i += 1) {
      const s = samples[start + i] ?? 0;
      re += s * Math.cos(w * i);
      im -= s * Math.sin(w * i);
    }
    const mag = Math.hypot(re, im);
    magSum += mag;
    weighted += mag * ((k * sampleRate) / n);
  }
  return { centroidHz: magSum > 0 ? weighted / magSum : 0, peakDb };
}

/** Maps rough audio features to an existing cover mood. Does not call image providers. */
export function coverPromptFromAudio(features: {
  centroidHz: number;
  peakDb: number;
}): { moodId: MoodId; prompt: string } {
  const { centroidHz, peakDb } = features;
  const loud = peakDb > -6;
  const quiet = peakDb <= -6;
  if (centroidHz > 2500 && loud) {
    return cover(centroidHz >= 4000 ? "street" : "night");
  }
  if (centroidHz < 800 && quiet) {
    return cover(centroidHz < 400 ? "calm" : "dark");
  }
  return cover("gold");
}
