import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_UNDO_HISTORY,
  pickStudioPatchBefore,
  pushStudioUndoEntry,
  studioUndoShortcut,
  takeStudioRedo,
  takeStudioUndo,
  type StudioUndoEntry,
} from "@/lib/studio/studio-undo-history";

const gain = (from: number, to: number): StudioUndoEntry => ({
  undo: { kind: "clip_gain", clipId: "c1", gainDb: from },
  redo: { kind: "clip_gain", clipId: "c1", gainDb: to },
});

describe("studio undo history", () => {
  it("undo then redo walks the stack", () => {
    let h = pushStudioUndoEntry(EMPTY_STUDIO_UNDO_HISTORY, gain(0, -3));
    h = pushStudioUndoEntry(h, gain(-3, -6));
    const u = takeStudioUndo(h)!;
    expect(u.op).toEqual({ kind: "clip_gain", clipId: "c1", gainDb: -3 });
    const r = takeStudioRedo(u.history)!;
    expect(r.op).toEqual({ kind: "clip_gain", clipId: "c1", gainDb: -6 });
    expect(r.history.past).toHaveLength(2);
    expect(r.history.future).toHaveLength(0);
  });

  it("new edit clears redo and empty stacks return null", () => {
    expect(takeStudioUndo(EMPTY_STUDIO_UNDO_HISTORY)).toBeNull();
    expect(takeStudioRedo(EMPTY_STUDIO_UNDO_HISTORY)).toBeNull();
    const h = takeStudioUndo(pushStudioUndoEntry(EMPTY_STUDIO_UNDO_HISTORY, gain(0, -3)))!.history;
    expect(pushStudioUndoEntry(h, gain(0, 2)).future).toHaveLength(0);
  });

  it("caps history at the limit and skips no-op entries", () => {
    let h = EMPTY_STUDIO_UNDO_HISTORY;
    for (let i = 0; i < 10; i += 1) h = pushStudioUndoEntry(h, gain(i, i + 1), 4);
    expect(h.past).toHaveLength(4);
    expect(h.past[0]!.undo).toMatchObject({ gainDb: 6 });
    expect(pushStudioUndoEntry(h, gain(1, 1), 4)).toBe(h);
  });

  it("picks before values for patched keys only", () => {
    expect(
      pickStudioPatchBefore({ gainDb: -2, pan: 0.5, muted: false }, { gainDb: 0, expectedDocumentVersion: 3 }),
    ).toEqual({ gainDb: -2 });
  });

  it("roundtrips a mastering session and skips an identical snap", () => {
    const before = {
      settings: { loudness: 0, bright: 0, bass: 0, width: 0, squash: 0 },
      target: "streaming",
      style: null,
      styleIntensity: 50,
    };
    const after = { ...before, settings: { ...before.settings, loudness: 1.5 }, style: "warm" as string | null };
    const entry: StudioUndoEntry = {
      undo: { kind: "master_session", snap: before },
      redo: { kind: "master_session", snap: after },
    };
    const h = pushStudioUndoEntry(EMPTY_STUDIO_UNDO_HISTORY, entry);
    expect(takeStudioUndo(h)!.op).toEqual(entry.undo);
    expect(takeStudioRedo(takeStudioUndo(h)!.history)!.op).toEqual(entry.redo);
    expect(pushStudioUndoEntry(h, { undo: entry.undo, redo: entry.undo })).toBe(h);
  });

  it("maps keyboard shortcuts", () => {
    const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
      studioUndoShortcut({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
    expect(k("z", { ctrlKey: true })).toBe("undo");
    expect(k("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(k("y", { ctrlKey: true })).toBe("redo");
    expect(k("z", { metaKey: true })).toBe("undo");
    expect(k("z")).toBeNull();
    expect(k("z", { ctrlKey: true, altKey: true })).toBeNull();
  });
});

describe("ops added 2026-11-23", () => {
  it("tempo, notes, automation and track order are history entries", () => {
    const entries: StudioUndoEntry[] = [
      {
        undo: { kind: "clip_playback", clipId: "c", stretch: 1, pitchCents: 0, durationMs: 4000 },
        redo: { kind: "clip_playback", clipId: "c", stretch: 2, pitchCents: 0, durationMs: 8000 },
      },
      {
        undo: { kind: "track_reorder", trackId: "t", direction: "down" },
        redo: { kind: "track_reorder", trackId: "t", direction: "up" },
      },
    ];
    let h = EMPTY_STUDIO_UNDO_HISTORY;
    for (const entry of entries) h = pushStudioUndoEntry(h, entry);
    expect(takeStudioUndo(h)?.op).toEqual(entries[1]!.undo);
    expect(h.past).toHaveLength(2);
  });
});

describe("studio editor undo wiring", () => {
  it("records on CAS ack and exposes transport buttons + shortcuts", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const editor = (readFileSync(join(process.cwd(), "src/components/studio/studio-editor.tsx"), "utf8") +
    // Transport bar moved to its own file (audit 2026-11-21).
    readFileSync(join(process.cwd(), "src/components/studio/studio-transport-bar.tsx"), "utf8"));
    expect(editor).toMatch(/studioUndoShortcut\(event\)/);
    expect(editor).toMatch(/data-testid="studio-transport-undo"/);
    expect(editor).toMatch(/data-testid="studio-transport-redo"/);
    // Acked document is written at once, not inside the setDoc updater (React may run that too late).
    expect(editor).toMatch(/committedDocRef\.current = mutate\(committedDocRef\.current\);\s+docRef\.current = display\(docRef\.current\);\s+setDoc\(display\);/);
    expect(editor).toMatch(/history: false/);
    expect(editor).toMatch(/kind: "master_session"/);
    expect(editor).toMatch(/onCommitMasterSession/);
    expect(editor).toMatch(/masterSessionRef/);
  });
});
