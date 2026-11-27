/**
 * Musical grid (bars / beats) for the Studio timeline: ruler, grid lines and snap.
 * View only — clip geometry stays integer ms.
 */

import { exactBeatDurationMs } from "@/lib/studio/studio-daw-clock";

export type StudioGrid = {
  beatMs: number;
  beatsPerBar: number;
  /** Timeline position of bar 1, beat 1. */
  originMs: number;
};

export function buildStudioGrid(input: {
  bpm: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  originMs: number;
}): StudioGrid | null {
  const beatMs = exactBeatDurationMs(input.bpm, input.timeSignatureDen);
  if (!Number.isFinite(beatMs) || beatMs < 1) return null;
  return {
    beatMs,
    beatsPerBar: input.timeSignatureNum > 0 ? input.timeSignatureNum : 4,
    originMs: Number.isFinite(input.originMs) ? Math.round(input.originMs) : 0,
  };
}

/**
 * Where bar 1 sits: the start of the beat file on the timeline (it follows the Bit clip when moved
 * or trimmed) plus the user's own correction for beats with a pickup or silence at the start.
 */
export function studioGridOriginMs(
  beatClips: ReadonlyArray<{ timelineStartMs: number; sourceOffsetMs: number }>,
  shiftMs: number,
): number {
  let first: { timelineStartMs: number; sourceOffsetMs: number } | null = null;
  for (const clip of beatClips) {
    if (!first || clip.timelineStartMs < first.timelineStartMs) first = clip;
  }
  const fileStart = first ? first.timelineStartMs - first.sourceOffsetMs : 0;
  return Math.round(fileStart + (Number.isFinite(shiftMs) ? shiftMs : 0));
}

export type StudioBarTick = { ms: number; label: string | null };

const BAR_STEPS = [1, 2, 4, 8, 16, 32, 64, 128] as const;

/** Ruler ticks in bars. Labels: "5" (bar) or, zoomed in, "5.3" (bar.beat). Nothing before bar 1. */
export function buildStudioBarRulerTicks(input: {
  grid: StudioGrid;
  timelineLengthMs: number;
  pxPerMs: number;
  minLabelPx?: number;
}): StudioBarTick[] {
  const { grid, timelineLengthMs, pxPerMs } = input;
  const minLabelPx = input.minLabelPx ?? 40;
  const barPx = grid.beatMs * grid.beatsPerBar * pxPerMs;
  if (!(barPx > 0)) return [];
  const labelEvery = BAR_STEPS.find((n) => n * barPx >= minLabelPx) ?? BAR_STEPS[BAR_STEPS.length - 1]!;
  const beatPx = grid.beatMs * pxPerMs;
  // Step in beats: every beat when there is room, else whole bars (skipping when very crowded).
  const stepBeats =
    beatPx >= 16 ? 1 : (barPx >= 10 ? 1 : labelEvery) * grid.beatsPerBar;
  const ticks: StudioBarTick[] = [];
  const firstIndex = Math.max(0, Math.ceil(-grid.originMs / grid.beatMs / stepBeats - 1e-9) * stepBeats);
  for (let i = firstIndex; ; i += stepBeats) {
    const ms = grid.originMs + i * grid.beatMs;
    if (ms > timelineLengthMs) break;
    const bar = Math.floor(i / grid.beatsPerBar) + 1;
    const beat = (i % grid.beatsPerBar) + 1;
    let label: string | null = null;
    if (beat === 1) label = (bar - 1) % labelEvery === 0 ? String(bar) : null;
    else if (beatPx >= minLabelPx) label = `${bar}.${beat}`;
    ticks.push({ ms: Math.max(0, Math.round(ms)), label });
  }
  return ticks;
}

/* ---------- Per-project view preferences (this device only) ---------- */

export type StudioViewPrefs = {
  ruler: "bars" | "time";
  lanes: "tall" | "low";
  /** The user's correction of bar 1 against the start of the beat file. */
  gridShiftMs: number;
};

export const STUDIO_VIEW_PREFS_DEFAULT: StudioViewPrefs = {
  ruler: "bars",
  lanes: "tall",
  gridShiftMs: 0,
};

const KEY_PREFIX = "brd-studio-view:";
const listeners = new Set<() => void>();
const cache = new Map<string, StudioViewPrefs>();

export function parseStudioViewPrefs(raw: string | null): StudioViewPrefs {
  if (!raw) return STUDIO_VIEW_PREFS_DEFAULT;
  try {
    const value = JSON.parse(raw) as Partial<StudioViewPrefs> | null;
    return {
      ruler: value?.ruler === "time" ? "time" : "bars",
      lanes: value?.lanes === "low" ? "low" : "tall",
      gridShiftMs: Number.isFinite(value?.gridShiftMs) ? Math.round(value!.gridShiftMs!) : 0,
    };
  } catch {
    return STUDIO_VIEW_PREFS_DEFAULT;
  }
}

export function readStudioViewPrefs(projectId: string): StudioViewPrefs {
  const cached = cache.get(projectId);
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY_PREFIX + projectId);
  } catch {
    // Storage blocked: defaults.
  }
  const prefs = parseStudioViewPrefs(raw);
  cache.set(projectId, prefs);
  return prefs;
}

export function writeStudioViewPrefs(projectId: string, patch: Partial<StudioViewPrefs>): void {
  const next = { ...readStudioViewPrefs(projectId), ...patch };
  cache.set(projectId, next);
  try {
    window.localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify(next));
  } catch {
    // Storage blocked: kept until reload.
  }
  for (const listener of listeners) listener();
}

export function subscribeStudioViewPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
