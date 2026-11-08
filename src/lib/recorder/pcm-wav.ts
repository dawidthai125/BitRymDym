import { TAKE_AUDIO_MAX_BYTES } from "@/config/recording";

/** Desktop recorder sample rate. One channel, 16-bit PCM. */
export const RECORDER_SAMPLE_RATE = 48_000;

const WAV_HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Mono PCM WAV that the existing take upload accepts (`audio/wav`).
 * The browser recorder stays on MediaRecorder. This is only the desktop file.
 */
export function encodePcm16Wav(samples: Int16Array, sampleRate: number): Uint8Array {
  if (samples.length < 1) {
    throw new Error("Nagranie jest puste.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error("sampleRate musi być całkowity, od 8000 do 96000.");
  }
  const dataBytes = samples.length * 2;
  const totalBytes = WAV_HEADER_BYTES + dataBytes;
  if (totalBytes > TAKE_AUDIO_MAX_BYTES) {
    throw new Error("Plik jest za duży lub ma nieprawidłowy rozmiar.");
  }
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(WAV_HEADER_BYTES + i * 2, samples[i] ?? 0, true);
  }
  return new Uint8Array(buffer);
}

export function wavDurationSeconds(samples: Int16Array, sampleRate: number): number {
  if (samples.length < 1 || sampleRate < 1) {
    throw new Error("Nagranie jest puste.");
  }
  return samples.length / sampleRate;
}
