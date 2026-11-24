/** Browser WAV writer (16-bit PCM, 1–2 channels) for the free tools. Pure. */
export function encodeWav16(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const data = frames * count * 2;
  const buffer = new ArrayBuffer(44 + data);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(at, Math.round(s * 32767), true);
      at += 2;
    }
  }
  return buffer;
}

/** Scales in place so the loudest sample is at most `ceiling` (never louder than it was). Returns the gain used. */
export function limitPeak(channels: readonly Float32Array[], ceiling = 0.97): number {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  if (peak <= ceiling) return 1;
  const gain = ceiling / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] = ch[i]! * gain;
  return gain;
}
