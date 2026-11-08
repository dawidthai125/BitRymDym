/** Canonical mono 16-bit PCM WAV. Used by the clip-noise save path. */

export type WavPcmInfo = {
  sampleRate: number;
  channels: number;
  bits: number;
  dataBytes: number;
};

export function encodeMonoWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error("BAD_SAMPLE_RATE");
  }
  const frames = samples.length;
  const dataBytes = frames * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  writeAscii(out, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(out, 8, "WAVE");
  writeAscii(out, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(out, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < frames; i += 1) {
    const s = samples[i] ?? 0;
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(s) ? s : 0));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return out;
}

/** Reads a canonical header. Does not need the PCM body, only the first 44 bytes. */
export function readCanonicalWavInfo(bytes: Uint8Array): WavPcmInfo | null {
  if (bytes.byteLength < 44) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  if (ascii(bytes, 12, 4) !== "fmt " || ascii(bytes, 36, 4) !== "data") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16, true) !== 16) return null;
  if (view.getUint16(20, true) !== 1) return null;
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  if (channels !== 1 || bits !== 16) return null;
  if (sampleRate < 8000 || sampleRate > 192000) return null;
  if (dataBytes % 2 !== 0) return null;
  return { sampleRate, channels, bits, dataBytes };
}

function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) out[offset + i] = text.charCodeAt(i);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(bytes[offset + i] ?? 0);
  return text;
}
