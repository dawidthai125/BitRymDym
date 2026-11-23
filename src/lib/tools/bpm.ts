/**
 * Tempo helpers (pure, client-safe): tap tempo and a BPM estimate from decoded audio
 * (energy-flux onset envelope + autocorrelation, 60–200 BPM). Runs in the browser;
 * the file never leaves the device.
 */

/** BPM from tap timestamps (ms). Uses the last `window` intervals; null below 2 taps. */
export function tapTempo(times: readonly number[], window = 8): number | null {
  if (times.length < 2) return null;
  const recent = times.slice(-(window + 1));
  const span = recent[recent.length - 1]! - recent[0]!;
  if (span <= 0) return null;
  return Math.round(((recent.length - 1) * 60000) / span * 10) / 10;
}

export type BpmEstimate = { bpm: number; half: number; double: number; confidence: number };

const HOP = 512;

/** Onset strength per hop: positive change of frame energy. */
export function onsetEnvelope(samples: Float32Array, hop = HOP): Float32Array {
  const frames = Math.floor(samples.length / hop);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i++) sum += samples[i]! * samples[i]!;
    energy[f] = Math.sqrt(sum / hop);
  }
  const env = new Float32Array(frames);
  for (let f = 1; f < frames; f++) env[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  return env;
}

export function estimateBpm(samples: Float32Array, sampleRate: number, min = 60, max = 200): BpmEstimate | null {
  const env = onsetEnvelope(samples);
  if (env.length < 64) return null;
  const mean = env.reduce((s, v) => s + v, 0) / env.length;
  for (let i = 0; i < env.length; i++) env[i] = env[i]! - mean;
  const framesPerSec = sampleRate / HOP;
  const minLag = Math.floor((60 * framesPerSec) / max);
  const maxLag = Math.ceil((60 * framesPerSec) / min);
  let best = -Infinity;
  let bestLag = 0;
  let total = 0;
  let n = 0;
  for (let lag = minLag; lag <= maxLag && lag < env.length; lag++) {
    let acc = 0;
    for (let i = lag; i < env.length; i++) acc += env[i]! * env[i - lag]!;
    acc /= env.length - lag;
    // Gentle preference for the 80–160 BPM range rap beats live in.
    const bpm = (60 * framesPerSec) / lag;
    const weight = bpm >= 80 && bpm <= 160 ? 1 : 0.85;
    const score = acc * weight;
    total += Math.max(0, score);
    n++;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || best <= 0) return null;
  // Parabolic refinement around the peak lag.
  const ac = (lag: number) => {
    let acc = 0;
    for (let i = lag; i < env.length; i++) acc += env[i]! * env[i - lag]!;
    return acc / (env.length - lag);
  };
  const y0 = ac(bestLag - 1), y1 = ac(bestLag), y2 = ac(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
  const bpm = Math.round(((60 * framesPerSec) / (bestLag + shift)) * 10) / 10;
  const avg = n ? total / n : 0;
  const confidence = avg > 0 ? Math.min(1, (best / avg - 1) / 4) : 0;
  return { bpm, half: Math.round(bpm * 5) / 10, double: Math.round(bpm * 20) / 10, confidence: Math.round(confidence * 100) / 100 };
}

/** Mix channels to mono and keep at most `seconds` from the middle of the track. */
export function monoExcerpt(channels: readonly Float32Array[], sampleRate: number, seconds = 60): Float32Array {
  const length = channels[0]?.length ?? 0;
  const take = Math.min(length, Math.floor(seconds * sampleRate));
  const start = Math.max(0, Math.floor((length - take) / 2));
  const out = new Float32Array(take);
  for (const ch of channels) for (let i = 0; i < take; i++) out[i] = out[i]! + ch[start + i]! / channels.length;
  return out;
}
