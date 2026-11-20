/**
 * Sampek — deterministic note fixes for "Graj" recordings (pure, client + server, unit-tested).
 * Every fix returns a NEW session plus short Polish lines that say what changed.
 */

import {
  DRUM_KITS,
  PLAY_BEATS_PER_BAR,
  PLAY_MAX_LAYERS,
  PLAY_MAX_NOTES_PER_LAYER,
  SAMPLED_INSTRUMENTS,
  SYNTHS,
  sessionBeats,
  type PlayInstrumentId,
  type PlayLayer,
  type PlayNote,
  type PlaySession,
  type SampekResult,
} from "@/lib/studio/play/play-types";

export const QUANTIZE_GRIDS = ["1/4", "1/8", "1/16", "1/8T"] as const;
export type QuantizeGrid = (typeof QUANTIZE_GRIDS)[number];

const GRID_BEATS: Record<QuantizeGrid, number> = { "1/4": 1, "1/8": 0.5, "1/16": 0.25, "1/8T": 1 / 3 };
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
// Krumhansl–Kessler profiles.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const EPS = 1e-6;
/** Notes shorter than this (1/32) are treated as mis-hits and lengthened. */
export const MIN_NOTE_BEATS = 0.125;
/** Same note within this distance counts as a double hit. */
const DOUBLE_HIT_BEATS = 0.04;

const ALL_INSTRUMENTS: readonly string[] = [...SAMPLED_INSTRUMENTS, ...DRUM_KITS, ...SYNTHS];

export function isDrumLayer(layer: Pick<PlayLayer, "instrument">): boolean {
  return (DRUM_KITS as readonly string[]).includes(layer.instrument);
}

function round(n: number, step = 1e-4): number {
  return Math.round(n / step) * step;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function copySession(s: PlaySession): PlaySession {
  return { ...s, layers: s.layers.map((l) => ({ ...l, notes: l.notes.map((n) => ({ ...n })), synth: l.synth ? { ...l.synth } : undefined })) };
}

function sortNotes(notes: PlayNote[]): PlayNote[] {
  return notes.sort((a, b) => a.t - b.t || a.n - b.n);
}

/** Polish plural for "nuta". */
export function nutLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return "nutę";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "nuty";
  return "nut";
}

function inLayers(_s: PlaySession, layerIds?: readonly string[]): (l: PlayLayer) => boolean {
  return (l) => !layerIds || layerIds.length === 0 || layerIds.includes(l.id);
}

/* ---------------- quantize ---------------- */

export function quantize(
  session: PlaySession,
  opts: { grid: QuantizeGrid; strength: number; layerIds?: string[] },
): SampekResult {
  const s = copySession(session);
  const total = sessionBeats(s);
  const g = GRID_BEATS[opts.grid];
  const k = clamp(opts.strength, 0, 100) / 100;
  let moved = 0;
  for (const layer of s.layers.filter(inLayers(s, opts.layerIds))) {
    for (const note of layer.notes) {
      const target = Math.round(note.t / g) * g;
      let t = note.t + (target - note.t) * k;
      // A note pulled onto the loop end belongs to the next loop start.
      if (t >= total - EPS) t -= total;
      if (t < 0) t = 0;
      t = round(t);
      if (Math.abs(t - note.t) > EPS) moved++;
      note.t = t;
      if (!isDrumLayer(layer) && k >= 0.99) {
        // Full strength also squares the note length to the grid (at least one step).
        note.d = round(Math.max(g, Math.round(note.d / g) * g));
      }
    }
    sortNotes(layer.notes);
  }
  const changes = moved
    ? [`Wyrównałem ${moved} ${nutLabel(moved)} do siatki ${opts.grid} (siła ${Math.round(k * 100)}%).`]
    : [`Wszystkie nuty już leżą na siatce ${opts.grid}.`];
  return { session: s, changes };
}

/* ---------------- swing ---------------- */

export function setSwing(session: PlaySession, amount: number): SampekResult {
  const s = copySession(session);
  const before = s.swing;
  s.swing = round(clamp(amount, 0, 0.6), 0.01);
  const pct = Math.round(s.swing * 100);
  return {
    session: s,
    changes: [
      Math.abs(before - s.swing) < 0.005
        ? `Swing bez zmian (${pct}%).`
        : s.swing === 0
          ? "Wyłączyłem swing: równe ósemki i szesnastki."
          : `Ustawiłem swing ${pct}%: co druga szesnastka gra trochę później.`,
    ],
  };
}

/* ---------------- key ---------------- */

function correlate(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Key of the melodic layers (Krumhansl, pitch classes weighted by length × velocity). */
export function detectKey(session: PlaySession): { key: string; confidence: number } | null {
  const hist = new Array(12).fill(0) as number[];
  let notes = 0;
  for (const layer of session.layers) {
    if (isDrumLayer(layer) || layer.muted) continue;
    for (const n of layer.notes) {
      hist[((n.n % 12) + 12) % 12]! += Math.max(0.0625, n.d) * Math.max(0.1, n.v);
      notes++;
    }
  }
  if (notes < 3 || hist.filter((v) => v > 0).length < 2) return null;
  const scores: { key: string; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - tonic + 12) % 12]!);
    scores.push({ key: NOTE_NAMES[tonic]!, r: correlate(hist, rot(KK_MAJOR)) });
    scores.push({ key: `${NOTE_NAMES[tonic]}m`, r: correlate(hist, rot(KK_MINOR)) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0]!;
  const second = scores[1]!;
  return { key: best.key, confidence: round(clamp(best.r * 0.7 + (best.r - second.r) * 3, 0, 1), 0.01) };
}

export function parseKey(key: string | null | undefined): { pc: number; minor: boolean } | null {
  if (!key) return null;
  const m = /^([A-G])(#|b)?(m)?$/.exec(key.trim());
  if (!m) return null;
  const base = NOTE_NAMES.indexOf(m[1] as (typeof NOTE_NAMES)[number]);
  const pc = (base + (m[2] === "#" ? 1 : m[2] === "b" ? 11 : 0)) % 12;
  return { pc, minor: m[3] === "m" };
}

export function keyLabelPl(key: string): string {
  const k = parseKey(key);
  if (!k) return key;
  return `${NOTE_NAMES[k.pc]}-${k.minor ? "moll" : "dur"}`;
}

export function scalePitchClasses(key: string): Set<number> | null {
  const k = parseKey(key);
  if (!k) return null;
  return new Set((k.minor ? MINOR_SCALE : MAJOR_SCALE).map((i) => (i + k.pc) % 12));
}

/** Out-of-key notes of melodic layers move to the nearest scale note (ties go down). */
export function snapToKey(session: PlaySession, key?: string | null): SampekResult {
  const s = copySession(session);
  const detected = key || s.key || detectKey(s)?.key || null;
  if (!detected) return { session: s, changes: ["Za mało nut, żeby rozpoznać tonację. Zagraj więcej albo wybierz tonację."] };
  const scale = scalePitchClasses(detected);
  if (!scale) return { session: s, changes: ["Nie znam tej tonacji."] };
  let fixed = 0;
  for (const layer of s.layers) {
    if (isDrumLayer(layer)) continue;
    for (const note of layer.notes) {
      const pc = ((note.n % 12) + 12) % 12;
      if (scale.has(pc)) continue;
      note.n = scale.has((pc + 11) % 12) ? note.n - 1 : note.n + 1;
      fixed++;
    }
    sortNotes(layer.notes);
  }
  const changedKey = s.key !== detected;
  s.key = detected;
  const changes: string[] = [];
  if (changedKey) changes.push(`Tonacja: ${keyLabelPl(detected)}.`);
  changes.push(fixed ? `Poprawiłem ${fixed} ${nutLabel(fixed)} spoza tonacji na najbliższe dźwięki skali.` : "Wszystkie nuty są w tonacji.");
  return { session: s, changes };
}

/* ---------------- dynamics ---------------- */

/** Pull velocities toward the layer mean (amount 0 = no change, 1 = all equal). */
export function evenDynamics(session: PlaySession, amount = 0.5, layerIds?: string[]): SampekResult {
  const s = copySession(session);
  const a = clamp(amount, 0, 1);
  let touched = 0;
  let spreadBefore = 0;
  let spreadAfter = 0;
  for (const layer of s.layers.filter(inLayers(s, layerIds))) {
    if (layer.notes.length < 2) continue;
    const mean = layer.notes.reduce((x, n) => x + n.v, 0) / layer.notes.length;
    const vs = layer.notes.map((n) => n.v);
    spreadBefore = Math.max(spreadBefore, Math.max(...vs) - Math.min(...vs));
    for (const note of layer.notes) {
      const v = round(clamp(mean + (note.v - mean) * (1 - a), 0.05, 1), 0.01);
      if (Math.abs(v - note.v) > 0.005) touched++;
      note.v = v;
    }
    const after = layer.notes.map((n) => n.v);
    spreadAfter = Math.max(spreadAfter, Math.max(...after) - Math.min(...after));
  }
  return {
    session: s,
    changes: touched
      ? [`Wyrównałem siłę ${touched} ${nutLabel(touched)}: rozrzut z ${Math.round(spreadBefore * 100)}% do ${Math.round(spreadAfter * 100)}%.`]
      : ["Dynamika jest już równa."],
  };
}

/* ---------------- humanize ---------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small deterministic timing/velocity jitter, so a quantized loop does not sound robotic. */
export function humanize(
  session: PlaySession,
  opts: { seed?: number; timing?: number; velocity?: number; layerIds?: string[] } = {},
): SampekResult {
  const s = copySession(session);
  const rnd = mulberry32(opts.seed ?? 1234);
  const timing = clamp(opts.timing ?? 0.02, 0, 0.1);
  const vel = clamp(opts.velocity ?? 0.08, 0, 0.3);
  const total = sessionBeats(s);
  let n = 0;
  for (const layer of s.layers.filter(inLayers(s, opts.layerIds))) {
    for (const note of layer.notes) {
      const dt = (rnd() * 2 - 1) * timing;
      note.t = round(clamp(note.t + (note.t + dt < 0 ? 0 : dt), 0, total - 0.001));
      note.v = round(clamp(note.v + (rnd() * 2 - 1) * vel, 0.05, 1), 0.01);
      n++;
    }
    sortNotes(layer.notes);
  }
  return {
    session: s,
    changes: n
      ? [`Dodałem lekkie, ludzkie niedokładności do ${n} ${nutLabel(n)} (czas ±${Math.round(timing * 1000) / 10}% ćwierćnuty, siła ±${Math.round(vel * 100)}%).`]
      : ["Brak nut do uczłowieczenia."],
  };
}

/* ---------------- clean up / fit into the loop ---------------- */

export function cleanUp(session: PlaySession, opts: { overflow?: "wrap" | "drop" } = {}): SampekResult {
  const s = copySession(session);
  const total = sessionBeats(s);
  const mode = opts.overflow ?? "wrap";
  let wrapped = 0;
  let dropped = 0;
  let doubles = 0;
  let lengthened = 0;
  let clipped = 0;
  for (const layer of s.layers) {
    const kept: PlayNote[] = [];
    for (const raw of layer.notes) {
      const note = { ...raw };
      if (note.t >= total - EPS || note.t < 0) {
        if (mode === "wrap") {
          note.t = round(((note.t % total) + total) % total);
          wrapped++;
        } else {
          dropped++;
          continue;
        }
      }
      if (!isDrumLayer(layer)) {
        if (note.d < MIN_NOTE_BEATS) {
          note.d = MIN_NOTE_BEATS;
          lengthened++;
        }
        if (note.t + note.d > total + EPS) {
          note.d = round(Math.max(MIN_NOTE_BEATS, total - note.t));
          clipped++;
        }
      }
      kept.push(note);
    }
    sortNotes(kept);
    const out: PlayNote[] = [];
    for (const note of kept) {
      const dup = out.find((o) => o.n === note.n && Math.abs(o.t - note.t) < DOUBLE_HIT_BEATS);
      if (dup) {
        doubles++;
        if (note.v > dup.v) dup.v = note.v;
        dup.d = Math.max(dup.d, note.d);
        continue;
      }
      out.push(note);
    }
    if (out.length > PLAY_MAX_NOTES_PER_LAYER) {
      dropped += out.length - PLAY_MAX_NOTES_PER_LAYER;
      out.length = PLAY_MAX_NOTES_PER_LAYER;
    }
    layer.notes = out;
  }
  const changes: string[] = [];
  if (wrapped) changes.push(`Przeniosłem ${wrapped} ${nutLabel(wrapped)} spoza pętli na jej początek.`);
  if (dropped) changes.push(`Usunąłem ${dropped} ${nutLabel(dropped)} poza pętlą.`);
  if (doubles) changes.push(`Usunąłem ${doubles} ${doubles === 1 ? "podwójne uderzenie" : "podwójnych uderzeń"}.`);
  if (lengthened) changes.push(`Wydłużyłem ${lengthened} ${nutLabel(lengthened)} zagranych za krótko.`);
  if (clipped) changes.push(`Skróciłem ${clipped} ${nutLabel(clipped)} wystających za koniec pętli.`);
  if (!changes.length) changes.push("Nagranie jest czyste: nic do sprzątania.");
  return { session: s, changes };
}

/** Clean up, set the key and snap stray notes, then quantize to 1/16 at 75%. */
export function quickFix(session: PlaySession): SampekResult {
  const a = cleanUp(session);
  const b = snapToKey(a.session);
  const c = quantize(b.session, { grid: "1/16", strength: 75 });
  return { session: c.session, changes: [...a.changes, ...b.changes, ...c.changes].filter((l) => !/^(Nagranie jest czyste|Wszystkie nuty)/.test(l)) };
}

/* ---------------- untrusted input ---------------- */

const WAVES = ["sine", "triangle", "sawtooth", "square"] as const;

function parseSynth(input: unknown): PlayLayer["synth"] | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);
  return {
    wave: (WAVES as readonly string[]).includes(String(o.wave)) ? (o.wave as (typeof WAVES)[number]) : "sawtooth",
    cutoff: num(o.cutoff, 40, 20000, 4000),
    resonance: num(o.resonance, 0, 20, 1),
    attack: num(o.attack, 0, 5, 0.01),
    release: num(o.release, 0, 10, 0.3),
    glide: num(o.glide, 0, 2, 0),
    detune: num(o.detune, -100, 100, 0),
  };
}

/** Validate a session sent by the browser. Null when it is not usable. */
export function parsePlaySession(input: unknown): PlaySession | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const bpm = Number(raw.bpm);
  const bars = Number(raw.bars);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return null;
  if (![1, 2, 4, 8, 16].includes(bars)) return null;
  const total = bars * PLAY_BEATS_PER_BAR;
  const key = typeof raw.key === "string" && parseKey(raw.key) ? raw.key : null;
  const swing = clamp(Number(raw.swing) || 0, 0, 0.6);
  if (!Array.isArray(raw.layers) || raw.layers.length > PLAY_MAX_LAYERS) return null;
  const layers: PlayLayer[] = [];
  for (const l of raw.layers) {
    if (!l || typeof l !== "object") return null;
    const layer = l as Record<string, unknown>;
    if (typeof layer.id !== "string" || layer.id.length > 40) return null;
    if (typeof layer.instrument !== "string" || !ALL_INSTRUMENTS.includes(layer.instrument)) return null;
    if (!Array.isArray(layer.notes) || layer.notes.length > PLAY_MAX_NOTES_PER_LAYER) return null;
    const notes: PlayNote[] = [];
    for (const n of layer.notes) {
      const o = (n ?? {}) as Record<string, unknown>;
      const t = Number(o.t);
      const d = Number(o.d);
      const nn = Number(o.n);
      const v = Number(o.v);
      if (![t, d, nn, v].every(Number.isFinite)) return null;
      if (t < 0 || t > total * 2 || d <= 0 || d > total || nn < 0 || nn > 127 || !Number.isInteger(nn)) return null;
      notes.push({ t, d, n: nn, v: clamp(v, 0, 1) });
    }
    layers.push({
      id: layer.id,
      instrument: layer.instrument as PlayInstrumentId,
      notes,
      gain: clamp(Number(layer.gain) || 1, 0, 1.5),
      muted: layer.muted === true,
      ...(parseSynth(layer.synth) ? { synth: parseSynth(layer.synth)! } : {}),
    });
  }
  return {
    bpm,
    bars,
    key,
    swing,
    layers,
    beatId: typeof raw.beatId === "string" ? raw.beatId : null,
  };
}
