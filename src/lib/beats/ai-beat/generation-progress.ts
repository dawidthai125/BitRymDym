export type BeatGenerationPhase = "starting" | "waiting" | "saving" | "ready";

/**
 * Stable Audio answers only "still working" or "file ready". It never sends a percent.
 * Waiting therefore climbs with each check and stops at 92 until the file exists.
 */
export function beatGenerationPercent(
  phase: BeatGenerationPhase,
  pendingPolls: number,
): number {
  if (phase === "starting") return 12;
  if (phase === "waiting") {
    const polls = Number.isFinite(pendingPolls) ? Math.max(0, Math.floor(pendingPolls)) : 0;
    return Math.min(92, 28 + polls * 8);
  }
  if (phase === "saving") return 96;
  return 100;
}
