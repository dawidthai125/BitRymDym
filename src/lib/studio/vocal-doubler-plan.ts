/**
 * 1-click vocal doubler plan — stereo width for hip-hop doubles.
 * Pure numbers; editor applies via existing duplicate + pan/pitch/move APIs.
 */

export const VOCAL_DOUBLER_OFFSET_MS = 18;
export const VOCAL_DOUBLER_DETUNE_CENTS = 5;
export const VOCAL_DOUBLER_PAN = 0.65;
/** Slightly under the lead so the double sits behind. */
export const VOCAL_DOUBLER_GAIN_DB = -2.5;

export type VocalDoublerSide = "L" | "R";

export type VocalDoublerPlan = {
  offsetMs: number;
  pitchCents: number;
  pan: number;
  gainDb: number;
  trackRole: "double";
  nameSuffix: string;
};

export function planVocalDoubler(side: VocalDoublerSide = "R"): VocalDoublerPlan {
  const right = side === "R";
  return {
    offsetMs: VOCAL_DOUBLER_OFFSET_MS,
    pitchCents: right ? VOCAL_DOUBLER_DETUNE_CENTS : -VOCAL_DOUBLER_DETUNE_CENTS,
    pan: right ? VOCAL_DOUBLER_PAN : -VOCAL_DOUBLER_PAN,
    gainDb: VOCAL_DOUBLER_GAIN_DB,
    trackRole: "double",
    nameSuffix: right ? "Dubel R" : "Dubel L",
  };
}

export function planDoubledClipStartMs(
  timelineStartMs: number,
  offsetMs: number = VOCAL_DOUBLER_OFFSET_MS,
): number {
  return Math.max(0, Math.round(timelineStartMs) + Math.round(offsetMs));
}
