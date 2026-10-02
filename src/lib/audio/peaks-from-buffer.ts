/**
 * Downsample AudioBuffer channel peaks for BRD Waveform.
 * UI-only — no upload / no Storage.
 */

export function peaksFromAudioBuffer(
  buffer: AudioBuffer,
  barCount: number,
): number[] {
  const count = Math.max(1, Math.floor(barCount));
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / count));
  const peaks: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const start = i * block;
    const end = Math.min(channel.length, start + block);
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      const v = Math.abs(channel[j]!);
      if (v > peak) peak = v;
    }
    peaks.push(Math.max(0.04, Math.min(1, peak)));
  }
  return peaks;
}

export async function peaksFromAudioBlob(
  blob: Blob,
  barCount: number,
  AudioContextCtor: typeof AudioContext = window.AudioContext,
): Promise<number[]> {
  const ctx = new AudioContextCtor();
  try {
    const bytes = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(bytes.slice(0));
    return peaksFromAudioBuffer(audioBuffer, barCount);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
