import { describe, expect, it } from "vitest";

import type { BitekStoredMessage } from "@/lib/studio/bitek/store/messages";

import { bitekDecisionsByEntry, isBitekDecisionNote, lastBitekChange, toContextLastChange } from "./decisions";

const note = (entryId: string, decision: string, changes: unknown[] = [{ i: 0, target: "trk-2", param: "gainDb", from: 0, to: 2 }]): BitekStoredMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  kind: "note",
  content: "x",
  meta: { bitekChange: { entryId, decision, changes } },
  createdAt: "",
});

describe("BITEK decisions", () => {
  it("latest decision per reply wins; plain notes are ignored", () => {
    const plain: BitekStoredMessage = { ...note("a", "applied"), meta: {} };
    const msgs = [note("a", "applied"), plain, note("a", "kept"), note("b", "applied")];
    const map = bitekDecisionsByEntry(msgs);
    expect(map.get("a")?.decision).toBe("kept");
    expect(map.get("b")?.decision).toBe("applied");
    expect(isBitekDecisionNote(plain)).toBe(false);
  });
  it("last change is null after an undo", () => {
    expect(lastBitekChange([note("a", "applied")])?.entryId).toBe("a");
    expect(lastBitekChange([note("a", "applied"), note("a", "undone")])).toBeNull();
  });
  it("drops malformed changes and maps track ids to current refs", () => {
    const meta = lastBitekChange([
      note("a", "kept", [
        { i: 0, target: "trk-2", param: "gainDb", from: 0, to: 2 },
        { i: 1, target: "gone", param: "pan", from: 0, to: 0.5 },
        { i: 2, target: "trk-1", param: "gainDb", from: "x", to: 1 },
        { i: 0, target: "master", param: "bass", from: 0, to: 1 },
      ]),
    ]);
    expect(meta?.changes).toHaveLength(3);
    expect(toContextLastChange(meta, { t1: "trk-1", t2: "trk-2" })).toEqual([
      { trackRef: "t2", param: "gainDb", from: 0, to: 2 },
      { trackRef: "master", param: "bass", from: 0, to: 1 },
    ]);
    expect(toContextLastChange(null, {})).toBeNull();
  });
});
