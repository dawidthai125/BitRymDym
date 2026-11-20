/**
 * Tempo and key measured from the reference track the admin uploads next to the YouTube link.
 * Pure (client + server). YouTube blocks audio downloads from servers, so the file is the only
 * way to measure; Gemini's own BPM is a guess and often lands on double time (161 for ~80).
 */

import { BEAT_HINT_BPM_MAX, BEAT_HINT_BPM_MIN, pickAllowedNearHint } from "@/lib/beats/ai-beat/prompt";

export type ReferenceMeasure = {
  /** Best tempo from the file, or null when the file gave none. */
  bpm: number | null;
  /** True when the tempo tracker agreed with itself; false means `candidates` decide. */
  sure: boolean;
  /** Tempos the file allows (half/double included), hip-hop range only. */
  candidates: number[];
  /** "Am", "F#" … or null. */
  key: string | null;
};

const KEY_RE = /^[A-G](?:#|b)?m?$/;

function bpmOk(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= BEAT_HINT_BPM_MIN && n <= BEAT_HINT_BPM_MAX;
}

/** Validate a measure echoed back by the admin form. */
export function parseReferenceMeasure(input: unknown): ReferenceMeasure | null {
  if (!input || typeof input !== "object") return null;
  const row = input as { bpm?: unknown; sure?: unknown; candidates?: unknown; key?: unknown };
  const bpm = bpmOk(row.bpm) ? row.bpm : null;
  const candidates = Array.isArray(row.candidates) ? [...new Set(row.candidates.filter(bpmOk))].slice(0, 12) : [];
  const key = typeof row.key === "string" && KEY_RE.test(row.key.trim()) ? row.key.trim() : null;
  if (bpm == null && candidates.length === 0 && key == null) return null;
  return { bpm, sure: row.sure === true && bpm != null, candidates, key };
}

/**
 * Final tempo for the brief: a sure measurement wins; otherwise Gemini's count only picks
 * between the tempos the file allows (so 161 becomes the measured ~80, never a free guess).
 */
export function resolveReferenceTempo(measure: ReferenceMeasure | null, geminiBpm: number | null): number | null {
  if (!measure) return geminiBpm;
  if (measure.sure && measure.bpm != null) return measure.bpm;
  const allow = measure.candidates.length ? measure.candidates : measure.bpm != null ? [measure.bpm] : [];
  if (geminiBpm != null && allow.length) {
    const near = pickAllowedNearHint(allow, geminiBpm);
    if (near != null) return near;
  }
  return measure.bpm ?? geminiBpm;
}

/** Key name for the English brief: "Am" → "A minor", "F#" → "F# major". */
export function keyForBrief(key: string): string {
  return key.endsWith("m") ? `${key.slice(0, -1)} minor` : `${key} major`;
}
