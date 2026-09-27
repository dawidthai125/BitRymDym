/**
 * Pure BPM ranking / half-double policy (no I/O).
 * Detector confidence comes from `@audio/beat` — never invent percentages.
 */

import { BEAT_BPM_MAX, BEAT_BPM_MIN } from "@/lib/beats/validation";

/** Provisional until fixture benchmark — used only to mark UI uncertainty. */
export const BPM_PROVISIONAL_CONFIDENCE_FLOOR = 0.45;

/** Soft preference band for hip-hop/rap when choosing among octave equivalents. */
export const BPM_HIPHOP_PREF_MIN = 70;
export const BPM_HIPHOP_PREF_MAX = 160;

export type BpmCandidate = {
  bpm: number;
  confidence: number;
};

export type RankedBpmResult = {
  bpm: number;
  confidence: number;
  candidates: BpmCandidate[];
  uncertain: boolean;
  octaveAmbiguous: boolean;
};

export function roundBpm(raw: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const rounded = Math.round(raw);
  if (rounded < BEAT_BPM_MIN || rounded > BEAT_BPM_MAX) {
    return null;
  }
  return rounded;
}

export function isHalfOrDouble(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return Math.abs(hi - lo * 2) <= 1;
}

function inHipHopBand(bpm: number): boolean {
  return bpm >= BPM_HIPHOP_PREF_MIN && bpm <= BPM_HIPHOP_PREF_MAX;
}

/**
 * Expand detector candidates with half/double equivalents (same confidence),
 * then pick best score. Hip-hop band is a ranking bias only — never forces 140.
 */
export function rankBpmCandidates(
  rawCandidates: readonly BpmCandidate[],
): RankedBpmResult | null {
  const expanded = new Map<number, number>();

  for (const c of rawCandidates) {
    const base = roundBpm(c.bpm);
    if (base == null) continue;
    const conf = Math.max(0, Math.min(1, c.confidence));
    expanded.set(base, Math.max(expanded.get(base) ?? 0, conf));

    const half = roundBpm(base / 2);
    if (half != null) {
      expanded.set(half, Math.max(expanded.get(half) ?? 0, conf * 0.95));
    }
    const dbl = roundBpm(base * 2);
    if (dbl != null) {
      expanded.set(dbl, Math.max(expanded.get(dbl) ?? 0, conf * 0.95));
    }
  }

  if (expanded.size === 0) {
    return null;
  }

  const candidates: BpmCandidate[] = [...expanded.entries()]
    .map(([bpm, confidence]) => ({ bpm, confidence }))
    .sort((a, b) => b.confidence - a.confidence || a.bpm - b.bpm);

  let best = candidates[0]!;
  for (const c of candidates) {
    const bestScore =
      best.confidence + (inHipHopBand(best.bpm) ? 0.02 : 0);
    const score = c.confidence + (inHipHopBand(c.bpm) ? 0.02 : 0);
    if (score > bestScore + 1e-9) {
      best = c;
    } else if (Math.abs(score - bestScore) <= 1e-9 && c.bpm < best.bpm) {
      // Tie-break: lower BPM only when scores equal — still not "always 140".
      best = c;
    }
  }

  const octaveAmbiguous = candidates.some(
    (c) =>
      c.bpm !== best.bpm &&
      isHalfOrDouble(c.bpm, best.bpm) &&
      Math.abs(c.confidence - best.confidence) <= 0.15,
  );

  const uncertain =
    best.confidence < BPM_PROVISIONAL_CONFIDENCE_FLOOR || octaveAmbiguous;

  return {
    bpm: best.bpm,
    confidence: best.confidence,
    candidates: candidates.slice(0, 8),
    uncertain,
    octaveAmbiguous,
  };
}

/**
 * Server create policy: resolve final BPM from ensemble suggest + client submission.
 * Client BPM is never silent SSOT. Explicit override is allowed.
 * Design Freeze: exact match to AUTO_SUGGEST, or override, or manual path.
 */
export function resolveCreateBpm(params: {
  clientBpm: number;
  bpmManualOverride: boolean;
  /** Suggested BPM when status was AUTO_SUGGEST; null when MANUAL / unavailable. */
  suggestedBpm: number | null;
  decodeAvailable: boolean;
}): { ok: true; bpm: number } | { ok: false; error: string } {
  const { clientBpm, bpmManualOverride, suggestedBpm, decodeAvailable } =
    params;

  if (
    typeof clientBpm !== "number" ||
    !Number.isInteger(clientBpm) ||
    clientBpm < BEAT_BPM_MIN ||
    clientBpm > BEAT_BPM_MAX
  ) {
    return { ok: false, error: "BPM musi być liczbą całkowitą 1–300." };
  }

  if (bpmManualOverride) {
    return { ok: true, bpm: clientBpm };
  }

  // No auto suggest (unsupported format / MANUAL_REQUIRED / failed analysis).
  if (!decodeAvailable || suggestedBpm == null) {
    return { ok: true, bpm: clientBpm };
  }

  if (clientBpm === suggestedBpm) {
    return { ok: true, bpm: suggestedBpm };
  }

  return {
    ok: false,
    error:
      "BPM niezgodny z automatyczną sugestią. Przywróć wykrytą wartość lub oznacz zmianę jako ręczną.",
  };
}
