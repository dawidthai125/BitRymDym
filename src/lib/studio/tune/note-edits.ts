/**
 * BRD Tune note editor — pure draft ↔ stored-note helpers (testable, no DOM).
 */
import type { StudioTuneNoteEdit } from "@/lib/studio/studio-fx-chain";

import type { DetectedNote } from "./note-detect";

export type NoteEditDraft = { targetMidi: number; amount: number; retuneMs: number; touched?: boolean };

/** Stored edit that overlaps the detected note most (≥ 50 % of the note), or null. */
export function storedEditFor(note: DetectedNote, stored: readonly StudioTuneNoteEdit[] | undefined): StudioTuneNoteEdit | null {
  let best: StudioTuneNoteEdit | null = null;
  let bestOverlap = 0;
  for (const s of stored ?? []) {
    const overlap = Math.min(s.endMs, note.endMs) - Math.max(s.startMs, note.startMs);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = s;
    }
  }
  return best && bestOverlap >= 0.5 * (note.endMs - note.startMs) ? best : null;
}

/** Initial draft: the saved edit, else the sung pitch (= no change). */
export function noteEditFor(note: DetectedNote, stored: readonly StudioTuneNoteEdit[] | undefined): NoteEditDraft {
  const s = storedEditFor(note, stored);
  if (s) return { targetMidi: s.targetMidi, amount: s.amount, retuneMs: s.retuneMs, touched: true };
  return { targetMidi: note.midi, amount: 1, retuneMs: 0, touched: false };
}

/** Drafts → notes to store: only changed ones, sorted, non-overlapping, ≤ 512. */
export function mergeNoteEdits(
  detected: readonly DetectedNote[],
  drafts: ReadonlyMap<number, NoteEditDraft>,
): StudioTuneNoteEdit[] {
  const out: StudioTuneNoteEdit[] = [];
  detected.forEach((n, i) => {
    const d = drafts.get(i);
    if (!d) return;
    const moved = Math.abs(d.targetMidi - n.midi) >= 0.01;
    if (!moved && !d.touched) return;
    out.push({
      startMs: Math.round(n.startMs),
      endMs: Math.round(n.endMs),
      targetMidi: Math.round(Math.max(24, Math.min(108, d.targetMidi)) * 100) / 100,
      amount: Math.max(0, Math.min(1, d.amount)),
      retuneMs: Math.max(0, Math.min(400, d.retuneMs)),
    });
  });
  out.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < out.length; i += 1) {
    if (out[i]!.startMs < out[i - 1]!.endMs) out[i]!.startMs = out[i - 1]!.endMs;
  }
  return out.filter((n) => n.endMs - n.startMs >= 10).slice(0, 512);
}

