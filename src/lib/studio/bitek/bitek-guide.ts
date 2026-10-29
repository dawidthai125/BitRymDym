/**
 * Stage 1 — BITEK v1: rule-based Studio guide (no LLM, no network).
 * `BitekBrain` is the seam for a future language-model backend (stage 2b):
 * it receives the same structured state and returns the same message shape,
 * so the panel does not change when a model is plugged in.
 */

import type { MixCardId, MixCardStatus, MixVerdict } from "@/lib/studio/mix-analysis/verdict";

export type BitekStep = "record" | "mix";

export type BitekAnalysisState =
  | { status: "idle" }
  | { status: "running"; progress: number }
  | { status: "failed"; reason: string }
  | { status: "done"; verdict: MixVerdict; stale: boolean };

export type BitekState = {
  step: BitekStep;
  hasBeat: boolean;
  vocalTrackCount: number;
  vocalClipCount: number;
  recording: boolean;
  analysis: BitekAnalysisState;
};

export type BitekAction = "goMix" | "goRecord" | "analyze" | "chooseBeat" | "record";

export type BitekMessage = {
  id: string;
  /** i18n key under studio.bitek.msg */
  key: string;
  params?: Record<string, string | number>;
  tone: "info" | "ok" | "warn" | "tip";
  action?: BitekAction;
};

export interface BitekBrain {
  readonly kind: "rules" | "llm";
  guide(state: BitekState): BitekMessage[];
}

const CARD_ORDER: readonly MixCardId[] = [
  "clipping",
  "balance",
  "presence",
  "masking",
  "noise",
  "sibilance",
  "stereo",
  "panorama",
  "loudness",
];

function worst(verdict: MixVerdict, status: MixCardStatus) {
  return CARD_ORDER.map((id) => verdict.cards.find((c) => c.id === id)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c && c.status === status),
  );
}

export function bitekRulesGuide(state: BitekState): BitekMessage[] {
  const out: BitekMessage[] = [];
  if (state.recording) {
    return [{ id: "recording", key: "recording", tone: "info" }];
  }
  if (state.step === "record") {
    if (!state.hasBeat) {
      out.push({ id: "no-beat", key: "chooseBeat", tone: "tip", action: "chooseBeat" });
      return out;
    }
    if (state.vocalClipCount === 0) {
      out.push({ id: "no-vocal", key: "recordVocal", tone: "tip", action: "record" });
      return out;
    }
    out.push({ id: "ready-mix", key: "readyForMix", tone: "ok", params: { count: state.vocalClipCount }, action: "goMix" });
    return out;
  }
  // Mix step.
  if (state.vocalClipCount === 0) {
    out.push({ id: "mix-empty", key: "mixNeedsVocal", tone: "warn", action: "goRecord" });
    return out;
  }
  const a = state.analysis;
  if (a.status === "idle") {
    out.push({ id: "mix-intro", key: "mixIntro", tone: "info", action: "analyze" });
    return out;
  }
  if (a.status === "running") {
    out.push({ id: "mix-running", key: "mixRunning", tone: "info", params: { pct: Math.round(a.progress * 100) } });
    return out;
  }
  if (a.status === "failed") {
    out.push({ id: "mix-failed", key: "mixFailed", tone: "warn", params: { reason: a.reason }, action: "analyze" });
    return out;
  }
  if (a.stale) {
    out.push({ id: "mix-stale", key: "mixStale", tone: "tip", action: "analyze" });
  }
  const reds = worst(a.verdict, "red");
  const yellows = worst(a.verdict, "yellow");
  if (reds.length > 0) {
    out.push({ id: "mix-red", key: "mixHasRed", tone: "warn", params: { count: reds.length } });
    out.push({ id: `fix-${reds[0].id}`, key: `fix.${reds[0].id}`, tone: "tip" });
    if (reds.length > 1) out.push({ id: `fix-${reds[1].id}`, key: `fix.${reds[1].id}`, tone: "tip" });
    out.push({ id: "mix-recheck", key: "mixRecheck", tone: "info", action: "analyze" });
    return out;
  }
  if (yellows.length > 0) {
    out.push({ id: "mix-yellow", key: "mixHasYellow", tone: "ok", params: { count: yellows.length } });
    out.push({ id: `fix-${yellows[0].id}`, key: `fix.${yellows[0].id}`, tone: "tip" });
  } else {
    out.push({ id: "mix-green", key: "mixAllGreen", tone: "ok" });
  }
  out.push({ id: "mix-master", key: "mixReadyForMaster", tone: "info" });
  return out;
}

export const bitekRulesBrain: BitekBrain = {
  kind: "rules",
  guide: bitekRulesGuide,
};
