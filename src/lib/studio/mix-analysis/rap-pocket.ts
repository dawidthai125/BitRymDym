/**
 * Rap pocket on a finished beat.
 * Applied once in the mix sum (renderMixStereo), after per-track FX.
 * The "pocket" FX slot is a dry wire in the live graph; these numbers
 * are the processors the master actually hears.
 *
 * Verse sits back. Hook is closer. Beat mids duck under the vocal.
 * Hook only: a 20 ms copy, a few cents up, quiet.
 */

import { STUDIO_FX_DEFAULTS, type StudioFxPocketParams } from "@/lib/studio/studio-fx-chain";

export type PocketMarker = { kind: "verse" | "hook"; positionMs: number };

export type PocketSpan = { kind: "verse" | "hook"; startMs: number; endMs: number };

type StereoBuf = { left: Float32Array; right: Float32Array };

export function readPocketParams(raw: unknown): StudioFxPocketParams | null {
  if (!raw || typeof raw !== "object") return null;
  const effects = (raw as { effects?: unknown }).effects;
  if (!Array.isArray(effects)) return null;
  const hit = effects.find(
    (e) => !!e && typeof e === "object" && (e as { type?: unknown }).type === "pocket" && (e as { enabled?: unknown }).enabled !== false,
  ) as { params?: Partial<StudioFxPocketParams> } | undefined;
  if (!hit) return null;
  const d = STUDIO_FX_DEFAULTS.pocket;
  const n = (v: unknown, fallback: number, lo: number, hi: number) => {
    const x = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.min(hi, Math.max(lo, x));
  };
  return {
    verseDb: n(hit.params?.verseDb, d.verseDb, -12, 6),
    hookDb: n(hit.params?.hookDb, d.hookDb, -12, 6),
    depth: n(hit.params?.depth, d.depth, 0, 1),
    doubleMs: n(hit.params?.doubleMs, d.doubleMs, 15, 25),
    doubleCents: n(hit.params?.doubleCents, d.doubleCents, 0, 25),
    doubleDb: n(hit.params?.doubleDb, d.doubleDb, -24, -6),
  };
}

/** Marker points become regions that run until the next marker. */
export function pocketSpans(markers: readonly PocketMarker[], lengthMs: number): PocketSpan[] {
  const sorted = markers
    .filter((m) => (m.kind === "verse" || m.kind === "hook") && Number.isFinite(m.positionMs))
    .slice()
    .sort((a, b) => a.positionMs - b.positionMs);
  return sorted.map((m, i) => ({
    kind: m.kind,
    startMs: Math.max(0, m.positionMs),
    endMs: i + 1 < sorted.length ? Math.max(m.positionMs, sorted[i + 1]!.positionMs) : lengthMs,
  }));
}

function gainRegions(buf: StereoBuf, sr: number, lengthMs: number, spans: readonly PocketSpan[], verseDb: number, hookDb: number): void {
  const len = Math.min(buf.left.length, buf.right.length);
  const verse = Math.pow(10, verseDb / 20);
  const hook = Math.pow(10, hookDb / 20);
  if (spans.length === 0) {
    for (let i = 0; i < len; i++) {
      buf.left[i] *= verse;
      buf.right[i] *= verse;
    }
    return;
  }
  const g = new Float32Array(len);
  g.fill(1);
  for (const span of spans) {
    const a = Math.max(0, Math.floor((span.startMs / 1000) * sr));
    const b = Math.min(len, Math.floor((span.endMs / 1000) * sr));
    const k = span.kind === "hook" ? hook : verse;
    for (let i = a; i < b; i++) g[i] = k;
  }
  for (let i = 0; i < len; i++) {
    buf.left[i] *= g[i]!;
    buf.right[i] *= g[i]!;
  }
  void lengthMs;
}

/** Mids of the beat give way while the vocal is up. Bass and air stay. */
export function duckBeatMids(beat: StereoBuf, key: StereoBuf, sr: number, depth: number): void {
  const len = Math.min(beat.left.length, beat.right.length, key.left.length, key.right.length);
  const d = Math.min(1, Math.max(0, depth));
  const bassA = 1 - Math.exp((-2 * Math.PI * 200) / sr);
  const midA = 1 - Math.exp((-2 * Math.PI * 4000) / sr);
  const att = Math.exp(-1 / (sr * 0.005));
  const rel = Math.exp(-1 / (sr * 0.08));
  let env = 0;
  let bassL = 0;
  let bassR = 0;
  let midL = 0;
  let midR = 0;
  for (let i = 0; i < len; i++) {
    const level = Math.max(Math.abs(key.left[i]!), Math.abs(key.right[i]!));
    const c = level > env ? att : rel;
    env = c * env + (1 - c) * level;
    const duck = 1 - d * Math.min(1, env * 3);
    bassL += bassA * (beat.left[i]! - bassL);
    bassR += bassA * (beat.right[i]! - bassR);
    const restL = beat.left[i]! - bassL;
    const restR = beat.right[i]! - bassR;
    midL += midA * (restL - midL);
    midR += midA * (restR - midR);
    beat.left[i] = bassL + midL * duck + (restL - midL);
    beat.right[i] = bassR + midR * duck + (restR - midR);
  }
}

/** Quiet, late, slightly sharp copy. Reads a snapshot so it does not chase itself. */
export function addHookDouble(buf: StereoBuf, sr: number, spans: readonly PocketSpan[], delayMs: number, cents: number, gainDb: number): void {
  const hooks = spans.filter((s) => s.kind === "hook");
  if (hooks.length === 0) return;
  const len = Math.min(buf.left.length, buf.right.length);
  const srcL = buf.left.slice(0, len);
  const srcR = buf.right.slice(0, len);
  const delay = Math.round((sr * delayMs) / 1000);
  const stretch = Math.pow(2, cents / 1200) - 1;
  const g = Math.pow(10, gainDb / 20);
  for (const span of hooks) {
    const a = Math.max(0, Math.floor((span.startMs / 1000) * sr));
    const b = Math.min(len, Math.floor((span.endMs / 1000) * sr));
    for (let i = a; i < b; i++) {
      const srcF = i - delay - (i - a) * stretch;
      if (srcF < 1) continue;
      const s0 = Math.floor(srcF);
      const frac = srcF - s0;
      if (s0 + 1 >= len) continue;
      buf.left[i] += g * (srcL[s0]! * (1 - frac) + srcL[s0 + 1]! * frac);
      buf.right[i] += g * (srcR[s0]! * (1 - frac) + srcR[s0 + 1]! * frac);
    }
  }
}

export type PocketTrack = {
  role: string;
  effectsChain?: unknown;
  left: Float32Array;
  right: Float32Array;
};

/** In place, on already-rendered track buffers, before they are summed. */
export function applyRapPocket(tracks: readonly PocketTrack[], sampleRate: number, lengthMs: number, markers: readonly PocketMarker[]): void {
  const leads = tracks.filter((t) => t.role === "lead_vocal" && readPocketParams(t.effectsChain));
  if (leads.length === 0) return;
  const params = readPocketParams(leads[0]!.effectsChain)!;
  const spans = pocketSpans(markers, lengthMs);
  const len = leads[0]!.left.length;
  const key = { left: new Float32Array(len), right: new Float32Array(len) };
  for (const lead of leads) {
    gainRegions(lead, sampleRate, lengthMs, spans, params.verseDb, params.hookDb);
    for (let i = 0; i < len; i++) {
      key.left[i] += lead.left[i]!;
      key.right[i] += lead.right[i]!;
    }
  }
  for (const beat of tracks) {
    if (beat.role !== "beat" && beat.role !== "instrument") continue;
    duckBeatMids(beat, key, sampleRate, params.depth);
  }
  for (const lead of leads) addHookDouble(lead, sampleRate, spans, params.doubleMs, params.doubleCents, params.doubleDb);
}
