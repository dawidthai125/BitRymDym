import { describe, expect, it } from "vitest";

import {
  addStudioMarker,
  mapStudioMarkersField,
  parseStudioMarkerKind,
  parseStudioMarkerPositionMs,
  parseStudioMarkersArray,
  removeStudioMarker,
  STUDIO_MARKERS_MAX,
  STUDIO_MARKER_POSITION_MS_MAX,
} from "@/lib/studio/studio-markers-state";

const VERSE_ID = "11111111-1111-4111-8111-111111111111";
const HOOK_ID = "22222222-2222-4222-8222-222222222222";

describe("Studio markers A3/P7 lite domain", () => {
  it("accepts verse/hook and integer ms", () => {
    expect(parseStudioMarkerKind("verse")).toBe("verse");
    expect(parseStudioMarkerKind("hook")).toBe("hook");
    expect(parseStudioMarkerPositionMs(0)).toBe(0);
    expect(parseStudioMarkerPositionMs(12_345)).toBe(12_345);
  });

  it("rejects chorus and non-integer ms", () => {
    expect(() => parseStudioMarkerKind("chorus")).toThrow("MARKER_KIND_INVALID");
    expect(() => parseStudioMarkerPositionMs(1.5)).toThrow(
      "MARKER_POSITION_INVALID",
    );
    expect(() => parseStudioMarkerPositionMs(-1)).toThrow(
      "MARKER_POSITION_INVALID",
    );
    expect(() =>
      parseStudioMarkerPositionMs(STUDIO_MARKER_POSITION_MS_MAX + 1),
    ).toThrow("MARKER_POSITION_INVALID");
  });

  it("adds and removes without mutating the source array", () => {
    const empty: ReturnType<typeof parseStudioMarkersArray> = [];
    const withVerse = addStudioMarker(empty, {
      kind: "verse",
      positionMs: 1000,
      id: VERSE_ID,
    });
    const withBoth = addStudioMarker(withVerse, {
      kind: "hook",
      positionMs: 4000,
      id: HOOK_ID,
    });
    expect(empty).toEqual([]);
    expect(withVerse).toHaveLength(1);
    expect(withBoth).toHaveLength(2);
    expect(removeStudioMarker(withBoth, HOOK_ID)).toEqual(withVerse);
    expect(() => removeStudioMarker(withBoth, VERSE_ID.slice(0, 8))).toThrow(
      "MARKER_ID_INVALID",
    );
    expect(() =>
      removeStudioMarker(withVerse, HOOK_ID),
    ).toThrow("MARKER_NOT_FOUND");
  });

  it("enforces capacity and skips corrupt rows on read", () => {
    const filled = Array.from({ length: STUDIO_MARKERS_MAX }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: "verse" as const,
      positionMs: index,
    }));
    expect(() =>
      addStudioMarker(filled, { kind: "hook", positionMs: 1 }),
    ).toThrow("MARKERS_CAPACITY");
    expect(
      mapStudioMarkersField([
        { id: VERSE_ID, kind: "verse", positionMs: 10 },
        { id: "nope", kind: "hook", positionMs: 20 },
        { id: HOOK_ID, kind: "chorus", positionMs: 30 },
      ]),
    ).toEqual([{ id: VERSE_ID, kind: "verse", positionMs: 10 }]);
    expect(() => parseStudioMarkersArray({ kind: "verse" })).toThrow(
      "MARKERS_INVALID",
    );
  });
});
