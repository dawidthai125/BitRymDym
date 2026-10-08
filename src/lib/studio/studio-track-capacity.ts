/**
 * Phase 5/6 — Track capacity + CRUD planning (pure, no I/O).
 * Premium SSOT: PremiumTierLimits.studioMaxTracks (BEAT counts; Master does not).
 */

import { defaultTrackName } from "@/lib/studio/studio-track-ops";
import type { StudioTrackType } from "@/config/studio";
import type { PremiumTier } from "@/types/premium";

export const TRACK_CAPACITY_REACHED = "TRACK_CAPACITY_REACHED" as const;
export const BEAT_TRACK_PROTECTED = "BEAT_TRACK_PROTECTED" as const;

export class StudioTrackCapacityError extends Error {
  readonly code = TRACK_CAPACITY_REACHED;

  constructor(message = "Osiągnięto limit ścieżek.") {
    super(message);
    this.name = "StudioTrackCapacityError";
  }
}

export class StudioBeatTrackProtectedError extends Error {
  readonly code = BEAT_TRACK_PROTECTED;

  constructor(
    message = "Ścieżki Bit nie można usunąć ani zduplikować.",
  ) {
    super(message);
    this.name = "StudioBeatTrackProtectedError";
  }
}

/** True when another track may be inserted under `maxTracks`. */
export function canAddStudioTrack(params: {
  currentTrackCount: number;
  maxTracks: number;
}): boolean {
  if (
    !Number.isInteger(params.currentTrackCount) ||
    params.currentTrackCount < 0
  ) {
    throw new Error("currentTrackCount must be a non-negative integer.");
  }
  if (!Number.isInteger(params.maxTracks) || params.maxTracks < 1) {
    throw new Error("maxTracks must be a positive integer.");
  }
  return params.currentTrackCount < params.maxTracks;
}

export function assertCanAddStudioTrack(params: {
  currentTrackCount: number;
  maxTracks: number;
}): void {
  if (!canAddStudioTrack(params)) {
    throw new StudioTrackCapacityError();
  }
}

/**
 * Concurrent add/duplicate safety model: serialised checks under one lock
 * never exceed N. Used by contract tests (no live DB required).
 */
export function simulateConcurrentAddTrackAttempts(params: {
  initialCount: number;
  maxTracks: number;
  attempts: number;
}): { accepted: number; rejected: number; finalCount: number } {
  return simulateConcurrentTrackCapacityOps({
    initialCount: params.initialCount,
    maxTracks: params.maxTracks,
    ops: Array.from({ length: params.attempts }, () => "add" as const),
  });
}

export function simulateConcurrentTrackCapacityOps(params: {
  initialCount: number;
  maxTracks: number;
  ops: ReadonlyArray<"add" | "duplicate">;
}): { accepted: number; rejected: number; finalCount: number } {
  let count = params.initialCount;
  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < params.ops.length; i++) {
    // add and duplicate both consume one track slot under the same lock.
    if (canAddStudioTrack({ currentTrackCount: count, maxTracks: params.maxTracks })) {
      count += 1;
      accepted += 1;
    } else {
      rejected += 1;
    }
  }
  return { accepted, rejected, finalCount: count };
}

/** sortOrder for a newly appended track. */
export function nextTrackSortOrder(
  existingSortOrders: readonly number[],
): number {
  if (existingSortOrders.length === 0) return 0;
  let max = existingSortOrders[0]!;
  for (const n of existingSortOrders) {
    if (n > max) max = n;
  }
  return max + 1;
}

/** Strip trailing ` N` → base name for numbering. */
export function trackNameBase(name: string): string {
  const trimmed = name.trim();
  const match = /^(.*)\s+(\d+)$/.exec(trimmed);
  if (match && match[1]!.trim().length > 0) return match[1]!.trim();
  return trimmed || "Ścieżka";
}

/**
 * Next free numbered name for a base: Wokal → Wokal 2 → Wokal 3.
 */
export function nextNumberedTrackName(
  base: string,
  existingNames: readonly string[],
): string {
  const root = base.trim() || "Ścieżka";
  if (!existingNames.includes(root)) return root;
  let n = 2;
  while (existingNames.includes(`${root} ${n}`)) n += 1;
  return `${root} ${n}`;
}

/**
 * Default names: Wokal, Wokal 2, Wokal 3… (Phase 5 — VOCAL only).
 */
export function nextVocalTrackName(existingNames: readonly string[]): string {
  return nextNumberedTrackName(defaultTrackName("VOCAL"), existingNames);
}

/**
 * Duplicate naming: Wokal → Wokal 2; Wokal 2 → Wokal 3; Adlib → Adlib 2.
 */
export function nextDuplicatedTrackName(
  sourceName: string,
  existingNames: readonly string[],
): string {
  return nextNumberedTrackName(trackNameBase(sourceName), existingNames);
}

export function assertTrackTypeDeletable(trackType: StudioTrackType): void {
  if (trackType === "BEAT") {
    throw new StudioBeatTrackProtectedError(
      "Ścieżki Bit nie można usunąć.",
    );
  }
}

export function assertTrackTypeDuplicable(trackType: StudioTrackType): void {
  if (trackType === "BEAT") {
    throw new StudioBeatTrackProtectedError(
      "Ścieżki Bit nie można zduplikować.",
    );
  }
}

/** Compact capacity label — Master excluded (not in trackCount). */
export function formatStudioTrackCapacityLabel(
  trackCount: number,
  maxTracks: number,
): string {
  return `${trackCount} / ${maxTracks}`;
}

/** Compact mobile label without spaces. */
export function formatStudioTrackCapacityLabelCompact(
  trackCount: number,
  maxTracks: number,
): string {
  return `${trackCount}/${maxTracks}`;
}

/**
 * Upgrade CTA for FREE/BRONZE/SILVER when at capacity.
 * GOLD has max package — no upgrade CTA.
 */
export function shouldShowStudioTrackUpgradeCta(params: {
  premiumTier: PremiumTier;
  trackCount: number;
  maxTracks: number;
}): boolean {
  if (params.premiumTier === "GOLD") return false;
  return params.trackCount >= params.maxTracks;
}

/** Phase 5 add always creates VOCAL. */
export const STUDIO_ADD_TRACK_DEFAULT_TYPE: StudioTrackType = "VOCAL";

/** Existing account hub for package changes (no billing system in Phase 6). */
export const STUDIO_TRACK_UPGRADE_HREF = "/account";
