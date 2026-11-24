/**
 * Rap pocket on a finished beat.
 * Applied once in the mix sum (renderMixStereo), after per-track FX.
 * Live preview is the pocket worklet. These numbers are what the master
 * still applies in the mix sum (split-band beat duck included).
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

type SampleSpan = { kind: "verse" | "hook"; a: number; b: number };

function sampleSpans(spans: readonly PocketSpan[], sr: number): SampleSpan[] {
  return spans.map((s) => ({
    kind: s.kind,
    a: Math.max(0, Math.floor((s.startMs / 1000) * sr)),
    b: Math.floor((s.endMs / 1000) * sr),
  }));
}

/** Section level per sample. Call with rising `i`. No markers = verse everywhere; outside the regions = 1. */
export class PocketSectionGain {
  private readonly spans: SampleSpan[];
  private readonly verse: number;
  private readonly hook: number;
  private at = 0;

  constructor(spans: readonly PocketSpan[], sr: number, params: { verseDb: number; hookDb: number }) {
    this.spans = sampleSpans(spans, sr);
    this.verse = Math.pow(10, params.verseDb / 20);
    this.hook = Math.pow(10, params.hookDb / 20);
  }

  gainAt(i: number): number {
    if (this.spans.length === 0) return this.verse;
    while (this.at < this.spans.length && i >= this.spans[this.at]!.b) this.at++;
    const span = this.spans[this.at];
    if (!span || i < span.a) return 1;
    return span.kind === "hook" ? this.hook : this.verse;
  }
}

/** Mids of the beat give way while the vocal is up. Bass and air stay. Result in `left` / `right`. */
export class PocketMidDucker {
  left = 0;
  right = 0;
  private readonly depth: number;
  private readonly bassA: number;
  private readonly midA: number;
  private readonly att: number;
  private readonly rel: number;
  private env = 0;
  private bassL = 0;
  private bassR = 0;
  private midL = 0;
  private midR = 0;

  constructor(sr: number, depth: number) {
    this.depth = Math.min(1, Math.max(0, depth));
    this.bassA = 1 - Math.exp((-2 * Math.PI * 200) / sr);
    this.midA = 1 - Math.exp((-2 * Math.PI * 4000) / sr);
    this.att = Math.exp(-1 / (sr * 0.005));
    this.rel = Math.exp(-1 / (sr * 0.08));
  }

  process(l: number, r: number, keyL: number, keyR: number): void {
    const level = Math.max(Math.abs(keyL), Math.abs(keyR));
    const c = level > this.env ? this.att : this.rel;
    this.env = c * this.env + (1 - c) * level;
    const duck = 1 - this.depth * Math.min(1, this.env * 3);
    this.bassL += this.bassA * (l - this.bassL);
    this.bassR += this.bassA * (r - this.bassR);
    const restL = l - this.bassL;
    const restR = r - this.bassR;
    this.midL += this.midA * (restL - this.midL);
    this.midR += this.midA * (restR - this.midR);
    this.left = this.bassL + this.midL * duck + (restL - this.midL);
    this.right = this.bassR + this.midR * duck + (restR - this.midR);
  }
}

/** Quiet, late, slightly sharp copy on the hooks. Keeps only the history the copy can reach. Result in `left` / `right`. */
export class PocketHookDouble {
  left = 0;
  right = 0;
  private readonly spans: SampleSpan[];
  private readonly delay: number;
  private readonly stretch: number;
  private readonly gain: number;
  private readonly size: number;
  private readonly histL: Float32Array;
  private readonly histR: Float32Array;
  private at = 0;

  constructor(spans: readonly PocketSpan[], sr: number, len: number, delayMs: number, cents: number, gainDb: number) {
    this.spans = sampleSpans(spans, sr)
      .filter((s) => s.kind === "hook")
      .map((s) => ({ ...s, b: Math.min(len, s.b) }));
    this.delay = Math.round((sr * delayMs) / 1000);
    this.stretch = Math.pow(2, cents / 1200) - 1;
    this.gain = Math.pow(10, gainDb / 20);
    const longest = this.spans.reduce((m, s) => Math.max(m, s.b - s.a), 0);
    this.size = Math.ceil(this.delay + longest * this.stretch) + 4;
    this.histL = new Float32Array(this.size);
    this.histR = new Float32Array(this.size);
  }

  process(i: number, l: number, r: number): void {
    const w = i % this.size;
    this.histL[w] = l;
    this.histR[w] = r;
    this.left = l;
    this.right = r;
    while (this.at < this.spans.length && i >= this.spans[this.at]!.b) this.at++;
    const span = this.spans[this.at];
    if (!span || i < span.a) return;
    const srcF = i - this.delay - (i - span.a) * this.stretch;
    if (srcF < 1) return;
    const s0 = Math.floor(srcF);
    const frac = srcF - s0;
    const p = s0 % this.size;
    const q = (s0 + 1) % this.size;
    this.left = l + this.gain * (this.histL[p]! * (1 - frac) + this.histL[q]! * frac);
    this.right = r + this.gain * (this.histR[p]! * (1 - frac) + this.histR[q]! * frac);
  }
}

/** Whole-buffer form of PocketMidDucker, in place. */
export function duckBeatMids(beat: StereoBuf, key: StereoBuf, sr: number, depth: number): void {
  const len = Math.min(beat.left.length, beat.right.length, key.left.length, key.right.length);
  const ducker = new PocketMidDucker(sr, depth);
  for (let i = 0; i < len; i++) {
    ducker.process(beat.left[i]!, beat.right[i]!, key.left[i]!, key.right[i]!);
    beat.left[i] = ducker.left;
    beat.right[i] = ducker.right;
  }
}

/** Whole-buffer form of PocketHookDouble, in place. */
export function addHookDouble(buf: StereoBuf, sr: number, spans: readonly PocketSpan[], delayMs: number, cents: number, gainDb: number): void {
  if (!spans.some((s) => s.kind === "hook")) return;
  const len = Math.min(buf.left.length, buf.right.length);
  const double = new PocketHookDouble(spans, sr, len, delayMs, cents, gainDb);
  for (let i = 0; i < len; i++) {
    double.process(i, buf.left[i]!, buf.right[i]!);
    buf.left[i] = double.left;
    buf.right[i] = double.right;
  }
}

export type PocketTrack = {
  role: string;
  effectsChain?: unknown;
  left: Float32Array;
  right: Float32Array;
};

/** True when a lead vocal carries an enabled pocket slot. The parallel sum cannot duck per track, so that mix stays in-process. */
export function mixHasRapPocket(tracks: readonly { role: string; effectsChain?: unknown }[]): boolean {
  return tracks.some(isPocketLead);
}

export type PocketLeadStage = {
  /** Sum of the pocketed leads — what the beat mids duck under. */
  key: StereoBuf;
  params: StudioFxPocketParams;
  /** Hook double, after the key is taken. */
  finish: () => void;
};

/** Section level on the pocketed leads (in place) + the key for the beat. Null when no lead has a pocket. */
export function pocketLeadStage(leads: readonly PocketTrack[], sampleRate: number, lengthMs: number, markers: readonly PocketMarker[]): PocketLeadStage | null {
  if (leads.length === 0) return null;
  const params = readPocketParams(leads[0]!.effectsChain)!;
  const spans = pocketSpans(markers, lengthMs);
  const len = leads[0]!.left.length;
  const key = { left: new Float32Array(len), right: new Float32Array(len) };
  for (const lead of leads) {
    const section = new PocketSectionGain(spans, sampleRate, params);
    for (let i = 0; i < len; i++) {
      const g = section.gainAt(i);
      lead.left[i]! *= g;
      lead.right[i]! *= g;
      key.left[i] += lead.left[i]!;
      key.right[i] += lead.right[i]!;
    }
  }
  return {
    key,
    params,
    finish: () => {
      for (const lead of leads) addHookDouble(lead, sampleRate, spans, params.doubleMs, params.doubleCents, params.doubleDb);
    },
  };
}

/** A lead vocal with an enabled pocket slot. */
export function isPocketLead(t: { role: string; effectsChain?: unknown }): boolean {
  return t.role === "lead_vocal" && readPocketParams(t.effectsChain) !== null;
}

/** A track the pocket ducks. */
export function isPocketBeat(t: { role: string }): boolean {
  return t.role === "beat" || t.role === "instrument";
}

/** In place, on already-rendered track buffers, before they are summed. */
export function applyRapPocket(tracks: readonly PocketTrack[], sampleRate: number, lengthMs: number, markers: readonly PocketMarker[]): void {
  const stage = pocketLeadStage(tracks.filter(isPocketLead), sampleRate, lengthMs, markers);
  if (!stage) return;
  for (const beat of tracks) if (isPocketBeat(beat)) duckBeatMids(beat, stage.key, sampleRate, stage.params.depth);
  stage.finish();
}
