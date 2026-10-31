import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import { readBitekLiveTakeLevel } from "@/lib/studio/bitek/live-take-level";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";
import { tuneStyleOf } from "@/lib/studio/tune/tune";

import {
  BITEK_TUNE_ROLES,
  type BitekChatContext,
  type BitekLang,
  type BitekMasterStyle,
  type BitekMasterTarget,
  type BitekMixFixId,
  type BitekTuneLevel,
} from "./types";

/** BRD Tune state of a chain as BITEK sees it: 0 off, 1 natural, 2 hard / custom. */
export function bitekTuneLevelOf(chain: StudioFxChainV1 | null | undefined): BitekTuneLevel {
  const fx = chain?.effects.find((e) => e.type === "tune" && e.enabled);
  if (!fx || fx.type !== "tune") return 0;
  return tuneStyleOf(fx.params) === "natural" ? 1 : 2;
}

export type BitekMixFixResult = { ok: true } | { ok: false; reason: "no-analysis" | "empty" | "failed" };

export type BitekClientContext = {
  /** Sent to the server (no DB ids, no user data). */
  context: BitekChatContext;
  /** Stays in the browser: "t2" → real track id, used when applying a proposal. */
  trackIdByRef: Record<string, string>;
  /** Stays in the browser: current FX chain per real track id (BRD Tune proposals). */
  effectsChainByTrackId: Record<string, StudioFxChainV1>;
  /** Mix step only: plan measured fixes and apply them through the existing mix-working path. */
  applyMixFix?: (fixes: BitekMixFixId[]) => Promise<BitekMixFixResult>;
  /** Mastering step only: apply a whole-song style through the existing setting controls. */
  applyMasterStyle?: (style: BitekMasterStyle) => boolean;
  /** Mastering step only: switch the loudness target (streaming, youtube, headphones, club). */
  applyMasterTarget?: (target: BitekMasterTarget) => boolean;
};

function audioOnTrack(clips: readonly StudioClipDto[], trackId: string): { hasAudio: boolean; clipCount: number; durationMs: number } {
  let clipCount = 0;
  let durationMs = 0;
  for (const clip of clips) {
    if (clip.trackId !== trackId || clip.durationMs <= 0) continue;
    clipCount += 1;
    durationMs += clip.durationMs;
  }
  return { hasAudio: clipCount > 0, clipCount, durationMs };
}

export function buildBitekClientContext(params: {
  doc: StudioProjectDocument;
  lang: BitekLang;
  step: "record" | "mix" | "master";
  /** Mastering: whole-song settings + master cards (BITEK hears one stereo track). */
  master?: BitekChatContext["master"];
  analysis?: { verdict: MixVerdict; metrics: MixMetrics; stale: boolean } | null;
}): BitekClientContext {
  const trackIdByRef: Record<string, string> = {};
  const effectsChainByTrackId: Record<string, StudioFxChainV1> = {};
  const tracks = params.doc.tracks.map((t, i) => {
    const ref = `t${i + 1}`;
    trackIdByRef[ref] = t.id;
    effectsChainByTrackId[t.id] = t.effectsChain;
    const role = t.trackRole ?? "other";
    const audio = audioOnTrack(params.doc.clips, t.id);
    const effects = (t.effectsChain?.effects ?? [])
      .filter((e) => e.enabled && e.type !== "tune")
      .map((e) => e.type)
      .slice(0, 8);
    return {
      ref,
      name: t.name,
      role,
      gainDb: t.gainDb,
      pan: t.pan,
      muted: t.muted,
      solo: t.solo,
      hasAudio: audio.hasAudio,
      clipCount: audio.clipCount,
      durationMs: audio.durationMs,
      ...(effects.length ? { effects } : {}),
      ...(BITEK_TUNE_ROLES.includes(role) ? { tune: bitekTuneLevelOf(t.effectsChain) } : {}),
    };
  });
  const takeLevel = params.step === "record" ? readBitekLiveTakeLevel(params.doc.project.id) : null;
  const a = params.analysis;
  return {
    trackIdByRef,
    effectsChainByTrackId,
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
      ...(takeLevel ? { takeLevel } : {}),
    },
  };
}
