/**
 * 2026-11-22 (Owner): a READY take that was never kept ("Zachowaj") used to vanish from the
 * project after a reload — it only stayed in the archive. The recording panel remembers it per
 * project in localStorage (ids and positions only, no audio, no tokens) and offers to place it.
 *
 * 2026-11-23: the same file remembers where every recent take of the project was recorded, so
 * "Dodaj na ścieżkę" from the list puts it back in its place (with the latency correction).
 */

export type UnplacedTakeMemo = {
  takeId: string;
  trackId: string;
  startMs: number;
  /** Latency correction: the first N ms of the take that are skipped. */
  sourceOffsetMs: number;
  durationSeconds: number | null;
  savedAt: number;
};

export type TakePlacementMemo = {
  takeId: string;
  trackId: string;
  timelineStartMs: number;
  sourceOffsetMs: number;
  savedAt: number;
};

/** Takes live for days; after this the offer is stale (the take may be gone). */
export const UNPLACED_TAKE_MEMO_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** Longer than the longest take lifetime (84 h). */
export const TAKE_PLACEMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TAKE_PLACEMENT_LIMIT = 40;
/** The recording panel went away with an undecided take: the banner reads the memo again. */
export const UNPLACED_TAKE_EVENT = "brd:unplaced-take";

const PREFIX = "brd.unplacedTake.v1.";
const PLACEMENT_PREFIX = "brd.takePlacement.v1.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function offsetOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Pure: a stored value is usable only when it is well-formed and fresh. */
export function parseUnplacedTakeMemo(raw: string | null, now = Date.now()): UnplacedTakeMemo | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<UnplacedTakeMemo>;
    if (typeof v.takeId !== "string" || !UUID.test(v.takeId)) return null;
    if (typeof v.trackId !== "string" || v.trackId.length === 0) return null;
    if (typeof v.startMs !== "number" || !Number.isFinite(v.startMs) || v.startMs < 0) return null;
    if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt)) return null;
    if (now - v.savedAt > UNPLACED_TAKE_MEMO_TTL_MS || v.savedAt > now + 60_000) return null;
    const d = v.durationSeconds;
    return {
      takeId: v.takeId,
      trackId: v.trackId,
      startMs: Math.round(v.startMs),
      sourceOffsetMs: offsetOf(v.sourceOffsetMs),
      durationSeconds: typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null,
      savedAt: v.savedAt,
    };
  } catch {
    return null;
  }
}

export function readUnplacedTakeMemo(projectId: string, s: StorageLike | null = store()): UnplacedTakeMemo | null {
  if (!s) return null;
  const memo = parseUnplacedTakeMemo(s.getItem(PREFIX + projectId));
  if (!memo) {
    try {
      s.removeItem(PREFIX + projectId);
    } catch {
      /* best effort */
    }
  }
  return memo;
}

export function writeUnplacedTakeMemo(
  projectId: string,
  memo: Omit<UnplacedTakeMemo, "savedAt" | "sourceOffsetMs"> & { sourceOffsetMs?: number },
  s: StorageLike | null = store(),
): void {
  if (!s) return;
  try {
    s.setItem(PREFIX + projectId, JSON.stringify({ ...memo, savedAt: Date.now() }));
  } catch {
    /* quota / private mode: the archive still has the take */
  }
}

export function clearUnplacedTakeMemo(projectId: string, takeId?: string, s: StorageLike | null = store()): void {
  if (!s) return;
  try {
    if (takeId) {
      const cur = parseUnplacedTakeMemo(s.getItem(PREFIX + projectId));
      if (cur && cur.takeId !== takeId) return;
    }
    s.removeItem(PREFIX + projectId);
  } catch {
    /* best effort */
  }
}

/** Pure: usable placements only, newest first. */
export function parseTakePlacements(raw: string | null, now = Date.now()): TakePlacementMemo[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    const out: TakePlacementMemo[] = [];
    for (const item of list as Partial<TakePlacementMemo>[]) {
      if (!item || typeof item.takeId !== "string" || !UUID.test(item.takeId)) continue;
      if (typeof item.trackId !== "string" || item.trackId.length === 0) continue;
      if (typeof item.timelineStartMs !== "number" || !Number.isFinite(item.timelineStartMs) || item.timelineStartMs < 0) continue;
      if (typeof item.savedAt !== "number" || !Number.isFinite(item.savedAt) || now - item.savedAt > TAKE_PLACEMENT_TTL_MS) continue;
      out.push({
        takeId: item.takeId,
        trackId: item.trackId,
        timelineStartMs: Math.round(item.timelineStartMs),
        sourceOffsetMs: offsetOf(item.sourceOffsetMs),
        savedAt: item.savedAt,
      });
    }
    return out.slice(0, TAKE_PLACEMENT_LIMIT);
  } catch {
    return [];
  }
}

export function readTakePlacement(projectId: string, takeId: string, s: StorageLike | null = store()): TakePlacementMemo | null {
  if (!s) return null;
  try {
    return parseTakePlacements(s.getItem(PLACEMENT_PREFIX + projectId)).find((p) => p.takeId === takeId) ?? null;
  } catch {
    return null;
  }
}

export function rememberTakePlacement(
  projectId: string,
  placement: Omit<TakePlacementMemo, "savedAt">,
  s: StorageLike | null = store(),
): void {
  if (!s) return;
  try {
    const rest = parseTakePlacements(s.getItem(PLACEMENT_PREFIX + projectId)).filter((p) => p.takeId !== placement.takeId);
    const next = [{ ...placement, savedAt: Date.now() }, ...rest].slice(0, TAKE_PLACEMENT_LIMIT);
    s.setItem(PLACEMENT_PREFIX + projectId, JSON.stringify(next));
  } catch {
    /* quota / private mode: the list falls back to the playhead */
  }
}

const PENDING_PREFIX = "brd.pendingPlacement.v1.";

/** Where the take being recorded belongs, kept until it is on the server (crash, failed upload). */
export function writePendingPlacement(
  projectId: string,
  placement: Omit<TakePlacementMemo, "takeId" | "savedAt">,
  s: StorageLike | null = store(),
): void {
  if (!s) return;
  try {
    s.setItem(PENDING_PREFIX + projectId, JSON.stringify({ ...placement, savedAt: Date.now() }));
  } catch {
    /* best effort */
  }
}

export function clearPendingPlacement(projectId: string, s: StorageLike | null = store()): void {
  try {
    s?.removeItem(PENDING_PREFIX + projectId);
  } catch {
    /* best effort */
  }
}

/** A recovered local copy became a take: give it its place back and offer it in the banner. */
export function adoptRecoveredTake(projectId: string, takeId: string, s: StorageLike | null = store()): boolean {
  if (!s) return false;
  try {
    const raw = s.getItem(PENDING_PREFIX + projectId);
    if (!raw) return false;
    const [memo] = parseTakePlacements(JSON.stringify([{ ...(JSON.parse(raw) as object), takeId }]));
    clearPendingPlacement(projectId, s);
    if (!memo) return false;
    const { trackId, timelineStartMs, sourceOffsetMs } = memo;
    rememberTakePlacement(projectId, { takeId, trackId, timelineStartMs, sourceOffsetMs }, s);
    writeUnplacedTakeMemo(projectId, { takeId, trackId, startMs: timelineStartMs, sourceOffsetMs, durationSeconds: null }, s);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(UNPLACED_TAKE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Clip length cap so a take that runs past the end of the timeline can still be placed. */
export function clipDurationCapMs(input: {
  timelineStartMs: number;
  sourceOffsetMs: number;
  takeDurationSeconds: number | null;
  timelineLengthMs: number;
}): number | undefined {
  if (input.takeDurationSeconds == null) return undefined;
  const room = Math.floor(input.timelineLengthMs - input.timelineStartMs);
  const takeMs = Math.round(input.takeDurationSeconds * 1000) - input.sourceOffsetMs;
  return room >= 1 && takeMs > room ? room : undefined;
}
