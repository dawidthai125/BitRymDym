/**
 * Studio recording P0 — take lanes + simple comping (pure).
 *
 * A lane = one section on one track with N passes (loop passes / punch-ins).
 * The comp picks one pass per line; adjacent lines from the same pass merge
 * into one clip; neighbouring clips overlap by a short crossfade.
 */

import { STUDIO_TAKE_LANE_LIMITS } from "@/config/studio-recording-features";
import { sectionLines, type MsRange } from "@/lib/studio/recording/section-loop";

export type LanePassKind = "loop" | "punch" | "single";

export type LanePass = {
  id: string;
  takeId: string;
  /** 1-based number shown to the user ("Take 3"). */
  number: number;
  kind: LanePassKind;
  rangeStartMs: number;
  rangeEndMs: number;
  /** Source offset in the take that matches rangeStartMs (latency-compensated). */
  sourceOffsetMs: number;
  takeDurationMs: number;
  starred: boolean;
  complete: boolean;
  createdAt: string;
};

export type TakeLane = {
  id: string;
  trackId: string;
  sectionStartMs: number;
  sectionEndMs: number;
  lineMs: number;
  passes: LanePass[];
  /** Pass id per line (index = line index); null = silence. */
  comp: Array<string | null>;
  /** Timeline clips currently created by this lane's comp. */
  clipIds: string[];
  updatedAt: string;
};

export type CompClipSpec = {
  passId: string;
  takeId: string;
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};

export function laneLines(lane: Pick<TakeLane, "sectionStartMs" | "sectionEndMs" | "lineMs">): MsRange[] {
  return sectionLines(
    { startMs: lane.sectionStartMs, endMs: lane.sectionEndMs },
    lane.lineMs,
  );
}

/** Pass has audio for the whole timeline range. */
export function passCovers(pass: LanePass, range: MsRange): boolean {
  if (range.startMs < pass.rangeStartMs - 1 || range.endMs > pass.rangeEndMs + 1) {
    return false;
  }
  const srcStart = pass.sourceOffsetMs + (range.startMs - pass.rangeStartMs);
  const srcEnd = srcStart + (range.endMs - range.startMs);
  return srcStart >= -1 && srcEnd <= pass.takeDurationMs + 1;
}

export function normalizeLaneComp(lane: TakeLane): Array<string | null> {
  const lines = laneLines(lane);
  const byId = new Map(lane.passes.map((p) => [p.id, p]));
  return lines.map((line, i) => {
    const id = lane.comp[i] ?? null;
    const p = id ? byId.get(id) : undefined;
    return p && passCovers(p, line) ? p.id : null;
  });
}

/** Default: starred pass covering the line (newest), else newest covering pass. */
export function defaultComp(lane: TakeLane): Array<string | null> {
  const lines = laneLines(lane);
  const newestFirst = [...lane.passes].sort((a, b) => b.number - a.number);
  return lines.map((line) => {
    const starred = newestFirst.find((p) => p.starred && passCovers(p, line));
    if (starred) return starred.id;
    return newestFirst.find((p) => passCovers(p, line))?.id ?? null;
  });
}

export function setLineChoice(
  lane: TakeLane,
  lineIndex: number,
  passId: string | null,
): TakeLane {
  const comp = normalizeLaneComp(lane);
  if (lineIndex < 0 || lineIndex >= comp.length) return lane;
  const lines = laneLines(lane);
  const pass = passId ? lane.passes.find((p) => p.id === passId) : null;
  if (passId && (!pass || !passCovers(pass, lines[lineIndex]!))) return lane;
  comp[lineIndex] = passId;
  return { ...lane, comp };
}

/** Use one pass everywhere it has audio (others keep their choice). */
export function setSectionChoice(lane: TakeLane, passId: string): TakeLane {
  const pass = lane.passes.find((p) => p.id === passId);
  if (!pass) return lane;
  const lines = laneLines(lane);
  const comp = normalizeLaneComp(lane).map((cur, i) =>
    passCovers(pass, lines[i]!) ? pass.id : cur,
  );
  return { ...lane, comp };
}

export function toggleStar(lane: TakeLane, passId: string): TakeLane {
  return {
    ...lane,
    passes: lane.passes.map((p) =>
      p.id === passId ? { ...p, starred: !p.starred } : p,
    ),
  };
}

/** Append new passes (newest wins on the lines it covers). Oldest unstarred drop past the limit. */
export function addPassesToLane(
  lane: TakeLane,
  incoming: ReadonlyArray<Omit<LanePass, "number">>,
): TakeLane {
  let next = lane.passes.length ? Math.max(...lane.passes.map((p) => p.number)) : 0;
  const added: LanePass[] = incoming.map((p) => ({ ...p, number: (next += 1) }));
  let passes = [...lane.passes, ...added];
  const max = STUDIO_TAKE_LANE_LIMITS.maxPassesPerLane;
  while (passes.length > max) {
    const victim = passes.find((p) => !p.starred) ?? passes[0]!;
    passes = passes.filter((p) => p !== victim);
  }
  let out: TakeLane = { ...lane, passes, comp: normalizeLaneComp({ ...lane, passes }) };
  const usable = added.filter((p) => passes.includes(p));
  const winner = [...usable].reverse().find((p) => p.complete) ?? usable[usable.length - 1];
  if (winner) out = setSectionChoice(out, winner.id);
  // Lines no pass was chosen for yet get the default.
  const def = defaultComp(out);
  return { ...out, comp: out.comp.map((c, i) => c ?? def[i] ?? null) };
}

export type CompSegment = { passId: string; startMs: number; endMs: number };

export function compSegments(lane: TakeLane): CompSegment[] {
  const lines = laneLines(lane);
  const comp = normalizeLaneComp(lane);
  const out: CompSegment[] = [];
  comp.forEach((id, i) => {
    if (!id) return;
    const line = lines[i]!;
    const last = out[out.length - 1];
    if (last && last.passId === id && last.endMs === line.startMs) {
      last.endMs = line.endMs;
    } else {
      out.push({ passId: id, startMs: line.startMs, endMs: line.endMs });
    }
  });
  return out;
}

/**
 * Clip specs for the comp. Adjacent segments overlap by `crossfadeMs`
 * (half before, half after the boundary) where both passes have audio;
 * the earlier clip fades out and the later fades in across the overlap.
 */
export function buildCompClipSpecs(
  lane: TakeLane,
  opts: { crossfadeMs?: number; edgeFadeMs?: number } = {},
): CompClipSpec[] {
  const xf = Math.max(0, opts.crossfadeMs ?? STUDIO_TAKE_LANE_LIMITS.crossfadeMs);
  const edge = Math.max(0, opts.edgeFadeMs ?? STUDIO_TAKE_LANE_LIMITS.edgeFadeMs);
  const segs = compSegments(lane);
  const byId = new Map(lane.passes.map((p) => [p.id, p]));
  const specs: Array<CompClipSpec & { joinedBefore: boolean; joinedAfter: boolean }> = [];
  segs.forEach((seg, i) => {
    const pass = byId.get(seg.passId)!;
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const joinedBefore = Boolean(prev && prev.endMs === seg.startMs);
    const joinedAfter = Boolean(next && next.startMs === seg.endMs);
    let start = seg.startMs - (joinedBefore ? xf / 2 : 0);
    let end = seg.endMs + (joinedAfter ? xf / 2 : 0);
    // Stay inside the pass's recorded audio.
    const srcAt = (t: number) => pass.sourceOffsetMs + (t - pass.rangeStartMs);
    if (srcAt(start) < 0) start -= srcAt(start);
    const overEnd = srcAt(end) - pass.takeDurationMs;
    if (overEnd > 0) end -= overEnd;
    start = Math.round(start);
    end = Math.round(end);
    if (end - start < 1) return;
    specs.push({
      passId: pass.id,
      takeId: pass.takeId,
      timelineStartMs: start,
      durationMs: end - start,
      sourceOffsetMs: Math.max(0, Math.round(srcAt(start))),
      fadeInMs: 0,
      fadeOutMs: 0,
      joinedBefore,
      joinedAfter,
    });
  });
  // Fades from actual overlaps.
  return specs.map((s, i) => {
    const prev = specs[i - 1];
    const next = specs[i + 1];
    const half = Math.floor(s.durationMs / 2);
    const overlapPrev =
      s.joinedBefore && prev
        ? Math.max(0, prev.timelineStartMs + prev.durationMs - s.timelineStartMs)
        : 0;
    const overlapNext =
      s.joinedAfter && next
        ? Math.max(0, s.timelineStartMs + s.durationMs - next.timelineStartMs)
        : 0;
    const { joinedBefore, joinedAfter, ...spec } = s;
    return {
      ...spec,
      fadeInMs: Math.min(half, joinedBefore ? overlapPrev || edge : edge),
      fadeOutMs: Math.min(half, joinedAfter ? overlapNext || edge : edge),
    };
  });
}

// ── Validation (server + local storage) ─────────────────────────────────────

const UUIDISH = /^[0-9a-zA-Z_-]{1,64}$/;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseLanePass(raw: unknown): LanePass | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rs = num(r.rangeStartMs);
  const re = num(r.rangeEndMs);
  const so = num(r.sourceOffsetMs);
  const td = num(r.takeDurationMs);
  const n = num(r.number);
  if (
    typeof r.id !== "string" || !UUIDISH.test(r.id) ||
    typeof r.takeId !== "string" || !UUIDISH.test(r.takeId) ||
    rs == null || re == null || so == null || td == null || n == null ||
    rs < 0 || re <= rs || so < 0 || td <= 0
  ) {
    return null;
  }
  const kind: LanePassKind =
    r.kind === "punch" || r.kind === "single" ? r.kind : "loop";
  return {
    id: r.id,
    takeId: r.takeId,
    number: Math.max(1, Math.round(n)),
    kind,
    rangeStartMs: Math.round(rs),
    rangeEndMs: Math.round(re),
    sourceOffsetMs: Math.round(so),
    takeDurationMs: Math.round(td),
    starred: r.starred === true,
    complete: r.complete !== false,
    createdAt: typeof r.createdAt === "string" ? r.createdAt.slice(0, 40) : "",
  };
}

export function parseTakeLane(raw: unknown): TakeLane | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = num(r.sectionStartMs);
  const e = num(r.sectionEndMs);
  const l = num(r.lineMs);
  if (
    typeof r.id !== "string" || !UUIDISH.test(r.id) ||
    typeof r.trackId !== "string" || !UUIDISH.test(r.trackId) ||
    s == null || e == null || l == null || s < 0 || e <= s || l < 100 ||
    !Array.isArray(r.passes) ||
    r.passes.length > STUDIO_TAKE_LANE_LIMITS.maxPassesPerLane ||
    (e - s) / l > 64
  ) {
    return null;
  }
  const passes: LanePass[] = [];
  for (const p of r.passes) {
    const parsed = parseLanePass(p);
    if (!parsed) return null;
    passes.push(parsed);
  }
  const comp = Array.isArray(r.comp)
    ? r.comp.slice(0, 64).map((c) => (typeof c === "string" ? c : null))
    : [];
  const clipIds = Array.isArray(r.clipIds)
    ? r.clipIds
        .filter((c): c is string => typeof c === "string" && UUIDISH.test(c))
        .slice(0, 128)
    : [];
  const lane: TakeLane = {
    id: r.id,
    trackId: r.trackId,
    sectionStartMs: Math.round(s),
    sectionEndMs: Math.round(e),
    lineMs: Math.round(l),
    passes,
    comp,
    clipIds,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt.slice(0, 40) : "",
  };
  return { ...lane, comp: normalizeLaneComp(lane) };
}

/** Lane whose section fully contains the range on that track. */
export function findLaneForRange(
  lanes: readonly TakeLane[],
  trackId: string,
  range: MsRange,
): TakeLane | null {
  return (
    lanes.find(
      (l) =>
        l.trackId === trackId &&
        l.sectionStartMs <= range.startMs &&
        l.sectionEndMs >= range.endMs,
    ) ?? null
  );
}

/** Lanes on the same track whose sections overlap (one lane per region). */
export function overlappingLanes(
  lanes: readonly TakeLane[],
  trackId: string,
  range: MsRange,
): TakeLane[] {
  return lanes.filter(
    (l) =>
      l.trackId === trackId &&
      l.sectionStartMs < range.endMs &&
      l.sectionEndMs > range.startMs,
  );
}
