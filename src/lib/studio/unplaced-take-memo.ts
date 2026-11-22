/**
 * 2026-11-22 (Owner): a READY take that was never kept ("Zachowaj") used to vanish from the
 * project after a reload — it only stayed in the archive. The recording panel remembers it per
 * project in localStorage (ids and positions only, no audio, no tokens) and offers to place it.
 */

export type UnplacedTakeMemo = {
  takeId: string;
  trackId: string;
  startMs: number;
  durationSeconds: number | null;
  savedAt: number;
};

/** Takes live for days; after this the offer is stale (the take may be gone). */
export const UNPLACED_TAKE_MEMO_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const PREFIX = "brd.unplacedTake.v1.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
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

export function writeUnplacedTakeMemo(projectId: string, memo: Omit<UnplacedTakeMemo, "savedAt">, s: StorageLike | null = store()): void {
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
