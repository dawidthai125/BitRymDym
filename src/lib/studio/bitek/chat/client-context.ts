import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

import type { BitekChatContext, BitekLang } from "./types";

export type BitekClientContext = {
  /** Sent to the server (no DB ids, no user data). */
  context: BitekChatContext;
  /** Stays in the browser: "t2" → real track id, used when applying a proposal. */
  trackIdByRef: Record<string, string>;
};

export function buildBitekClientContext(params: {
  doc: StudioProjectDocument;
  lang: BitekLang;
  step: "record" | "mix" | "master";
  /** Mastering: whole-song settings + master cards (BITEK hears one stereo track). */
  master?: BitekChatContext["master"];
  analysis?: { verdict: MixVerdict; metrics: MixMetrics; stale: boolean } | null;
}): BitekClientContext {
  const trackIdByRef: Record<string, string> = {};
  const tracks = params.doc.tracks.map((t, i) => {
    const ref = `t${i + 1}`;
    trackIdByRef[ref] = t.id;
    return { ref, name: t.name, role: t.trackRole ?? "other", gainDb: t.gainDb, pan: t.pan, muted: t.muted };
  });
  const a = params.analysis;
  return {
    trackIdByRef,
    context: {
      lang: params.lang,
      step: params.step,
      tracks,
      analysis: a
        ? {
            overall: a.verdict.overall,
            stale: a.stale,
            cards: a.verdict.cards.map((c) => ({ id: c.id, status: c.status, value: c.value ?? null })),
            masterIntegratedLufs: Number.isFinite(a.metrics.master.integratedLufs) ? a.metrics.master.integratedLufs : null,
            masterTruePeakDbtp: Number.isFinite(a.metrics.master.truePeakDbtp) ? a.metrics.master.truePeakDbtp : null,
          }
        : null,
      ...(params.step === "master" && params.master ? { master: params.master } : {}),
    },
  };
}
