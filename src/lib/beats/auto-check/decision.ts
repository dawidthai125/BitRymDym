import type {
  AutoCheckVerdict,
  RecognitionMatch,
  RecognitionProviderResult,
  VocalResult,
} from "@/lib/beats/auto-check/types";

/**
 * Upload filter decision (owner decisions 2026-10-29):
 * - vocals: ZERO tolerance → any sustained vocal evidence auto-rejects;
 * - hard recognition match → auto-reject;
 * - anything missing/failed → error (beat stays PENDING_REVIEW, never passes);
 * - passing never publishes; moderators still approve.
 */
export const AUTO_CHECK_THRESHOLDS = {
  /** Own catalog Chromaprint similarity (0..1) for a hard match. */
  ownCatalogHardScore: 0.85,
  ownCatalogMinSeconds: 20,
  /** External recognition (AcoustID score 0..1). */
  externalHardScore: 0.9,
  /** Vocal stem window threshold (dBFS RMS) used by the worker. */
  vocalWindowDb: -30,
  /**
   * Zero tolerance with a noise floor: ≥ 2 vocal windows (≥ 2 s) or ratio ≥ 2 %.
   * A single 1 s blip is treated as separation bleed, still kept as evidence.
   */
  vocalMinWindows: 2,
  vocalMinRatio: 0.02,
  /** Pre-screen alone (no separation) cannot pass; it can only reject. */
  prescreenRejectScore: 0.8,
} as const;

export const AUTO_CHECK_MESSAGES_PL = {
  passed:
    "Automatyczne sprawdzenie zakończone. Bit czeka teraz na moderację.",
  rejectedVocals:
    "Wykryliśmy w bicie wokal lub mowę. Przyjmujemy wyłącznie czyste instrumentale. Usuń wokal i wgraj nowy master. Jeśli to pomyłka (np. syntezator), możesz poprosić o ponowne sprawdzenie przez moderatora.",
  rejectedMatch:
    "Nagranie jest bardzo podobne do istniejącego utworu. Nie możemy go przyjąć. Jeśli masz do niego prawa, poproś o weryfikację przez moderatora.",
  error:
    "Automatyczne sprawdzenie chwilowo nie działa. Bit czeka w kolejce i nie zostanie opublikowany bez sprawdzenia.",
  needsConfig:
    "Filtr uploadu nie jest jeszcze w pełni skonfigurowany. Bit czeka w kolejce na sprawdzenie.",
} as const;

function isHardMatch(m: RecognitionMatch, provider: string): boolean {
  if (provider === "own_catalog") {
    return (
      m.score >= AUTO_CHECK_THRESHOLDS.ownCatalogHardScore &&
      (m.matchedSeconds ?? 0) >= AUTO_CHECK_THRESHOLDS.ownCatalogMinSeconds
    );
  }
  return m.score >= AUTO_CHECK_THRESHOLDS.externalHardScore;
}

function round4(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, Math.round(n * 10000) / 10000));
}

export function decideAutoCheck(input: {
  recognition: RecognitionProviderResult[];
  vocal: VocalResult;
}): AutoCheckVerdict {
  const { recognition, vocal } = input;
  let bestScore: number | null = null;
  let hard: RecognitionMatch | null = null;
  for (const p of recognition) {
    for (const m of p.matches) {
      bestScore = bestScore === null ? m.score : Math.max(bestScore, m.score);
      if (!hard && isHardMatch(m, p.provider)) hard = m;
    }
  }

  const windows = vocal.windows.length;
  const ratio = vocal.ratio;
  const prescreen = vocal.prescreenScore ?? null;
  const vocalEvidence =
    (vocal.outcome === "ok" &&
      ratio !== null &&
      (windows >= AUTO_CHECK_THRESHOLDS.vocalMinWindows ||
        ratio >= AUTO_CHECK_THRESHOLDS.vocalMinRatio)) ||
    (prescreen !== null && prescreen >= AUTO_CHECK_THRESHOLDS.prescreenRejectScore);

  const base = {
    recognitionScore: round4(bestScore),
    vocalRatio: round4(ratio),
    vocalConfidence: round4(prescreen),
  };

  // Rejections stand even if another step failed: the evidence is real.
  if (hard) {
    return { ...base, status: "rejected_match", errorCode: null, summaryPl: AUTO_CHECK_MESSAGES_PL.rejectedMatch };
  }
  if (vocalEvidence) {
    return { ...base, status: "rejected_vocals", errorCode: null, summaryPl: AUTO_CHECK_MESSAGES_PL.rejectedVocals };
  }

  // Passing requires: own-catalog matching ran AND vocal separation ran.
  const own = recognition.find((p) => p.provider === "own_catalog");
  const ownRan = own !== undefined && (own.outcome === "no_match" || own.outcome === "ok" || own.outcome === "match");
  if (!own || own.outcome === "not_configured" || vocal.outcome === "not_configured") {
    return { ...base, status: "error", errorCode: "needs_config", summaryPl: AUTO_CHECK_MESSAGES_PL.needsConfig };
  }
  const requiredFailed = recognition.some(
    (p) => p.required && (p.outcome === "error" || p.outcome === "timeout"),
  );
  if (!ownRan || requiredFailed || vocal.outcome !== "ok" || ratio === null) {
    const code = vocal.outcome === "timeout" ? "timeout" : vocal.errorCode ?? own.errorCode ?? "provider_error";
    return { ...base, status: "error", errorCode: code, summaryPl: AUTO_CHECK_MESSAGES_PL.error };
  }
  return { ...base, status: "passed", errorCode: null, summaryPl: AUTO_CHECK_MESSAGES_PL.passed };
}
