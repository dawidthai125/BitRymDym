/**
 * Bitek places a sample in a song — pure planning (no I/O, unit-tested).
 * Tempo: clip stretch so the loop lasts whole bars of the project.
 * Key: shift a loop/phrase to the beat key (relative major/minor count as the same key).
 * Place: bar-aligned at the playhead or the section start; repeats per scope.
 * Level: a loop sits under the vocal, a one-shot is an accent.
 */

import { CLIP_STRETCH_MAX, CLIP_STRETCH_MIN } from "@/lib/studio/studio-clip-playback";

const PC: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11, Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 };

export type ParsedKey = { pc: number; minor: boolean | null };

/** "Am", "F#", "Bb", "A2" (a note: mode unknown). Null when unreadable. */
export function parseMusicalKey(raw: string | null | undefined): ParsedKey | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s*(major|maj|dur)$/i, "").replace(/\s*(minor|min|moll)$/i, "m");
  const m = /^([A-G](?:#|b)?)(m)?(-?\d)?$/.exec(s);
  if (!m || PC[m[1]] == null) return null;
  return { pc: PC[m[1]], minor: m[3] != null ? null : m[2] === "m" };
}

/** Semitones (−6…+5) that move `from` into `to`. Minor keys compare via their relative major. */
export function keyShiftSemitones(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = parseMusicalKey(from);
  const b = parseMusicalKey(to);
  if (!a || !b) return null;
  const major = (k: ParsedKey) => (k.minor ? (k.pc + 3) % 12 : k.pc);
  // A bare note (one-shot) is treated as the tonic of the target's mode.
  const fromPc = a.minor == null ? (b.minor ? (a.pc + 3) % 12 : a.pc) : major(a);
  let diff = (major(b) - fromPc + 12) % 12;
  if (diff > 5) diff -= 12;
  return diff;
}

/** Stretch so `sampleBpm` plays at `projectBpm`; tries half/double time to stay in clip limits. */
export function stretchForTempo(sampleBpm: number, projectBpm: number): { stretch: number; feel: "same" | "half" | "double" } | null {
  if (!(sampleBpm > 0) || !(projectBpm > 0)) return null;
  const options: { stretch: number; feel: "same" | "half" | "double" }[] = [
    { stretch: sampleBpm / projectBpm, feel: "same" },
    { stretch: (sampleBpm * 2) / projectBpm, feel: "half" },
    { stretch: sampleBpm / (projectBpm * 2), feel: "double" },
  ];
  const ok = options.filter((o) => o.stretch >= CLIP_STRETCH_MIN && o.stretch <= CLIP_STRETCH_MAX);
  if (!ok.length) return null;
  // Smallest change wins (closest to 1).
  return ok.sort((x, y) => Math.abs(Math.log(x.stretch)) - Math.abs(Math.log(y.stretch)))[0];
}

export type PlacementScope = "once" | "section" | "song";

export type SamplePlacementInput = {
  sample: { type: "oneshot" | "loop" | "phrase"; bpm: number | null; key: string | null; bars: number | null; durationMs: number };
  project: { bpm: number; key: string | null; timelineLengthMs: number; beatsPerBar: number; markers: { kind: string; positionMs: number }[] };
  playheadMs: number;
  scope: PlacementScope;
  canPitch: boolean;
};

export type SamplePlacementPlan = {
  starts: number[];
  stretch: number;
  pitchCents: number;
  gainDb: number;
  explain: {
    tempo: { from: number; to: number; stretch: number; feel: "same" | "half" | "double" } | null;
    key: { from: string; to: string; semitones: number; applied: boolean } | null;
    startBar: number;
    section: string | null;
    repeats: number;
    gainDb: number;
    untilMs: number;
  };
};

const MAX_COPIES = 32;
/** Whole-ms rounding of bars and stretched lengths must not drop the last copy (seen live: 7 of 8). */
const FIT_TOLERANCE_MS = 10;

export function planSamplePlacement(input: SamplePlacementInput): SamplePlacementPlan {
  const { sample, project } = input;
  const barMs = (project.beatsPerBar * 60_000) / project.bpm;
  const markers = [...project.markers].sort((a, b) => a.positionMs - b.positionMs);

  // Tempo (loops/phrases with a known tempo).
  const tempo =
    sample.type !== "oneshot" && sample.bpm ? stretchForTempo(sample.bpm, project.bpm) : null;
  const stretch = tempo ? Math.round(tempo.stretch * 10_000) / 10_000 : 1;

  // Key (loops/phrases; a one-shot keeps its note).
  let pitchCents = 0;
  let key: SamplePlacementPlan["explain"]["key"] = null;
  if (sample.type !== "oneshot" && sample.key && project.key) {
    const semis = keyShiftSemitones(sample.key, project.key);
    if (semis != null && semis !== 0) {
      key = { from: sample.key, to: project.key, semitones: semis, applied: input.canPitch };
      if (input.canPitch) pitchCents = semis * 100;
    }
  }

  // Start: bar-aligned playhead; the section around it ends at the next marker.
  const startMs = Math.max(0, Math.round(Math.round(input.playheadMs / barMs) * barMs));
  const current = [...markers].reverse().find((m) => m.positionMs <= startMs + 1) ?? null;
  const next = markers.find((m) => m.positionMs > startMs + 1) ?? null;
  const songEnd = Math.max(startMs + barMs, project.timelineLengthMs);
  const untilMs =
    input.scope === "once" ? startMs : input.scope === "section" ? Math.min(next?.positionMs ?? startMs + 8 * barMs, songEnd) : songEnd;

  const lengthMs = sample.durationMs * stretch;
  // Length on the timeline after the tempo fit, rounded to whole bars (tiny rounding errors ignored).
  const barsLong = Math.max(1, Math.ceil(lengthMs / barMs - 0.02));
  const step = Math.round(barsLong * barMs);

  let starts: number[];
  if (input.scope === "once") {
    starts = [startMs];
  } else if (sample.type === "loop") {
    starts = [];
    for (let t = startMs; t + Math.min(step, lengthMs) <= untilMs + FIT_TOLERANCE_MS && starts.length < MAX_COPIES; t += step) starts.push(t);
    if (!starts.length) starts = [startMs];
  } else if (sample.type === "oneshot") {
    // An accent on every section start in range; without sections, every 8 bars.
    const points = markers.filter((m) => m.positionMs >= startMs && m.positionMs < untilMs).map((m) => m.positionMs);
    if (points.length) starts = [startMs, ...points.filter((p) => p !== startMs)];
    else {
      starts = [];
      for (let t = startMs; t < untilMs && starts.length < MAX_COPIES; t += 8 * barMs) starts.push(Math.round(t));
    }
  } else {
    // A phrase repeats only when it fits; otherwise once.
    starts = [];
    for (let t = startMs; t + lengthMs <= untilMs + FIT_TOLERANCE_MS && starts.length < MAX_COPIES; t += step) starts.push(t);
    if (!starts.length) starts = [startMs];
  }
  starts = [...new Set(starts.map((s) => Math.round(s)))].sort((a, b) => a - b).slice(0, MAX_COPIES);

  const gainDb = sample.type === "loop" ? -6 : sample.type === "phrase" ? -4 : -3;
  return {
    starts,
    stretch,
    pitchCents,
    gainDb,
    explain: {
      tempo: tempo && sample.bpm && Math.abs(stretch - 1) > 0.001 ? { from: sample.bpm, to: project.bpm, stretch, feel: tempo.feel } : null,
      key,
      startBar: Math.round(startMs / barMs) + 1,
      section: current?.kind ?? null,
      repeats: starts.length,
      gainDb,
      untilMs,
    },
  };
}
