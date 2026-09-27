/**
 * Pure PCM/WAV helpers for synthetic BPM fixtures (tooling only).
 */

export function encodeMonoWavPcm16(
  samples: Float32Array,
  sampleRate: number,
): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buffer;
}

/**
 * Deterministic kick-like transient on each beat (not a pure sine).
 * Steady tempo, no BPM jitter.
 *
 * Onset detectors need a non-zero attack: a pure sin(0)=0 start plus
 * an over-aggressive decay collapses to silence — keep a short broadband
 * click + decaying low body (~12–15 ms).
 */
export function generateKickClickTrack(params: {
  bpm: number;
  durationSeconds: number;
  sampleRate: number;
}): Float32Array {
  const { bpm, durationSeconds, sampleRate } = params;
  if (!(bpm > 0) || !(durationSeconds > 0) || !(sampleRate > 0)) {
    throw new Error("Invalid generateKickClickTrack params");
  }

  const n = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(n);
  const periodSec = 60 / bpm;
  const clickLen = Math.max(1, Math.round(sampleRate * 0.015)); // ~15 ms
  const tau = 0.005; // 5 ms exponential decay time constant

  for (let beatSec = 0; beatSec < durationSeconds + 1e-12; beatSec += periodSec) {
    const start = Math.floor(beatSec * sampleRate);
    for (let k = 0; k < clickLen; k++) {
      const i = start + k;
      if (i >= n) break;
      const t = k / sampleRate;
      const env = Math.exp(-t / tau);
      // Sharp attack (non-zero at t=0) + kick-like body; no extra harmonics
      const attack = k === 0 ? 0.95 : 0;
      const body = Math.sin(2 * Math.PI * 55 * t + 0.35);
      samples[i] = Math.max(samples[i]!, env * (attack + 0.45 * body));
    }
  }

  return samples;
}
