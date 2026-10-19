/**
 * Pure UX helpers over BpmUncertaintyEnvelope.
 * No detector logic — presentation + client-side gate only.
 * Server allowlist remains the security boundary.
 */

import type {
  BpmConfidenceClass,
  BpmSelectionMode,
  BpmUncertaintyEnvelope,
} from "@/lib/beats/bpm-uncertainty";

export type BpmUxPhase =
  | "IDLE"
  | "ANALYZING"
  | "AUTO_DETECTED"
  | "NEEDS_SELECTION"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "FINALIZING"
  | "STALE_ANALYSIS"
  | "INVALID_BPM_SELECTION"
  | "FINALIZE_ERROR"
  | "READY";

export type BpmUxOption = {
  bpm: number;
  label: string;
  hint?: string;
  /** Hypothesis id when CONFLICT */
  hypothesisId?: string;
};

export type BpmUxModel = {
  phase: Exclude<
    BpmUxPhase,
    "IDLE" | "ANALYZING" | "FINALIZING" | "STALE_ANALYSIS" | "INVALID_BPM_SELECTION" | "FINALIZE_ERROR" | "READY"
  >;
  confidenceClass: BpmConfidenceClass;
  headline: string;
  description: string;
  detectedBpm: number | null;
  /** Preselected when HIGH; null when user must choose. */
  recommendedBpm: number | null;
  options: BpmUxOption[];
  allowlist: number[];
  range: { min: number; max: number } | null;
  requiresSelection: boolean;
  canProceed: boolean;
  /** Selection mode to send on finalize for the current recommended/auto value. */
  defaultSelectionMode: BpmSelectionMode | null;
};

function uniqSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function optionLabel(bpm: number): string {
  return `${bpm} BPM`;
}

function conflictHypothesisLabel(bpm: number): string {
  return `Hipoteza ${bpm} BPM`;
}

/**
 * Clear composite/signal-score leader among allowlisted candidates.
 * Presentation only — never drives recommendedBpm under CONFLICT.
 * Returns null when scores are missing, tied, or margin is too small.
 */
function resolveClearTopSignalBpm(
  candidates: BpmUncertaintyEnvelope["candidates"],
  allowlist: readonly number[],
): number | null {
  const scored = candidates
    .filter(
      (c) =>
        allowlist.includes(c.bpm) &&
        typeof c.score === "number" &&
        Number.isFinite(c.score),
    )
    .map((c) => ({ bpm: c.bpm, score: c.score }))
    .sort((a, b) => b.score - a.score || a.bpm - b.bpm);

  if (scored.length === 0) return null;
  const top = scored[0]!;
  if (!(top.score > 0)) return null;

  const runner = scored[1];
  /** Minimum absolute composite gap to call out a signal leader in UI copy. */
  const CLEAR_SCORE_MARGIN = 0.05;
  if (runner != null && top.score - runner.score < CLEAR_SCORE_MARGIN) {
    return null;
  }
  return top.bpm;
}

function formatConflictScore(score: number): string {
  return score.toFixed(2);
}

/**
 * Build presentational model from server envelope.
 * Options are always filtered to allowlist — never invent BPM values.
 */
export function buildBpmUxModel(
  envelope: BpmUncertaintyEnvelope,
): BpmUxModel {
  const allowlist = uniqSorted(envelope.allowlist);

  if (
    envelope.decision === "UNAVAILABLE" ||
    envelope.confidenceClass === "UNAVAILABLE" ||
    allowlist.length === 0
  ) {
    return {
      phase: "UNAVAILABLE",
      confidenceClass: "UNAVAILABLE",
      headline: "Nie udało się bezpiecznie określić BPM tego pliku.",
      description:
        "Automatyczne wykrywanie BPM jest niedostępne dla tego audio. Nie można przejść dalej bez bezpiecznej wartości systemowej.",
      detectedBpm: null,
      recommendedBpm: null,
      options: [],
      allowlist: [],
      range: null,
      requiresSelection: false,
      canProceed: false,
      defaultSelectionMode: null,
    };
  }

  if (envelope.confidenceClass === "HIGH") {
    const detected = envelope.detectedBpm;
    const options: BpmUxOption[] = allowlist.map((bpm) => ({
      bpm,
      label: optionLabel(bpm),
      hint:
        detected != null && bpm === detected
          ? "wykryte automatycznie"
          : "opcja systemu",
    }));
    return {
      phase: "AUTO_DETECTED",
      confidenceClass: "HIGH",
      headline: "BPM wykryte automatycznie",
      description: "Wysoka pewność — możesz zapisać bez dodatkowej akcji.",
      detectedBpm: detected,
      recommendedBpm: detected,
      options,
      allowlist,
      range: envelope.range,
      requiresSelection: false,
      canProceed: detected != null && allowlist.includes(detected),
      defaultSelectionMode: "AUTO",
    };
  }

  if (envelope.confidenceClass === "CONFLICT") {
    const topSignalBpm = resolveClearTopSignalBpm(
      envelope.candidates,
      allowlist,
    );
    const topSignalScore =
      topSignalBpm != null
        ? envelope.candidates.find((c) => c.bpm === topSignalBpm)?.score
        : undefined;

    // Preserve hypothesis iteration order from the envelope (presentation ≠ ranking).
    // Do not re-sort by composite — that would conflate display order with quality.
    const hypOptions: BpmUxOption[] = [];
    for (const h of envelope.hypotheses) {
      for (const bpm of uniqSorted(h.members)) {
        if (!allowlist.includes(bpm)) continue;
        if (hypOptions.some((o) => o.bpm === bpm)) continue;
        const isClearTop = topSignalBpm != null && bpm === topSignalBpm;
        hypOptions.push({
          bpm,
          label: conflictHypothesisLabel(bpm),
          hint: isClearTop
            ? typeof topSignalScore === "number" &&
              Number.isFinite(topSignalScore)
              ? `Najwyższy score sygnałowy (${formatConflictScore(topSignalScore)})`
              : "Najwyższy score sygnałowy"
            : undefined,
          hypothesisId: h.id,
        });
      }
    }
    // Fallback: allowlist if hypotheses empty — still no array-order preference.
    const options =
      hypOptions.length > 0
        ? hypOptions
        : allowlist.map((bpm) => {
            const isClearTop = topSignalBpm != null && bpm === topSignalBpm;
            const score = envelope.candidates.find((c) => c.bpm === bpm)?.score;
            return {
              bpm,
              label: conflictHypothesisLabel(bpm),
              hint: isClearTop
                ? typeof score === "number" && Number.isFinite(score)
                  ? `Najwyższy score sygnałowy (${formatConflictScore(score)})`
                  : "Najwyższy score sygnałowy"
                : undefined,
            };
          });

    const reasonSuffix =
      envelope.reason.trim().length > 0 && envelope.reason !== "TEST"
        ? ` Powód konfliktu: ${envelope.reason}.`
        : "";

    return {
      phase: "CONFLICT",
      confidenceClass: "CONFLICT",
      headline: "System nie może jednoznacznie określić BPM.",
      description:
        "Wybierz jedną z systemowych hipotez. Ranking sygnałowy nie oznacza automatycznej decyzji o tempie." +
        reasonSuffix,
      detectedBpm: envelope.detectedBpm,
      recommendedBpm: null,
      options,
      allowlist,
      range: null,
      requiresSelection: true,
      canProceed: false,
      defaultSelectionMode: null,
    };
  }

  // MEDIUM / LOW — ranked candidates; optional narrow range as discrete options
  const fromCandidates = envelope.candidates
    .map((c) => c.bpm)
    .filter((bpm) => allowlist.includes(bpm));
  let optionBpms = uniqSorted(
    fromCandidates.length > 0 ? fromCandidates : allowlist,
  );

  if (
    envelope.range != null &&
    envelope.range.max - envelope.range.min <= 1
  ) {
    const ranged: number[] = [];
    for (let v = envelope.range.min; v <= envelope.range.max; v += 1) {
      if (allowlist.includes(v)) ranged.push(v);
    }
    if (ranged.length > 0) {
      optionBpms = uniqSorted([...optionBpms, ...ranged]);
    }
  }

  // MEDIUM: soft recommend. LOW: no preferred default (force explicit pick).
  const recommended =
    envelope.confidenceClass === "MEDIUM" &&
    envelope.detectedBpm != null &&
    allowlist.includes(envelope.detectedBpm)
      ? envelope.detectedBpm
      : null;

  const options: BpmUxOption[] = optionBpms.map((bpm, idx) => ({
    bpm,
    label: optionLabel(bpm),
    hint:
      recommended != null && bpm === recommended
        ? "rekomendacja systemu"
        : idx === 0
          ? "kandydat systemu"
          : idx === 1
            ? "alternatywa"
            : "kandydat systemu",
  }));

  return {
    phase: "NEEDS_SELECTION",
    confidenceClass: envelope.confidenceClass,
    headline:
      envelope.confidenceClass === "LOW"
        ? "System nie ma pełnej pewności"
        : "System sugeruje tempo",
    description:
      envelope.confidenceClass === "LOW"
        ? "Wybierz najlepszą wartość spośród wykrytych kandydatów systemowych."
        : "System proponuje tempo — wybierz rekomendację lub inną wartość spośród kandydatów.",
    detectedBpm: envelope.detectedBpm,
    recommendedBpm: recommended,
    options,
    allowlist,
    range: envelope.range,
    requiresSelection: true,
    canProceed: false,
    defaultSelectionMode: null,
  };
}

/** Client may proceed only with an allowlisted integer. */
export function canProceedWithBpmSelection(params: {
  envelope: BpmUncertaintyEnvelope | null;
  selectedBpm: number | null;
}): boolean {
  if (!params.envelope) return false;
  const model = buildBpmUxModel(params.envelope);
  if (model.phase === "UNAVAILABLE") return false;
  if (params.selectedBpm == null) return false;
  if (!Number.isInteger(params.selectedBpm)) return false;
  return model.allowlist.includes(params.selectedBpm);
}

export function resolveBpmSelectionMode(params: {
  envelope: BpmUncertaintyEnvelope;
  selectedBpm: number;
}): BpmSelectionMode {
  const model = buildBpmUxModel(params.envelope);
  if (
    model.phase === "AUTO_DETECTED" &&
    model.detectedBpm != null &&
    params.selectedBpm === model.detectedBpm
  ) {
    return "AUTO";
  }
  if (
    model.range != null &&
    params.selectedBpm >= model.range.min &&
    params.selectedBpm <= model.range.max &&
    !model.options.some((o) => o.bpm === params.selectedBpm)
  ) {
    return "RANGE";
  }
  return "CANDIDATE";
}

/** Map server finalize errors to Polish UX phase + message. */
export function mapFinalizeBpmError(error: string | null | undefined): {
  phase: BpmUxPhase;
  message: string;
} {
  const raw = (error ?? "").trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("spoza wartości") ||
    lower.includes("allowlist") ||
    lower.includes("niezgodny z automatyczną")
  ) {
    return {
      phase: "STALE_ANALYSIS",
      message:
        "Wybór BPM jest już nieaktualny względem ponownej analizy pliku. Wybierz ponownie jedną z aktualnych wartości systemu.",
    };
  }
  if (
    lower.includes("niedostępne") ||
    lower.includes("unavailable") ||
    lower.includes("brak wiarygodnych kandydatów")
  ) {
    return {
      phase: "UNAVAILABLE",
      message:
        "Nie udało się bezpiecznie określić BPM tego pliku. Nie można zakończyć uploadu.",
    };
  }
  if (
    lower.includes("blocked_bpm_selection_required") ||
    lower.includes("selection_required")
  ) {
    return {
      phase: "INVALID_BPM_SELECTION",
      message:
        "System nie może jednoznacznie określić BPM. Wybierz jedną z wartości systemowych.",
    };
  }
  if (lower.includes("musi być liczbą") || lower.includes("1–300")) {
    return {
      phase: "INVALID_BPM_SELECTION",
      message: "Wybierz prawidłowe BPM spośród wartości zaproponowanych przez system.",
    };
  }
  if (raw && /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(raw)) {
    return { phase: "FINALIZE_ERROR", message: raw };
  }
  return {
    phase: "FINALIZE_ERROR",
    message: "Nie udało się zapisać beatu. Spróbuj ponownie.",
  };
}

export function confidenceClassLabel(c: BpmConfidenceClass): string {
  switch (c) {
    case "HIGH":
      return "Wysoka pewność";
    case "MEDIUM":
      return "Średnia pewność";
    case "LOW":
      return "Niska pewność";
    case "CONFLICT":
      return "Konflikt hipotez";
    case "UNAVAILABLE":
      return "Niedostępne";
    default:
      return "Nieokreślone";
  }
}
