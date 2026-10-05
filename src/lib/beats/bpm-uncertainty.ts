/**
 * BPM uncertainty envelope + server create allowlist policy.
 * Derives candidates/hypotheses/range from an existing probe — does NOT retune resolver.
 *
 * Design: docs/architecture/BPM_UNCERTAINTY_UX_DESIGN.md
 */

import {
  BPM_NEAR_TEMPO_TOL,
  isEstimatorHardConflict,
  isRatioOnePointFive,
  type CanonicalBpmResolution,
  type MultiSignalScores,
} from "@/lib/beats/bpm-resolve";
import { BEAT_BPM_MAX, BEAT_BPM_MIN } from "@/lib/beats/validation";

/** Local helpers — avoid circular import with audio-bpm-rank. */
function roundBpm(raw: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < BEAT_BPM_MIN || rounded > BEAT_BPM_MAX) return null;
  return rounded;
}

function isHalfOrDouble(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return Math.abs(hi - lo * 2) <= 1;
}

export const BPM_UNCERTAINTY_MAX_CANDIDATES = 6;

export type BpmSource =
  | "AUTO_DETECTED"
  | "USER_SELECTED_CANDIDATE"
  | "USER_SELECTED_WITHIN_SYSTEM_RANGE";

export type BpmSelectionMode = "AUTO" | "CANDIDATE" | "RANGE";

export type BpmConfidenceClass =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "CONFLICT"
  | "UNAVAILABLE";

export type BpmUncertaintyCandidate = {
  bpm: number;
  rank: number;
  score: number;
  clusterId: string;
  role:
    | "TOP"
    | "RUNNER"
    | "SUPPORTING"
    | "HALF_DOUBLE_ALT"
    | "RATIO_1_5_ALT";
};

export type BpmHypothesis = {
  id: string;
  representativeBpm: number;
  members: number[];
  range: { min: number; max: number } | null;
};

export type BpmUncertaintyEnvelope = {
  decision: "AUTO_SUGGEST" | "MANUAL_REQUIRED" | "UNAVAILABLE";
  confidenceClass: BpmConfidenceClass;
  reason: string;
  /**
   * Ranking hint (composite top) — NOT an implicit persist decision.
   * Under CONFLICT/LOW/MEDIUM, persistence requires explicit selection.
   */
  detectedBpm: number | null;
  candidates: BpmUncertaintyCandidate[];
  hypotheses: BpmHypothesis[];
  range: { min: number; max: number } | null;
  allowlist: number[];
  message: string;
  /**
   * BPM Quality V2: when true, finalize/import must receive an explicit
   * selectionMode (CANDIDATE|RANGE). Silent composite-top persist is forbidden.
   */
  requiresExplicitSelection: boolean;
};

export type ResolveCreateBpmResult =
  | {
      ok: true;
      bpm: number;
      bpmSource: BpmSource;
      detectedBpm: number | null;
      userSelectedBpm: number | null;
      reason: string;
      confidenceClass: BpmConfidenceClass;
    }
  | { ok: false; error: string };

const REJECT_OUTSIDE =
  "BPM spoza wartości uznanych przez system dla tego pliku.";
const REJECT_UNAVAILABLE =
  "Automatyczne wykrywanie BPM jest niedostępne — nie można zapisać arbitralnego BPM.";
const REJECT_EMPTY =
  "Brak wiarygodnych kandydatów BPM — nie można zapisać arbitralnego BPM.";
/** BPM Quality V2 — CONFLICT/LOW/MEDIUM without explicit selectionMode. */
export const REJECT_SELECTION_REQUIRED = "BLOCKED_BPM_SELECTION_REQUIRED";

function uniqSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function nearTempo(a: number, b: number): boolean {
  return Math.abs(a - b) <= BPM_NEAR_TEMPO_TOL;
}

function contiguousRange(
  members: readonly number[],
): { min: number; max: number } | null {
  if (members.length === 0) return null;
  const sorted = uniqSorted(members);
  if (sorted.length === 1) {
    return { min: sorted[0]!, max: sorted[0]! };
  }
  // Only emit a continuum when every integer step is present and span ≤ tol+1.
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  if (max - min > BPM_NEAR_TEMPO_TOL) return null;
  for (let v = min; v <= max; v += 1) {
    if (!sorted.includes(v)) return null;
  }
  return { min, max };
}

function clusterIdsForBpms(bpms: readonly number[]): Map<number, string> {
  const sorted = uniqSorted(bpms);
  const map = new Map<number, string>();
  let clusterIdx = 0;
  let cluster: number[] = [];

  const flush = () => {
    if (cluster.length === 0) return;
    const id = `h${clusterIdx}`;
    clusterIdx += 1;
    for (const b of cluster) map.set(b, id);
    cluster = [];
  };

  for (const b of sorted) {
    if (cluster.length === 0) {
      cluster.push(b);
      continue;
    }
    const last = cluster[cluster.length - 1]!;
    if (nearTempo(last, b)) {
      cluster.push(b);
    } else {
      flush();
      cluster.push(b);
    }
  }
  flush();
  return map;
}

function mapConfidenceClass(params: {
  decision: BpmUncertaintyEnvelope["decision"];
  reason: string;
  estimatorHardConflict: boolean;
}): BpmConfidenceClass {
  if (params.decision === "UNAVAILABLE") return "UNAVAILABLE";
  if (params.decision === "AUTO_SUGGEST") return "HIGH";
  if (
    params.estimatorHardConflict ||
    params.reason === "ESTIMATOR_HARD_CONFLICT" ||
    params.reason === "TRUE_CONFLICT" ||
    params.reason === "UNRESOLVED_PAIR" ||
    params.reason === "CONFLICT" ||
    params.reason === "OCTAVE_AMBIGUITY" ||
    params.reason === "DIMS_DISAGREE" ||
    params.reason === "RATIO_1_5_AMBIGUITY"
  ) {
    return "CONFLICT";
  }
  if (
    params.reason === "INSUFFICIENT_MARGIN" ||
    params.reason === "SIGNAL_DISAGREEMENT" ||
    params.reason === "SEGMENT_CONTRADICTION" ||
    params.reason === "NO_CANDIDATES" ||
    params.reason === "MISSING_ESTIMATE" ||
    params.reason === "OUT_OF_RANGE"
  ) {
    return "LOW";
  }
  return "MEDIUM";
}

function collectRawBpms(params: {
  scores: readonly MultiSignalScores[];
  aBpm: number | null;
  bBpm: number | null;
  extra: readonly number[];
}): number[] {
  const out: number[] = [];
  for (const s of params.scores) {
    const r = roundBpm(s.bpm);
    if (r != null) out.push(r);
  }
  for (const raw of [params.aBpm, params.bBpm, ...params.extra]) {
    if (typeof raw !== "number") continue;
    const r = roundBpm(raw);
    if (r != null) out.push(r);
  }
  return uniqSorted(out);
}

function expandFamilyMembers(
  reps: readonly number[],
  raw: readonly number[],
): number[] {
  const members: number[] = [];
  for (const rep of reps) {
    for (const b of raw) {
      if (nearTempo(rep, b)) members.push(b);
    }
  }
  return uniqSorted(members);
}

function buildHypotheses(params: {
  rankedBpms: readonly number[];
  raw: readonly number[];
  aBpm: number | null;
  bBpm: number | null;
  hardConflict: boolean;
}): { hypotheses: BpmHypothesis[]; range: { min: number; max: number } | null } {
  const seed = uniqSorted([
    ...params.rankedBpms,
    ...(typeof params.aBpm === "number" ? [params.aBpm] : []),
    ...(typeof params.bBpm === "number" ? [params.bBpm] : []),
  ]);

  if (params.hardConflict && params.aBpm != null && params.bBpm != null) {
    const famA = expandFamilyMembers([params.aBpm], params.raw);
    const famB = expandFamilyMembers([params.bBpm], params.raw);
    const hA: BpmHypothesis = {
      id: "h0",
      representativeBpm: params.aBpm,
      members: famA.length > 0 ? famA : [params.aBpm],
      range: contiguousRange(famA.length > 0 ? famA : [params.aBpm]),
    };
    const hB: BpmHypothesis = {
      id: "h1",
      representativeBpm: params.bBpm,
      members: famB.length > 0 ? famB : [params.bBpm],
      range: contiguousRange(famB.length > 0 ? famB : [params.bBpm]),
    };
    // Disjoint hard conflict → never a cross-hypothesis continuum.
    return { hypotheses: [hA, hB], range: null };
  }

  const clusterMap = clusterIdsForBpms(seed);
  const byCluster = new Map<string, number[]>();
  for (const b of seed) {
    const id = clusterMap.get(b) ?? `h_${b}`;
    const list = byCluster.get(id) ?? [];
    list.push(b);
    byCluster.set(id, list);
  }

  const hypotheses: BpmHypothesis[] = [...byCluster.entries()].map(
    ([id, reps], idx) => {
      const members = expandFamilyMembers(reps, params.raw);
      const representativeBpm = [...members].sort(
        (a, b) =>
          (params.rankedBpms.includes(a) ? 0 : 1) -
            (params.rankedBpms.includes(b) ? 0 : 1) || a - b,
      )[0]!;
      return {
        id: id.startsWith("h") ? id : `h${idx}`,
        representativeBpm,
        members,
        range: contiguousRange(members),
      };
    },
  );

  hypotheses.sort((a, b) => a.representativeBpm - b.representativeBpm);

  // Global range only when a single near-tempo family exists (no fake 92–138).
  if (hypotheses.length === 1) {
    return { hypotheses, range: hypotheses[0]!.range };
  }
  return { hypotheses, range: null };
}

function buildCandidates(params: {
  scores: readonly MultiSignalScores[];
  detectedBpm: number | null;
  runnerUpBpm: number | null;
  aBpm: number | null;
  bBpm: number | null;
  raw: readonly number[];
  clusterMap: Map<number, string>;
}): BpmUncertaintyCandidate[] {
  const scoreByBpm = new Map(params.scores.map((s) => [s.bpm, s.composite]));
  const ordered: number[] = [];

  const push = (bpm: number | null | undefined) => {
    if (typeof bpm !== "number") return;
    const r = roundBpm(bpm);
    if (r == null) return;
    if (!ordered.includes(r)) ordered.push(r);
  };

  push(params.detectedBpm);
  push(params.runnerUpBpm);
  push(params.aBpm);
  push(params.bBpm);
  for (const s of params.scores) push(s.bpm);

  // Near-tempo supporting members of already-selected reps.
  for (const rep of [...ordered]) {
    for (const b of params.raw) {
      if (nearTempo(rep, b)) push(b);
    }
  }

  // Half/double alts present in this file's raw set.
  const halfDoubleAlts = new Set<number>();
  for (const b of ordered) {
    for (const other of params.raw) {
      if (other !== b && isHalfOrDouble(b, other)) {
        push(other);
        halfDoubleAlts.add(other);
      }
    }
  }

  // RATIO_1_5 alts — only when both sides already evidenced (no invent).
  const ratio15Alts = new Set<number>();
  for (const b of ordered) {
    for (const other of params.raw) {
      if (other !== b && isRatioOnePointFive(b, other)) {
        push(other);
        ratio15Alts.add(other);
      }
    }
  }

  const capped = ordered.slice(0, BPM_UNCERTAINTY_MAX_CANDIDATES);
  return capped.map((bpm, idx) => {
    let role: BpmUncertaintyCandidate["role"] = "SUPPORTING";
    if (params.detectedBpm != null && nearTempo(bpm, params.detectedBpm) && idx === 0) {
      role = "TOP";
    } else if (params.detectedBpm != null && bpm === params.detectedBpm) {
      role = "TOP";
    } else if (
      params.runnerUpBpm != null &&
      (bpm === params.runnerUpBpm || nearTempo(bpm, params.runnerUpBpm))
    ) {
      role = "RUNNER";
    } else if (halfDoubleAlts.has(bpm)) {
      role = "HALF_DOUBLE_ALT";
    } else if (ratio15Alts.has(bpm)) {
      role = "RATIO_1_5_ALT";
    } else if (idx === 0) {
      role = "TOP";
    } else if (idx === 1) {
      role = "RUNNER";
    }

    return {
      bpm,
      rank: idx + 1,
      score: scoreByBpm.get(bpm) ?? 0,
      clusterId: params.clusterMap.get(bpm) ?? `h_${bpm}`,
      role,
    };
  });
}

export function buildBpmUncertaintyEnvelope(params: {
  decision: BpmUncertaintyEnvelope["decision"];
  reason: string;
  message: string;
  detectedBpm: number | null;
  canonical: CanonicalBpmResolution | null;
  aBpm: number | null;
  bBpm: number | null;
  /** Extra integer BPMs observed for this file (estimator candidate bags). */
  rawCandidateBpms?: readonly number[];
}): BpmUncertaintyEnvelope {
  if (params.decision === "UNAVAILABLE") {
    return {
      decision: "UNAVAILABLE",
      confidenceClass: "UNAVAILABLE",
      reason: params.reason,
      detectedBpm: null,
      candidates: [],
      hypotheses: [],
      range: null,
      allowlist: [],
      message: params.message,
      requiresExplicitSelection: true,
    };
  }

  const scores = params.canonical?.scores ?? [];
  const runnerUpBpm = params.canonical?.runnerUpBpm ?? null;
  const hardConflict =
    params.canonical?.estimatorHardConflict === true ||
    isEstimatorHardConflict(params.aBpm, params.bBpm) ||
    params.reason === "ESTIMATOR_HARD_CONFLICT";

  const detectedBpm =
    params.detectedBpm ??
    (scores[0] != null ? scores[0].bpm : null) ??
    params.aBpm ??
    params.bBpm;

  const raw = collectRawBpms({
    scores,
    aBpm: params.aBpm,
    bBpm: params.bBpm,
    extra: params.rawCandidateBpms ?? [],
  });

  const rankedBpms = scores.map((s) => s.bpm);
  const { hypotheses, range } = buildHypotheses({
    rankedBpms: rankedBpms.length > 0 ? rankedBpms.slice(0, 4) : raw,
    raw,
    aBpm: params.aBpm,
    bBpm: params.bBpm,
    hardConflict,
  });

  const seedForClusters = uniqSorted([
    ...rankedBpms,
    ...hypotheses.flatMap((h) => h.members),
  ]);
  const clusterMap = clusterIdsForBpms(seedForClusters);

  const candidates = buildCandidates({
    scores,
    detectedBpm,
    runnerUpBpm,
    aBpm: params.aBpm,
    bBpm: params.bBpm,
    raw,
    clusterMap,
  });

  const allowlist = uniqSorted([
    ...candidates.map((c) => c.bpm),
    ...hypotheses.flatMap((h) => h.members),
    ...(range != null
      ? Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
      : []),
  ]);

  const confidenceClass = mapConfidenceClass({
    decision: params.decision,
    reason: params.reason,
    estimatorHardConflict: hardConflict,
  });

  // HIGH AUTO is the only path that may persist without an explicit pick.
  const requiresExplicitSelection = confidenceClass !== "HIGH";

  return {
    decision: params.decision,
    confidenceClass,
    reason: params.reason,
    detectedBpm,
    candidates,
    hypotheses,
    range: confidenceClass === "CONFLICT" ? null : range,
    allowlist,
    message: params.message,
    requiresExplicitSelection,
  };
}

function estimatorTop(raw: { bpm: number | null } | undefined): number | null {
  if (!raw || typeof raw.bpm !== "number") return null;
  return roundBpm(raw.bpm);
}

function rawFromAnalysis(analysis: {
  estimatorA?: { bpm: number | null; candidates?: Array<{ bpm: number }> };
  estimatorB?: { bpm: number | null; candidates?: Array<{ bpm: number }> };
} | undefined): number[] {
  if (!analysis) return [];
  const out: number[] = [];
  for (const est of [analysis.estimatorA, analysis.estimatorB]) {
    if (!est) continue;
    if (typeof est.bpm === "number") {
      const r = roundBpm(est.bpm);
      if (r != null) out.push(r);
    }
    for (const c of est.candidates ?? []) {
      const r = roundBpm(c.bpm);
      if (r != null) out.push(r);
    }
  }
  return uniqSorted(out);
}

/** Minimal probe shape — avoids importing audio-bpm (circular risk). */
export type BpmProbeForEnvelope = {
  status: "auto_suggest" | "manual_required" | "unavailable";
  bpm?: number;
  reason: string;
  message?: string;
  canonical?: CanonicalBpmResolution | null;
  analysis?: {
    estimatorA?: {
      bpm: number | null;
      candidates?: Array<{ bpm: number }>;
    };
    estimatorB?: {
      bpm: number | null;
      candidates?: Array<{ bpm: number }>;
    };
  };
};

/** Build envelope from a completed probe (analyze / finalize re-probe). */
export function buildBpmUncertaintyEnvelopeFromProbe(
  probe: BpmProbeForEnvelope,
): BpmUncertaintyEnvelope {
  if (probe.status === "unavailable") {
    return buildBpmUncertaintyEnvelope({
      decision: "UNAVAILABLE",
      reason: probe.reason,
      message: probe.message ?? "Automatyczne wykrywanie BPM jest niedostępne.",
      detectedBpm: null,
      canonical: null,
      aBpm: null,
      bBpm: null,
    });
  }

  const analysis = probe.analysis;
  const aBpm = estimatorTop(analysis?.estimatorA);
  const bBpm = estimatorTop(analysis?.estimatorB);
  const rawCandidateBpms = rawFromAnalysis(analysis);
  const canonical = probe.canonical ?? null;

  if (probe.status === "auto_suggest") {
    return buildBpmUncertaintyEnvelope({
      decision: "AUTO_SUGGEST",
      reason: probe.reason,
      message: "Wykryto automatycznie.",
      detectedBpm: typeof probe.bpm === "number" ? probe.bpm : null,
      canonical,
      aBpm,
      bBpm,
      rawCandidateBpms,
    });
  }

  return buildBpmUncertaintyEnvelope({
    decision: "MANUAL_REQUIRED",
    reason: probe.reason,
    message:
      probe.message ?? "BPM nie udało się wiarygodnie określić.",
    detectedBpm: canonical?.scores[0]?.bpm ?? aBpm ?? bBpm,
    canonical,
    aBpm,
    bBpm,
    rawCandidateBpms,
  });
}

function inferSelectionMode(params: {
  clientBpm: number;
  envelope: BpmUncertaintyEnvelope;
  selectionMode?: BpmSelectionMode;
  bpmManualOverride?: boolean;
}): BpmSelectionMode {
  if (params.selectionMode) return params.selectionMode;

  if (
    params.envelope.confidenceClass === "HIGH" &&
    params.envelope.detectedBpm != null &&
    params.clientBpm === params.envelope.detectedBpm &&
    !params.bpmManualOverride
  ) {
    return "AUTO";
  }

  if (
    params.envelope.range != null &&
    params.clientBpm >= params.envelope.range.min &&
    params.clientBpm <= params.envelope.range.max &&
    params.envelope.candidates.every((c) => c.bpm !== params.clientBpm) &&
    params.bpmManualOverride
  ) {
    return "RANGE";
  }

  return "CANDIDATE";
}

/**
 * Server create/finalize policy: client BPM must be in the server-rebuilt allowlist.
 * `bpmManualOverride` never bypasses the allowlist.
 */
export function resolveCreateBpmWithEnvelope(params: {
  clientBpm: number;
  envelope: BpmUncertaintyEnvelope;
  selectionMode?: BpmSelectionMode;
  /** Legacy flag — NEVER grants free 1–300 entry. */
  bpmManualOverride?: boolean;
}): ResolveCreateBpmResult {
  const { clientBpm, envelope } = params;

  if (
    typeof clientBpm !== "number" ||
    !Number.isInteger(clientBpm) ||
    clientBpm < BEAT_BPM_MIN ||
    clientBpm > BEAT_BPM_MAX
  ) {
    return { ok: false, error: "BPM musi być liczbą całkowitą 1–300." };
  }

  if (
    envelope.decision === "UNAVAILABLE" ||
    envelope.confidenceClass === "UNAVAILABLE"
  ) {
    return { ok: false, error: REJECT_UNAVAILABLE };
  }

  if (envelope.allowlist.length === 0) {
    return { ok: false, error: REJECT_EMPTY };
  }

  if (!envelope.allowlist.includes(clientBpm)) {
    return { ok: false, error: REJECT_OUTSIDE };
  }

  // BPM Quality V2: CONFLICT/LOW/MEDIUM cannot silently persist via inferred mode.
  // Explicit selectionMode (CANDIDATE|RANGE) is mandatory when required.
  if (envelope.requiresExplicitSelection) {
    if (
      params.selectionMode == null ||
      params.selectionMode === "AUTO"
    ) {
      return { ok: false, error: REJECT_SELECTION_REQUIRED };
    }
  }

  const mode = inferSelectionMode(params);

  if (mode === "AUTO") {
    if (
      envelope.confidenceClass !== "HIGH" ||
      envelope.requiresExplicitSelection ||
      envelope.detectedBpm == null ||
      clientBpm !== envelope.detectedBpm
    ) {
      return { ok: false, error: REJECT_SELECTION_REQUIRED };
    }
    return {
      ok: true,
      bpm: clientBpm,
      bpmSource: "AUTO_DETECTED",
      detectedBpm: envelope.detectedBpm,
      userSelectedBpm: null,
      reason: envelope.reason,
      confidenceClass: envelope.confidenceClass,
    };
  }

  if (mode === "RANGE") {
    if (
      envelope.range == null ||
      clientBpm < envelope.range.min ||
      clientBpm > envelope.range.max
    ) {
      return { ok: false, error: REJECT_OUTSIDE };
    }
    return {
      ok: true,
      bpm: clientBpm,
      bpmSource: "USER_SELECTED_WITHIN_SYSTEM_RANGE",
      detectedBpm: envelope.detectedBpm,
      userSelectedBpm: clientBpm,
      reason: envelope.reason,
      confidenceClass: envelope.confidenceClass,
    };
  }

  // CANDIDATE (default for override / manual pick among system values)
  return {
    ok: true,
    bpm: clientBpm,
    bpmSource: "USER_SELECTED_CANDIDATE",
    detectedBpm: envelope.detectedBpm,
    userSelectedBpm: clientBpm,
    reason: envelope.reason,
    confidenceClass: envelope.confidenceClass,
  };
}

/**
 * Public create policy entry (also re-exported from audio-bpm-rank).
 * Prefer `envelope` from finalize re-probe. Legacy suggest bridge = singleton allowlist only.
 */
export function resolveCreateBpm(params: {
  clientBpm: number;
  envelope?: BpmUncertaintyEnvelope;
  selectionMode?: BpmSelectionMode;
  bpmManualOverride?: boolean;
  /** @deprecated Prefer envelope from re-probe. */
  suggestedBpm?: number | null;
  /** @deprecated Prefer envelope from re-probe. */
  decodeAvailable?: boolean;
}): ResolveCreateBpmResult {
  if (params.envelope) {
    return resolveCreateBpmWithEnvelope({
      clientBpm: params.clientBpm,
      envelope: params.envelope,
      selectionMode: params.selectionMode,
      bpmManualOverride: params.bpmManualOverride,
    });
  }

  if (
    params.decodeAvailable &&
    typeof params.suggestedBpm === "number" &&
    Number.isInteger(params.suggestedBpm)
  ) {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "AUTO_SUGGEST",
      reason: "LEGACY_SUGGEST",
      message: "Wykryto automatycznie.",
      detectedBpm: params.suggestedBpm,
      canonical: null,
      aBpm: params.suggestedBpm,
      bBpm: params.suggestedBpm,
      rawCandidateBpms: [params.suggestedBpm],
    });
    return resolveCreateBpmWithEnvelope({
      clientBpm: params.clientBpm,
      envelope,
      selectionMode: params.selectionMode,
      bpmManualOverride: params.bpmManualOverride,
    });
  }

  if (params.decodeAvailable === false) {
    return {
      ok: false,
      error:
        "Automatyczne wykrywanie BPM jest niedostępne — nie można zapisać arbitralnego BPM.",
    };
  }

  return {
    ok: false,
    error:
      "Brak wiarygodnych kandydatów BPM — nie można zapisać arbitralnego BPM.",
  };
}
