/**
 * Experiment V3 — tempo relation helpers (tooling only).
 */

export type TempoRelationKind =
  | "equal"
  | "near_1"
  | "near_2"
  | "x2"
  | "x0_5"
  | "x4_3"
  | "x3_4"
  | "x2_3"
  | "x3_2"
  | "unrelated"
  | "unknown";

export type TempoRelation = {
  a: number | null;
  b: number | null;
  kind: TempoRelationKind;
  ratio: number | null;
  /** Candidate BPM values implied by normalizing the pair (may include a and/or b). */
  normalizedCandidates: number[];
};

const REL_TOL = 0.06;

function near(ratio: number, target: number): boolean {
  return Math.abs(ratio - target) <= REL_TOL;
}

/**
 * GENERAL RULE: classify metrical relation between two BPM estimates.
 * Not fixture-specific.
 */
export function normalizeTempoRelation(
  a: number | null,
  b: number | null,
): TempoRelation {
  if (a == null || b == null || a <= 0 || b <= 0) {
    return {
      a,
      b,
      kind: "unknown",
      ratio: null,
      normalizedCandidates: [],
    };
  }

  const abs = Math.abs(a - b);
  if (abs === 0) {
    return {
      a,
      b,
      kind: "equal",
      ratio: 1,
      normalizedCandidates: [a],
    };
  }
  if (abs === 1) {
    return {
      a,
      b,
      kind: "near_1",
      ratio: b / a,
      normalizedCandidates: [a, b],
    };
  }
  if (abs === 2) {
    return {
      a,
      b,
      kind: "near_2",
      ratio: b / a,
      normalizedCandidates: [a, b],
    };
  }

  const ratio = b / a;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  // Directed naming from A→B (GENERAL RULE — not fixture-specific).
  if (near(ratio, 2)) {
    return { a, b, kind: "x2", ratio, normalizedCandidates: [a, b] };
  }
  if (near(ratio, 0.5)) {
    return { a, b, kind: "x0_5", ratio, normalizedCandidates: [a, b] };
  }
  if (near(ratio, 4 / 3)) {
    return { a, b, kind: "x4_3", ratio, normalizedCandidates: [a, b] };
  }
  if (near(ratio, 3 / 4)) {
    return { a, b, kind: "x3_4", ratio, normalizedCandidates: [a, b] };
  }
  if (near(ratio, 2 / 3)) {
    return { a, b, kind: "x2_3", ratio, normalizedCandidates: [a, b] };
  }
  if (near(ratio, 3 / 2)) {
    return { a, b, kind: "x3_2", ratio, normalizedCandidates: [a, b] };
  }

  // Undirected fallback (same pair, swapped orientation)
  const undirected = hi / lo;
  if (near(undirected, 2)) {
    return {
      a,
      b,
      kind: b > a ? "x2" : "x0_5",
      ratio,
      normalizedCandidates: [lo, hi],
    };
  }
  if (near(undirected, 4 / 3)) {
    return {
      a,
      b,
      kind: b > a ? "x4_3" : "x3_4",
      ratio,
      normalizedCandidates: [lo, hi],
    };
  }
  if (near(undirected, 3 / 2)) {
    return {
      a,
      b,
      kind: b > a ? "x3_2" : "x2_3",
      ratio,
      normalizedCandidates: [lo, hi],
    };
  }

  return {
    a,
    b,
    kind: "unrelated",
    ratio,
    normalizedCandidates: [a, b],
  };
}

export function isHarmonicRelation(kind: TempoRelationKind): boolean {
  return (
    kind === "x2" ||
    kind === "x0_5" ||
    kind === "x4_3" ||
    kind === "x3_4" ||
    kind === "x2_3" ||
    kind === "x3_2"
  );
}

/** Soft hip-hop preference band — same bounds as production soft bias (GENERAL RULE). */
export const EXPERIMENT_HIPHOP_MIN = 70;
export const EXPERIMENT_HIPHOP_MAX = 160;

export function inHipHopBand(bpm: number): boolean {
  return bpm >= EXPERIMENT_HIPHOP_MIN && bpm <= EXPERIMENT_HIPHOP_MAX;
}

/**
 * GENERAL RULE: among harmonic pair, prefer BPM inside 70–160;
 * if both/neither, prefer closer to 100 (mid rap zone).
 */
export function pickHarmonicNormalized(a: number, b: number): number {
  const aIn = inHipHopBand(a);
  const bIn = inHipHopBand(b);
  if (aIn && !bIn) return a;
  if (bIn && !aIn) return b;
  const target = 100;
  return Math.abs(a - target) <= Math.abs(b - target) ? a : b;
}
