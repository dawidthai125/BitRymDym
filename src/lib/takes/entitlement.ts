/**
 * Recording Wave 4 — canonical server-side recording entitlement + retention + anti-abuse policy.
 * Client never supplies account level or limits. Source: PHASE_RECORDING_DESIGN_FREEZE.md
 */

import {
  RECORDING_ANTI_ABUSE,
  RECORDING_GLOBAL_MAX_SECONDS,
  RECORDING_RETENTION_SECONDS,
} from "@/config/recording";
import type { AccountLevel } from "@/types/domain";

/** BEGINNER Quick Take technical max (seconds). */
export const BEGINNER_RECORDING_MAX_SECONDS = 30;

export type RecordingAbuseCaps = {
  maxActiveReady: number;
  maxSessionsPerUtcDay: number;
};

/**
 * Canonical max recording length for an authenticated account level.
 * Anonymous OUT of Wave 4.
 */
export function computeRecordingMaxSeconds(params: {
  accountLevel: AccountLevel | string;
  beatDurationSeconds: number;
}): number {
  const beat = Math.floor(params.beatDurationSeconds);
  if (!Number.isFinite(beat) || beat <= 0) {
    throw new Error("Invalid beat duration.");
  }

  const levelCap =
    params.accountLevel === "PRO_RAPPER" ||
    params.accountLevel === "LEGEND_RAPPER"
      ? RECORDING_GLOBAL_MAX_SECONDS
      : BEGINNER_RECORDING_MAX_SECONDS;

  return Math.min(beat, levelCap);
}

export function retentionSecondsForAccountLevel(
  level: AccountLevel | string,
): number {
  if (level === "PRO_RAPPER") return RECORDING_RETENTION_SECONDS.PRO_RAPPER;
  if (level === "LEGEND_RAPPER") return RECORDING_RETENTION_SECONDS.LEGEND_RAPPER;
  return RECORDING_RETENTION_SECONDS.BEGINNER_RAPPER;
}

export function antiAbuseCapsForAccountLevel(
  level: AccountLevel | string,
): RecordingAbuseCaps {
  if (level === "PRO_RAPPER") return RECORDING_ANTI_ABUSE.PRO_RAPPER;
  if (level === "LEGEND_RAPPER") return RECORDING_ANTI_ABUSE.LEGEND_RAPPER;
  return RECORDING_ANTI_ABUSE.BEGINNER_RAPPER;
}

export function recordingModeForMaxSeconds(
  maxSeconds: number,
): "QUICK" | "FULL" {
  return maxSeconds <= BEGINNER_RECORDING_MAX_SECONDS ? "QUICK" : "FULL";
}

/** Active READY = READY, not deleted, not past expires_at. */
export function isTakeActivelyReady(params: {
  status: string;
  deletedAt: string | null | undefined;
  expiresAt: string;
  nowMs?: number;
}): boolean {
  if (params.status !== "READY") return false;
  if (params.deletedAt) return false;
  const now = params.nowMs ?? Date.now();
  return new Date(params.expiresAt).getTime() > now;
}

export function isTakeExpired(params: {
  expiresAt: string;
  nowMs?: number;
}): boolean {
  const now = params.nowMs ?? Date.now();
  return new Date(params.expiresAt).getTime() <= now;
}
