/**
 * Real piano, guitar, and bass notes. The bytes are passed in.
 * This file does not fetch, read disk, or touch the synthesizer.
 * A missing bank leaves the caller on the existing tone.
 */

export type AcousticInstrument = "piano" | "guitar" | "bass";

export type AcousticNote = {
  root: number;
  rate: number;
  pcm: Float32Array;
  loopStart: number | null;
  loopEnd: number | null;
};

export type AcousticBank = Record<AcousticInstrument, AcousticNote[]>;

export type AcousticCatalogNote = {
  instrument: AcousticInstrument;
  root: number;
  file: string;
  loopStart: number | null;
  loopEnd: number | null;
};

const FILE_NAME = /^[a-z0-9][a-z0-9-]{0,40}\.wav$/;

/** Same equal temperament as midiHz in studio-midi.ts (A4 = 440). */
function noteHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

function emptyBank(): AcousticBank {
  return { piano: [], guitar: [], bass: [] };
}

function isInstrument(value: unknown): value is AcousticInstrument {
  return value === "piano" || value === "guitar" || value === "bass";
}

/** Catalog next to the wav files. Bad rows are skipped. */
export function parseAcousticCatalog(bytes: Uint8Array): AcousticCatalogNote[] {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  if (!json || typeof json !== "object") return [];
  const notes = (json as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return [];
  const out: AcousticCatalogNote[] = [];
  for (const item of notes) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      instrument?: unknown;
      root?: unknown;
      file?: unknown;
      loopStart?: unknown;
      loopEnd?: unknown;
    };
    if (!isInstrument(row.instrument)) continue;
    if (typeof row.root !== "number" || !Number.isInteger(row.root) || row.root < 0 || row.root > 127) continue;
    if (typeof row.file !== "string" || !FILE_NAME.test(row.file)) continue;
    const loopStart = row.loopStart == null ? null : row.loopStart;
    const loopEnd = row.loopEnd == null ? null : row.loopEnd;
    const loops =
      typeof loopStart === "number" && Number.isInteger(loopStart) && loopStart >= 0 &&
      typeof loopEnd === "number" && Number.isInteger(loopEnd) && loopEnd > loopStart;
    out.push({
      instrument: row.instrument,
      root: row.root,
      file: row.file,
      loopStart: loops ? loopStart : null,
      loopEnd: loops ? loopEnd : null,
    });
  }
  return out;
}

/** 16-bit PCM wav, mono or stereo. Other encodings return null. */
export function parseWavPcm16(bytes: Uint8Array): { pcm: Float32Array; rate: number } | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => {
    let out = "";
    for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
    return out;
  };
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") return null;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body > bytes.byteLength) return null;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.byteLength) {
      const format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format !== 1) return null;
    } else if (id === "data") {
      dataOffset = body;
      dataSize = Math.min(size, bytes.byteLength - body);
    }
    offset = body + size + (size % 2);
  }
  if (dataOffset < 0 || rate < 8000 || rate > 192000 || (channels !== 1 && channels !== 2) || bits !== 16) {
    return null;
  }
  const frames = Math.floor(dataSize / (2 * channels));
  if (frames < 2) return null;
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += view.getInt16(dataOffset + (i * channels + ch) * 2, true);
    }
    pcm[i] = sum / channels / 32768;
  }
  return { pcm, rate };
}

export function nearestAcousticNote(notes: readonly AcousticNote[], pitch: number): AcousticNote | null {
  let best: AcousticNote | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const note of notes) {
    const dist = Math.abs(note.root - pitch);
    if (dist < bestDist || (dist === bestDist && best && note.root < best.root)) {
      best = note;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Pitch-shift one recorded note into `length` output samples.
 * Loop points are source-sample indexes. A one-shot fades at its end.
 */
export function renderAcousticNote(input: {
  note: AcousticNote;
  pitch: number;
  length: number;
  sampleRate: number;
}): Float32Array {
  const length = Math.max(0, input.length);
  const out = new Float32Array(length);
  const src = input.note.pcm;
  const n = src.length;
  const step = (noteHz(input.pitch) / noteHz(input.note.root)) * (input.note.rate / input.sampleRate);
  if (n < 2 || !Number.isFinite(step) || step <= 0 || length === 0) return out;
  const loopStart = input.note.loopStart;
  const loopEnd = input.note.loopEnd;
  const canLoop =
    loopStart != null && loopEnd != null &&
    loopStart >= 0 && loopEnd <= n && loopEnd - loopStart >= 8;
  const release = Math.min(length, Math.max(1, Math.floor(input.sampleRate * 0.02)));
  let pos = 0;
  for (let i = 0; i < length; i++) {
    if (canLoop && loopStart != null && loopEnd != null && pos >= loopEnd) {
      const span = loopEnd - loopStart;
      pos = loopStart + ((pos - loopStart) % span);
    }
    if (pos >= n - 1) break;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s0 = src[i0] ?? 0;
    const s1 = src[i0 + 1] ?? s0;
    let env = 1;
    const tail = length - i;
    if (tail < release) env = tail / release;
    if (!canLoop) {
      const remain = (n - 1 - pos) / step;
      if (remain < release) env = Math.min(env, Math.max(0, remain / release));
    }
    out[i] = (s0 + (s1 - s0) * frac) * env;
    pos += step;
  }
  return out;
}

export function acousticVoice(
  bank: AcousticBank | null | undefined,
  instrument: string,
  pitch: number,
  length: number,
  sampleRate: number,
): Float32Array | null {
  if (!bank || !isInstrument(instrument)) return null;
  const note = nearestAcousticNote(bank[instrument], pitch);
  if (!note) return null;
  return renderAcousticNote({ note, pitch, length, sampleRate });
}

/** Read catalog.json, then each wav. A missing file skips that note. */
export async function loadAcousticBank(
  read: (file: string) => Promise<Uint8Array | null>,
): Promise<AcousticBank | null> {
  const catalogBytes = await read("catalog.json");
  if (!catalogBytes) return null;
  const rows = parseAcousticCatalog(catalogBytes);
  if (rows.length === 0) return null;
  const bank = emptyBank();
  for (const row of rows) {
    const bytes = await read(row.file);
    if (!bytes) continue;
    const wav = parseWavPcm16(bytes);
    if (!wav) continue;
    const loopOk =
      row.loopStart != null && row.loopEnd != null &&
      row.loopEnd <= wav.pcm.length;
    bank[row.instrument].push({
      root: row.root,
      rate: wav.rate,
      pcm: wav.pcm,
      loopStart: loopOk ? row.loopStart : null,
      loopEnd: loopOk ? row.loopEnd : null,
    });
  }
  if (bank.piano.length + bank.guitar.length + bank.bass.length === 0) return null;
  return bank;
}
