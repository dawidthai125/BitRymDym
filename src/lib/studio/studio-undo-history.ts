/**
 * Stage 0 — Studio undo/redo history (pure, no React / fetch).
 *
 * Entries are recorded after a CAS ack (server-confirmed values only). Undo and
 * redo replay a declarative op through the normal persist path; the history
 * itself only touches local state.
 */
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioStructuralUndoOp } from "@/lib/studio/studio-undo-structural";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";

export const STUDIO_UNDO_HISTORY_LIMIT = 100;

/** Loudness, tone, style and target — local to the mastering step, not the mix document. */
export type MasterSessionSnap = {
  settings: { loudness: number; bright: number; bass: number; width: number; squash: number };
  target: string;
  style: string | null;
  styleIntensity: number;
};

export type StudioUndoOp =
  | { kind: "track"; trackId: string; patch: Record<string, unknown> }
  | { kind: "master"; patch: { masterGainDb?: number; masterPan?: number } }
  | {
      kind: "clip_geometry";
      clipId: string;
      timelineStartMs: number;
      durationMs: number;
      sourceOffsetMs: number;
    }
  | { kind: "clip_fades"; clipId: string; fadeInMs: number; fadeOutMs: number }
  | { kind: "clip_gain"; clipId: string; gainDb: number }
  | { kind: "clip_mute"; clipId: string; muted: boolean }
  | { kind: "track_fx"; trackId: string; chain: StudioFxChainV1 }
  | { kind: "master_fx"; chain: StudioFxChainV1 }
  /** Stage 2 — BITEK auto-fix batch, replayed atomically via mix-working/apply. */
  | { kind: "mix_ops"; ops: MixWorkingOp[] }
  /** Mastering session (loudness, tone, style, target). Local to the master step, not the mix document. */
  | { kind: "master_session"; snap: MasterSessionSnap }
  | StudioStructuralUndoOp;

export type StudioUndoEntry = { undo: StudioUndoOp; redo: StudioUndoOp };

export type StudioUndoHistory = {
  past: StudioUndoEntry[];
  future: StudioUndoEntry[];
};

export const EMPTY_STUDIO_UNDO_HISTORY: StudioUndoHistory = {
  past: [],
  future: [],
};

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when undo and redo would write identical values (nothing to undo). */
export function isNoopStudioUndoEntry(entry: StudioUndoEntry): boolean {
  return sameValue(entry.undo, entry.redo);
}

export function pushStudioUndoEntry(
  history: StudioUndoHistory,
  entry: StudioUndoEntry,
  limit: number = STUDIO_UNDO_HISTORY_LIMIT,
): StudioUndoHistory {
  if (isNoopStudioUndoEntry(entry)) return history;
  const past = [...history.past, entry];
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

export function takeStudioUndo(
  history: StudioUndoHistory,
): { history: StudioUndoHistory; op: StudioUndoOp } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    op: entry.undo,
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future],
    },
  };
}

export function takeStudioRedo(
  history: StudioUndoHistory,
): { history: StudioUndoHistory; op: StudioUndoOp } | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    op: entry.redo,
    history: {
      past: [...history.past, entry],
      future: history.future.slice(1),
    },
  };
}

/** Pick the "before" values for the keys a track patch is about to change. */
export function pickStudioPatchBefore(
  source: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === "expectedDocumentVersion") continue;
    out[key] = source[key];
  }
  return out;
}

/** Ctrl/Cmd+Z → undo; Ctrl/Cmd+Shift+Z or Ctrl+Y → redo. */
export function studioUndoShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}
