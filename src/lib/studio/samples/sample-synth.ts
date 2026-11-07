/**
 * BitRymDym synth samples. Browser and tests share this renderer.
 * These are synthesized tones, not a licensed acoustic instrument library.
 */

import {
  SAMPLE_MAX_MS,
  SAMPLE_MIN_MS,
  instrumentKind,
  isSampleInstrumentId,
  type SampleInstrumentId,
  type SampleKind,
} from "@/lib/studio/samples/sample-policy";

export const SAMPLE_RATE = 44_100;

export const SAMPLE_NOTES = [
  { id: "C2", midi: 36 },
  { id: "E2", midi: 40 },
  { id: "A2", midi: 45 },
  { id: "C3", midi: 48 },
  { id: "E3", midi: 52 },
  { id: "A3", midi: 57 },
  { id: "C4", midi: 60 },
  { id: "E4", midi: 64 },
  { id: "A4", midi: 69 },
  { id: "C5", midi: 72 },
] as const;

export type SampleNoteId = (typeof SAMPLE_NOTES)[number]["id"];

const DURATIONS_MS = [1000, 2000, 4000, 8000] as const;

export function isSampleDurationMs(value: number): boolean {
  return (DURATIONS_MS as readonly number[]).includes(value);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noise(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}

function clampSample(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function renderVoice(
  instrument: SampleInstrumentId,
  hz: number,
  length: number,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(length);
  const nextNoise = noise(instrument.length * 997 + Math.round(hz));
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    if (instrument === "piano") {
      const env = Math.exp(-t * 3.2);
      sample =
        Math.sin(2 * Math.PI * hz * t) * 0.62 +
        Math.sin(2 * Math.PI * hz * 2 * t) * 0.22 * Math.exp(-t * 4) +
        Math.sin(2 * Math.PI * hz * 3 * t) * 0.1 * Math.exp(-t * 6) +
        Math.sin(2 * Math.PI * hz * 4.01 * t) * 0.06 * Math.exp(-t * 8);
      sample *= env;
    } else if (instrument === "bass") {
      const env = Math.min(1, t / 0.02) * Math.exp(-t * 1.4);
      const phase = (hz * t) % 1;
      sample = (Math.sin(2 * Math.PI * hz * t) * 0.75 + (2 * phase - 1) * 0.18) * env;
    } else if (instrument === "lead") {
      const env = Math.min(1, t / 0.03) * Math.exp(-t * 0.7);
      const phase = (hz * t) % 1;
      sample = (2 * phase - 1) * env * 0.55;
    } else if (instrument === "pad") {
      const env = Math.min(1, t / 0.35);
      sample =
        Math.sin(2 * Math.PI * hz * t) * 0.35 +
        Math.sin(2 * Math.PI * hz * 1.005 * t) * 0.28 +
        Math.sin(2 * Math.PI * hz * 0.5 * t) * 0.2;
      sample *= env;
    } else if (instrument === "pluck") {
      const env = Math.exp(-t * 6);
      sample = Math.sin(2 * Math.PI * hz * t) * env + nextNoise() * env * 0.15;
    } else if (instrument === "brass") {
      const env = Math.min(1, t / 0.12) * (0.7 + 0.3 * Math.exp(-t));
      const phase = (hz * t) % 1;
      sample = (2 * phase - 1) * env * 0.4 + Math.sin(2 * Math.PI * hz * t) * env * 0.25;
    } else if (instrument === "kick") {
      const freq = 140 * Math.exp(-t * 10) + 42;
      const env = Math.exp(-t * 8);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
    } else if (instrument === "snare") {
      const env = Math.exp(-t * 10);
      sample = nextNoise() * env * 0.7 + Math.sin(2 * Math.PI * 180 * t) * env * 0.35;
    } else if (instrument === "hat") {
      const env = Math.exp(-t * 28);
      sample = nextNoise() * env * 0.55;
    } else if (instrument === "impact") {
      const env = Math.exp(-t * 4);
      sample = nextNoise() * env * 0.45 + Math.sin(2 * Math.PI * 55 * t) * env * 0.5;
    } else {
      const env = Math.min(1, t / 0.05);
      const sweep = 180 * Math.pow(12, t / (length / sampleRate));
      sample = (Math.sin(2 * Math.PI * sweep * t) * 0.35 + nextNoise() * 0.12) * env;
    }
    out[i] = clampSample(sample);
  }
  return out;
}

/** One note, any length. The sample saver still clamps its own files to 1–30 s. */
export function renderInstrumentVoice(input: {
  instrument: SampleInstrumentId;
  hz: number;
  length: number;
  sampleRate: number;
}): Float32Array {
  const length = Math.floor(input.length);
  if (length <= 0 || !Number.isFinite(input.sampleRate) || input.sampleRate <= 0) {
    return new Float32Array(0);
  }
  return renderVoice(input.instrument, input.hz, length, input.sampleRate);
}

export function renderInstrumentSample(input: {
  instrument: SampleInstrumentId;
  midi: number;
  durationMs: number;
  sampleRate?: number;
}): Float32Array {
  const sampleRate = input.sampleRate ?? SAMPLE_RATE;
  const durationMs = Math.min(SAMPLE_MAX_MS, Math.max(SAMPLE_MIN_MS, input.durationMs));
  const length = Math.round((sampleRate * durationMs) / 1000);
  return renderVoice(input.instrument, midiToHz(input.midi), length, sampleRate);
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = clampSample(samples[i] ?? 0);
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}

export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const text = (start: number, length: number) => {
    let out = "";
    for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[start + i] ?? 0);
    return out;
  };
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.byteLength) {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataSize = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (sampleRate <= 0 || channels <= 0 || bits < 8 || dataSize <= 0) return null;
  const frames = dataSize / (channels * (bits / 8));
  if (!Number.isFinite(frames) || frames <= 0) return null;
  return Math.round((frames / sampleRate) * 1000);
}

export function renderInstrumentWav(input: {
  instrument: string;
  midi: number;
  durationMs: number;
}):
  | {
      ok: true;
      bytes: Uint8Array;
      durationMs: number;
      kind: SampleKind;
      instrument: SampleInstrumentId;
    }
  | { ok: false } {
  if (!isSampleInstrumentId(input.instrument)) return { ok: false };
  if (!Number.isInteger(input.midi) || input.midi < 24 || input.midi > 96) {
    return { ok: false };
  }
  if (!isSampleDurationMs(input.durationMs)) return { ok: false };
  const pcm = renderInstrumentSample({
    instrument: input.instrument,
    midi: input.midi,
    durationMs: input.durationMs,
  });
  const bytes = encodePcm16Wav(pcm, SAMPLE_RATE);
  return {
    ok: true,
    bytes,
    durationMs: input.durationMs,
    kind: instrumentKind(input.instrument),
    instrument: input.instrument,
  };
}
