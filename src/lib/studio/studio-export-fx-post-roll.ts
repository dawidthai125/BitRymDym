/**
 * STUDIO_EXPORT OD-SFM-F04 — FX post-roll policy (pure).
 *
 * When enabled delay/reverb with wet mix > 0 exists on track or master chains,
 * request a bounded post-roll after timelineLengthMs so inserts can ring out.
 *
 * Conservative + deterministic:
 * - bypassed / disabled effects → 0 contribution
 * - delay with mix > 0 → full MAX (feedback can exceed MAX; not full ring-down)
 * - reverb with mix > 0 → min(MAX, ceil(decaySeconds*1000))
 * - 3000 ms does NOT guarantee full audible decay for high-feedback delay
 * - if timeline + required post-roll > 180s → typed TAIL_DURATION_CAP (no silent trim)
 */

import { STUDIO_EXPORT_FX_POST_ROLL_MAX_MS } from "@/config/audio-render";
import {
  readStudioFxChain,
  type StudioFxChainV1,
  type StudioFxInstance,
} from "@/lib/studio/studio-fx-chain";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
  StudioOfflineRenderError,
} from "@/lib/studio/studio-offline-render";

export { STUDIO_EXPORT_FX_POST_ROLL_MAX_MS };

export type StudioExportPostRollPlan = {
  timelineMs: number;
  postRollMs: number;
  exportDurationMs: number;
  /** True when any enabled delay/reverb with mix>0 contributed. */
  needsPostRoll: boolean;
};

function contributionFromEffect(effect: StudioFxInstance): number {
  if (!effect.enabled) return 0;
  if (effect.type === "delay") {
    if (!(effect.params.mix > 0)) return 0;
    // Feedback delay can ring longer than MAX — request full budget; document limit.
    return STUDIO_EXPORT_FX_POST_ROLL_MAX_MS;
  }
  if (effect.type === "reverb") {
    if (!(effect.params.mix > 0)) return 0;
    const decayMs = Math.ceil(
      Math.max(0, effect.params.decaySeconds) * 1000,
    );
    if (!Number.isFinite(decayMs)) return 0;
    return Math.min(STUDIO_EXPORT_FX_POST_ROLL_MAX_MS, decayMs);
  }
  return 0;
}

function maxContributionFromChain(raw: unknown, role: "track" | "master"): number {
  const chain: StudioFxChainV1 | null = readStudioFxChain(raw, role);
  if (!chain) return 0;
  let max = 0;
  for (const effect of chain.effects) {
    const c = contributionFromEffect(effect);
    if (c > max) max = c;
  }
  return max;
}

/**
 * Compute required post-roll from document FX contracts (not from live audio).
 */
export function computeStudioExportPostRollMs(
  document: StudioEngineDocument,
): number {
  let needed = 0;
  for (const track of document.tracks) {
    const c = maxContributionFromChain(track.effectsChain, "track");
    if (c > needed) needed = c;
  }
  const master = maxContributionFromChain(document.masterFxChain, "master");
  if (master > needed) needed = master;
  if (!Number.isFinite(needed) || needed < 0) return 0;
  return Math.min(STUDIO_EXPORT_FX_POST_ROLL_MAX_MS, Math.trunc(needed));
}

/**
 * Resolve export duration = timeline + post-roll with hard fail on overflow.
 * Never silently truncates the post-roll to fit the 180s cap.
 */
export function resolveStudioExportDurationMs(params: {
  timelineLengthMs: number;
  postRollMs?: number;
  maxDurationMs?: number;
}): StudioExportPostRollPlan {
  const maxCap =
    params.maxDurationMs ?? STUDIO_OFFLINE_RENDER_MAX_DURATION_MS;
  if (
    !Number.isFinite(maxCap) ||
    maxCap < 1 ||
    maxCap > STUDIO_OFFLINE_RENDER_MAX_DURATION_MS
  ) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_DURATION_CAP",
      `maxDurationMs must be in 1…${STUDIO_OFFLINE_RENDER_MAX_DURATION_MS}.`,
    );
  }

  const timelineMs = Math.trunc(params.timelineLengthMs);
  if (!Number.isFinite(timelineMs) || timelineMs < 1) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_EMPTY_SESSION",
      "Timeline length must be a positive integer ms.",
    );
  }
  if (timelineMs > maxCap) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_DURATION_CAP",
      `Timeline ${timelineMs}ms exceeds cap ${maxCap}ms.`,
    );
  }

  const rawPost =
    params.postRollMs === undefined
      ? 0
      : Math.trunc(params.postRollMs);
  if (!Number.isFinite(rawPost) || rawPost < 0) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_DURATION_CAP",
      "postRollMs must be a non-negative finite integer.",
    );
  }
  const postRollMs = Math.min(STUDIO_EXPORT_FX_POST_ROLL_MAX_MS, rawPost);
  const exportDurationMs = timelineMs + postRollMs;

  if (exportDurationMs > maxCap) {
    throw new StudioOfflineRenderError(
      "STUDIO_RENDER_TAIL_DURATION_CAP",
      `Timeline ${timelineMs}ms + FX post-roll ${postRollMs}ms = ${exportDurationMs}ms exceeds cap ${maxCap}ms (OD-SFM-F04: no silent tail trim).`,
    );
  }

  return {
    timelineMs,
    postRollMs,
    exportDurationMs,
    needsPostRoll: postRollMs > 0,
  };
}

/**
 * Convenience: plan from engine document FX + timeline.
 */
export function planStudioExportDuration(
  document: StudioEngineDocument,
  options?: { maxDurationMs?: number },
): StudioExportPostRollPlan {
  const postRollMs = computeStudioExportPostRollMs(document);
  return resolveStudioExportDurationMs({
    timelineLengthMs: document.timelineLengthMs,
    postRollMs,
    maxDurationMs: options?.maxDurationMs,
  });
}
