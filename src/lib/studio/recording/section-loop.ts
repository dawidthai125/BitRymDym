/**
 * Studio recording P0 — section loop / punch-in geometry + alignment (pure).
 *
 * One continuous MediaRecorder capture = one take (one daily session).
 * Loop passes are sub-ranges of that take addressed by sourceOffsetMs.
 */

export const SECTION_BAR_OPTIONS = [4, 8, 16] as const;
export type SectionBars = (typeof SECTION_BAR_OPTIONS)[number];

export function barIndexAt(ms: number, barMs: number): number {
  if (!(barMs > 0)) return 0;
  return Math.max(0, Math.floor((ms + 1e-6) / barMs));
}

export function snapToBarMs(
  ms: number,
  barMs: number,
  mode: "floor" | "nearest" = "nearest",
): number {
  if (!(barMs > 0)) return Math.max(0, Math.round(ms));
  const q = ms / barMs;
  const n = mode === "floor" ? Math.floor(q + 1e-6) : Math.round(q);
  return Math.max(0, Math.round(n * barMs));
}

export type MsRange = { startMs: number; endMs: number };

/** Bar-snapped section [start, start + bars) clamped to the timeline (≥ 1 bar). */
export function sectionRange(params: {
  startMs: number;
  bars: number;
  barMs: number;
  timelineLengthMs: number;
}): MsRange | null {
  const { barMs, timelineLengthMs } = params;
  if (!(barMs > 0) || !(timelineLengthMs > 0)) return null;
  const totalBars = Math.floor((timelineLengthMs + 1) / barMs);
  if (totalBars < 1) return null;
  const bars = Math.max(1, Math.min(Math.round(params.bars), totalBars));
  const startBar = Math.min(
    barIndexAt(params.startMs, barMs),
    totalBars - bars,
  );
  return {
    startMs: Math.round(startBar * barMs),
    endMs: Math.round((startBar + bars) * barMs),
  };
}

/** Lines of a section (default line = 1 bar). Last line is clipped to the end. */
export function sectionLines(range: MsRange, lineMs: number): MsRange[] {
  const out: MsRange[] = [];
  if (!(lineMs > 0) || range.endMs <= range.startMs) return out;
  for (let s = range.startMs; s < range.endMs - 1; s += lineMs) {
    out.push({
      startMs: Math.round(s),
      endMs: Math.round(Math.min(range.endMs, s + lineMs)),
    });
    if (out.length >= 64) break;
  }
  return out;
}

/** Punch-in: recording starts one bar before the line, stops one beat after. */
export function punchLineWindow(params: {
  line: MsRange;
  barMs: number;
  beatMs: number;
}): { recordFromMs: number; prerollMs: number; stopAtMs: number } {
  const recordFromMs = Math.max(0, params.line.startMs - params.barMs);
  return {
    recordFromMs,
    prerollMs: params.line.startMs - recordFromMs,
    stopAtMs: params.line.endMs + Math.max(0, params.beatMs),
  };
}

/** Countdown number for pre-roll overlay (beats left), or null outside. */
export function prerollCountdown(params: {
  playheadMs: number;
  targetMs: number;
  beatMs: number;
  prerollMs: number;
}): number | null {
  const left = params.targetMs - params.playheadMs;
  if (left <= 0 || left > params.prerollMs + 1 || !(params.beatMs > 0)) {
    return null;
  }
  return Math.max(1, Math.ceil(left / params.beatMs - 1e-6));
}

// ── Alignment ───────────────────────────────────────────────────────────────

export type PlayheadSample = { perfMs: number; playheadMs: number };

/**
 * Recording-relative ms at which timeline position `targetMs` was *played*
 * (before latency), estimated from (performance.now, playhead) pairs.
 * Only samples where the transport was actually running are used.
 */
export function recordingPositionOf(params: {
  samples: readonly PlayheadSample[];
  targetMs: number;
  recordStartPerfMs: number;
}): number | null {
  const est: number[] = [];
  let prev: PlayheadSample | null = null;
  for (const s of params.samples) {
    if (prev && s.playheadMs > prev.playheadMs && s.playheadMs - prev.playheadMs < 1000) {
      est.push(s.perfMs - params.recordStartPerfMs - (s.playheadMs - params.targetMs));
    }
    prev = s;
  }
  if (est.length === 0) return null;
  est.sort((a, b) => a - b);
  return est[Math.floor(est.length / 2)]!;
}

/**
 * Loop passes: split samples at wraps (playhead jumps back), estimate where
 * the section start S sits in the recording for every pass.
 */
export function loopPassStarts(params: {
  samples: readonly PlayheadSample[];
  section: MsRange;
  recordStartPerfMs: number;
}): number[] {
  const len = params.section.endMs - params.section.startMs;
  if (!(len > 0)) return [];
  const groups: PlayheadSample[][] = [[]];
  let prev: PlayheadSample | null = null;
  for (const s of params.samples) {
    if (prev && s.playheadMs < prev.playheadMs - len / 2) groups.push([]);
    groups[groups.length - 1]!.push(s);
    prev = s;
  }
  const out: number[] = [];
  for (const g of groups) {
    const p = recordingPositionOf({
      samples: g,
      targetMs: params.section.startMs,
      recordStartPerfMs: params.recordStartPerfMs,
    });
    if (p != null) out.push(p);
  }
  return out;
}

export type CapturedPass = {
  /** Source offset in the take that matches the range start (compensated). */
  sourceOffsetMs: number;
  /** Timeline range covered by this pass (may be shorter when cut off). */
  rangeStartMs: number;
  rangeEndMs: number;
  complete: boolean;
};

/**
 * Turn pass start estimates into usable passes. A pass that was cut off
 * keeps the part that was recorded if it covers at least `minCoverMs`.
 */
export function buildCapturedPasses(params: {
  passStartsRecMs: readonly number[];
  section: MsRange;
  takeDurationMs: number;
  compensationMs: number;
  minCoverMs?: number;
}): CapturedPass[] {
  const len = params.section.endMs - params.section.startMs;
  const minCover = params.minCoverMs ?? Math.min(len, 1000);
  const out: CapturedPass[] = [];
  for (const start of params.passStartsRecMs) {
    const offset = Math.round(start + params.compensationMs);
    // Timeline range [S + a, S + b) available in source [0, takeDuration).
    const a = Math.max(0, -offset);
    const b = Math.min(len, params.takeDurationMs - offset);
    if (b - a < minCover) continue;
    out.push({
      sourceOffsetMs: offset + a,
      rangeStartMs: params.section.startMs + a,
      rangeEndMs: params.section.startMs + b,
      complete: a <= 1 && b >= len - 30,
    });
  }
  return out;
}

/**
 * Single take / punch: where to put the take on the timeline so position
 * `startMs` lines up. Negative offsets shift the clip start instead.
 */
export function alignedPlacement(params: {
  startMs: number;
  recPositionMs: number | null;
  compensationMs: number;
}): { timelineStartMs: number; sourceOffsetMs: number } {
  const raw = Math.round((params.recPositionMs ?? 0) + params.compensationMs);
  if (raw >= 0) return { timelineStartMs: params.startMs, sourceOffsetMs: raw };
  return {
    timelineStartMs: Math.max(0, params.startMs - raw),
    sourceOffsetMs: 0,
  };
}
