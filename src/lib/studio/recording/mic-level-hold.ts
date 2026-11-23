/**
 * Microphone status for people: one quiet video frame is not "no signal". The loudest level of
 * the last 1.8 s decides, and silence is reported only after it has lasted.
 */
import type { MicLevelState } from "@/hooks/use-mic-analyser";

export const MIC_HOLD_MS = 1_800;
export const MIC_SILENCE_AFTER_MS = 4_500;

/** `checking` = nothing heard yet, but too early to call it a dead microphone. */
export type MicHoldStatus = "checking" | MicLevelState;

export type MicHold = {
  status: MicHoldStatus;
  /** When the level that decides the status was heard. */
  heardAt: number;
  startedAt: number;
};

const RANK: Record<MicLevelState, number> = { silent: 0, quiet: 1, good: 2, hot: 3, clip: 4 };

export function startMicHold(now: number): MicHold {
  return { status: "checking", heardAt: now, startedAt: now };
}

export function nextMicHold(prev: MicHold, level: MicLevelState, now: number): MicHold {
  if (level !== "silent") {
    const current = prev.status === "checking" ? "silent" : prev.status;
    if (RANK[level] >= RANK[current] || now - prev.heardAt > MIC_HOLD_MS) {
      return { ...prev, status: level, heardAt: now };
    }
    return prev;
  }
  if (prev.status === "silent") return prev;
  return now - prev.heardAt >= MIC_SILENCE_AFTER_MS ? { ...prev, status: "silent" } : prev;
}
