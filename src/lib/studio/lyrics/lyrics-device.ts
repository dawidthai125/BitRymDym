/**
 * Device copy of the project lyrics. `dirty` marks text that the server has not confirmed yet,
 * with the server version it was typed on, so a quick tab change cannot lose the last words.
 */
import { readLyricsDoc, type LyricsDoc } from "@/lib/studio/lyrics/lyrics";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const docKey = (projectId: string) => `brd:lyrics:${projectId}`;
const dirtyKey = (projectId: string) => `brd:lyrics-dirty:${projectId}`;

function browserStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLyricsCopy(projectId: string, s: StorageLike | null = browserStore()): LyricsDoc | null {
  try {
    const raw = s?.getItem(docKey(projectId));
    return raw ? readLyricsDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** `dirtyOn` = server version the unsaved text is based on; null = the server has this text. */
export function writeLyricsCopy(
  projectId: string,
  doc: LyricsDoc,
  dirtyOn: number | null,
  s: StorageLike | null = browserStore(),
): void {
  try {
    s?.setItem(docKey(projectId), JSON.stringify(doc));
    if (dirtyOn === null) s?.removeItem(dirtyKey(projectId));
    else s?.setItem(dirtyKey(projectId), String(dirtyOn));
  } catch {
    /* storage full / private mode — server copy is the source of truth */
  }
}

export function clearLyricsDirty(projectId: string, s: StorageLike | null = browserStore()): void {
  try {
    s?.removeItem(dirtyKey(projectId));
  } catch {
    /* best effort */
  }
}

/** Unsaved text wins over the server copy only when the server did not move on meanwhile. */
export function unsavedLyricsCopy(
  projectId: string,
  serverVersion: number,
  s: StorageLike | null = browserStore(),
): LyricsDoc | null {
  let dirty: string | null = null;
  try {
    dirty = s?.getItem(dirtyKey(projectId)) ?? null;
  } catch {
    return null;
  }
  const local = readLyricsCopy(projectId, s);
  if (!local) return null;
  if (dirty !== null) return Number(dirty) === serverVersion ? local : null;
  // Older copies have no marker: an empty server still takes what was typed offline.
  return serverVersion === 0 && local.sections.length ? local : null;
}
