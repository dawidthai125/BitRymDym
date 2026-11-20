/**
 * Admin sample generator — pure part (prompts, lengths, audio shaping; unit-tested).
 * Stable Audio makes the raw sound; we cut a loop to exact bars of the requested tempo,
 * clean a one-shot, set the level, and read the key/note we actually got.
 */

import {
  applyFades,
  dominantNote,
  loopLengthFrames,
  maxBarsFor,
  normalizePeak,
  pitchTrack,
  sliceChannels,
  trimSilence,
} from "@/lib/studio/samples/sample-lab-dsp";
import { SAMPLE_BARS, SAMPLE_MAX_MS, type SampleInstrumentId, type SampleType } from "@/lib/studio/samples/sample-policy";

export type SamplePreset = {
  id: string;
  /** Catalog instrument the sample is filed under. */
  instrument: SampleInstrumentId;
  /** Loops, one-shots or both make sense for this sound. */
  types: readonly ("loop" | "oneshot")[];
  /** English sound description for Stable Audio. */
  sound: string;
  /** Pitched: a loop gets a key, a one-shot a note. Drums and FX are unpitched. */
  pitched: boolean;
  /** Drum loops carry the groove themselves; melodic loops must not. */
  drums?: boolean;
};

export const SAMPLE_PRESETS: readonly SamplePreset[] = [
  { id: "piano", instrument: "piano", types: ["loop", "oneshot"], sound: "felt upright piano playing soulful minor chords", pitched: true },
  { id: "rhodes", instrument: "keys", types: ["loop", "oneshot"], sound: "Rhodes electric piano with warm tremolo playing jazzy seventh chords", pitched: true },
  { id: "strings", instrument: "strings", types: ["loop"], sound: "cinematic string section with legato violins and cellos", pitched: true },
  { id: "pad", instrument: "pad", types: ["loop", "oneshot"], sound: "warm analog synth pad with slow attack", pitched: true },
  { id: "pluck", instrument: "pluck", types: ["loop", "oneshot"], sound: "bright plucked synth bell melody", pitched: true },
  { id: "guitar", instrument: "electric_guitar", types: ["loop"], sound: "clean electric guitar with soft chorus playing a soulful melody", pitched: true },
  { id: "acoustic", instrument: "acoustic_guitar", types: ["loop"], sound: "fingerpicked nylon acoustic guitar", pitched: true },
  { id: "bass808", instrument: "bass", types: ["loop", "oneshot"], sound: "deep 808 sub bass with short glides", pitched: true },
  { id: "bassline", instrument: "live_bass", types: ["loop"], sound: "funky electric bass guitar groove", pitched: true },
  { id: "brass", instrument: "brass", types: ["loop", "oneshot"], sound: "punchy brass section stabs", pitched: true },
  { id: "flute", instrument: "flute", types: ["loop"], sound: "breathy flute melody", pitched: true },
  { id: "sax", instrument: "sax", types: ["loop"], sound: "smooth tenor saxophone phrase", pitched: true },
  { id: "choir", instrument: "vocal", types: ["loop", "oneshot"], sound: "wordless soul choir vocal chop, ooh and aah only, no words", pitched: true },
  { id: "boombap", instrument: "drums", types: ["loop"], sound: "dusty boom bap drum break with punchy kick, crisp snare and swung hi-hats", pitched: false, drums: true },
  { id: "trapdrums", instrument: "drums", types: ["loop"], sound: "modern trap drums with hard kick, sharp clap and fast hi-hat rolls", pitched: false, drums: true },
  { id: "hats", instrument: "hat", types: ["loop"], sound: "trap hi-hat pattern with 1/16 notes and triplet rolls", pitched: false, drums: true },
  { id: "kick", instrument: "kick", types: ["oneshot"], sound: "punchy hip-hop kick drum", pitched: false },
  { id: "snare", instrument: "snare", types: ["oneshot"], sound: "crisp boom bap snare drum", pitched: false },
  { id: "clap", instrument: "snare", types: ["oneshot"], sound: "tight layered trap clap", pitched: false },
  { id: "openhat", instrument: "hat", types: ["oneshot"], sound: "open hi-hat", pitched: false },
  { id: "perc", instrument: "perc", types: ["loop", "oneshot"], sound: "shaker and conga percussion", pitched: false, drums: true },
  { id: "impact", instrument: "impact", types: ["oneshot"], sound: "cinematic boom impact hit", pitched: false },
  { id: "riser", instrument: "riser", types: ["oneshot"], sound: "white noise riser sweep", pitched: false },
  { id: "vinyl", instrument: "fx", types: ["loop"], sound: "vinyl crackle and tape hiss texture", pitched: false },
];

export function findSamplePreset(id: unknown): SamplePreset | null {
  return SAMPLE_PRESETS.find((p) => p.id === id) ?? null;
}

export type SampleGenRequest = {
  preset: SamplePreset;
  type: "loop" | "oneshot";
  bpm: number | null;
  bars: number | null;
  /** "Am", "F#" for a loop; "A2"/"F1" or "A" for a one-shot. */
  key: string | null;
  /** Free style words from the admin (English or Polish, short). */
  style: string;
};

const KEY_NAMES: Record<string, string> = { m: "minor" };

export function keyPhrase(key: string | null): string {
  if (!key) return "";
  const m = /^([A-G]#?)(m)?(\d)?$/.exec(key.trim());
  if (!m) return "";
  if (m[3]) return `tuned to ${m[1]}${m[3]}`;
  return `in ${m[1]} ${m[2] ? KEY_NAMES.m : "major"}`;
}

/** Loop length in seconds for whole bars of 4/4. */
export function loopSeconds(bpm: number, bars: number): number {
  return (bars * 4 * 60) / bpm;
}

/** Stable Audio gets a little more than the loop so the cut never runs out of audio. */
export function generationSeconds(req: { type: "loop" | "oneshot"; bpm: number | null; bars: number | null }): number {
  if (req.type === "oneshot" || !req.bpm || !req.bars) return 4;
  return Math.min(30, Math.ceil(loopSeconds(req.bpm, req.bars) + 3));
}

/** Validate the admin's request; returns the reason in Polish when it cannot be made. */
export function checkSampleRequest(req: SampleGenRequest): string | null {
  if (!req.preset.types.includes(req.type)) return "Ten instrument nie ma takiego typu sampla.";
  if (req.type === "loop") {
    if (!req.bpm || req.bpm < 60 || req.bpm > 180) return "Pętla potrzebuje tempa 60–180 BPM.";
    if (!req.bars || !(SAMPLE_BARS as readonly number[]).includes(req.bars)) return "Wybierz długość pętli w taktach.";
    if (req.bars > maxBarsFor(req.bpm, SAMPLE_MAX_MS / 1000)) return "Pętla byłaby dłuższa niż 30 s. Wybierz mniej taktów.";
  }
  if (req.style.length > 200) return "Styl może mieć do 200 znaków.";
  return null;
}

/** English Stable Audio prompt. One instrument, no vocals with words, starts on the downbeat. */
export function buildSamplePrompt(req: SampleGenRequest): string {
  const style = req.style.replace(/\s+/g, " ").trim();
  const key = req.preset.pitched ? keyPhrase(req.key) : "";
  if (req.type === "oneshot") {
    return [
      `Single ${req.preset.sound} one-shot sample`,
      key,
      style,
      "one isolated hit, dry, starts instantly, short natural decay, then silence, no melody, no other instruments, no vocals.",
    ]
      .filter(Boolean)
      .join(", ");
  }
  return [
    `Hip-hop sample loop: solo ${req.preset.sound}`,
    key,
    `${req.bpm} BPM`,
    `${req.bars} bars of 4/4`,
    style,
    req.preset.drums
      ? "drums only, no melody, no bass, no vocals"
      : "this instrument alone, no drums, no percussion, no bass unless it is the instrument, no vocals with words",
    "starts exactly on the downbeat with no intro, steady tempo, clean close recording, seamless loop.",
  ]
    .filter(Boolean)
    .join(", ");
}

const ONSET_DB = -36;

/** Cut an exact N-bar loop from the generated audio, from its first real sound. */
export function shapeLoop(channels: Float32Array[], sampleRate: number, bpm: number, bars: number): Float32Array[] | null {
  const frames = loopLengthFrames(bpm, bars, sampleRate);
  const { start } = trimSilence(channels, sampleRate, ONSET_DB, 0);
  const from = Math.max(0, start);
  if ((channels[0]?.length ?? 0) - from < frames) {
    // Not enough audio after the onset: take the loop from the very start if that fits.
    if ((channels[0]?.length ?? 0) < frames) return null;
    const cut = sliceChannels(channels, 0, frames);
    applyFades(cut, sampleRate, 3, 8);
    normalizePeak(cut, -1);
    return cut;
  }
  const cut = sliceChannels(channels, from, from + frames);
  applyFades(cut, sampleRate, 3, 8);
  normalizePeak(cut, -1);
  return cut;
}

/** One hit: trim silence, keep up to 2.5 s with a fade-out, at least 1.02 s (catalog minimum). */
export function shapeOneShot(channels: Float32Array[], sampleRate: number): Float32Array[] | null {
  const { start, end } = trimSilence(channels, sampleRate, -50, 5);
  if (end <= start) return null;
  const maxFrames = Math.round(2.5 * sampleRate);
  const minFrames = Math.ceil(1.02 * sampleRate);
  const cut = sliceChannels(channels, start, Math.min(end, start + maxFrames));
  applyFades(cut, sampleRate, 1, 60);
  normalizePeak(cut, -1);
  if ((cut[0]?.length ?? 0) >= minFrames) return cut;
  return cut.map((ch) => {
    const padded = new Float32Array(minFrames);
    padded.set(ch);
    return padded;
  });
}

/** Note of a pitched one-shot ("A1"), from the pitch track; null when unpitched. */
export function oneShotNote(mono: Float32Array, sampleRate: number): string | null {
  return dominantNote(pitchTrack(mono, sampleRate));
}

/** Short Polish-free catalog title, e.g. "Rhodes Am 90 #2". */
export function sampleTitle(presetLabel: string, req: { type: SampleType | "loop" | "oneshot"; bpm: number | null; key: string | null }, n: number): string {
  const parts = [presetLabel, req.key, req.type === "loop" && req.bpm ? `${req.bpm}` : null].filter(Boolean);
  return `${parts.join(" ")} #${n}`.slice(0, 80);
}

/** Untrusted JSON from the admin form → a request, or a Polish reason. */
export function parseSampleGenBody(body: unknown): { ok: true; req: SampleGenRequest } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const preset = findSamplePreset(b.preset);
  if (!preset) return { ok: false, error: "Wybierz instrument." };
  const type = b.type === "oneshot" ? "oneshot" : "loop";
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
  const bpm = Number.isFinite(num(b.bpm)) ? Math.round(num(b.bpm)) : null;
  const bars = Number.isFinite(num(b.bars)) ? Math.round(num(b.bars)) : null;
  const key = typeof b.key === "string" && /^[A-G]#?(m|\d)?$/.test(b.key.trim()) ? b.key.trim() : null;
  const style = typeof b.style === "string" ? b.style.replace(/[\u0000-\u001f]/g, " ").trim() : "";
  const req: SampleGenRequest = { preset, type, bpm: type === "loop" ? bpm : null, bars: type === "loop" ? bars : null, key, style };
  const problem = checkSampleRequest(req);
  return problem ? { ok: false, error: problem } : { ok: true, req };
}

/** 16-bit PCM WAV → float channels. Null when it is not that format. */
export function decodeWav16(bytes: Uint8Array): { channels: Float32Array[]; sampleRate: number } | null {
  if (bytes.byteLength < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let off = 12;
  let fmt: { ch: number; sr: number; bits: number; format: number } | null = null;
  while (off + 8 <= bytes.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") fmt = { format: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    else if (id === "data") {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16 || fmt.ch < 1 || fmt.ch > 2) return null;
      const frames = Math.floor(Math.min(size, bytes.byteLength - body) / (2 * fmt.ch));
      const channels = Array.from({ length: fmt.ch }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.ch; c++) channels[c]![i] = v.getInt16(body + (i * fmt.ch + c) * 2, true) / 32768;
      return { channels, sampleRate: fmt.sr };
    }
    off = body + size + (size % 2);
  }
  return null;
}
