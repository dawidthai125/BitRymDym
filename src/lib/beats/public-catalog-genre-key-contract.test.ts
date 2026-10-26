import { describe, expect, it } from "vitest";

import { toPublicCatalogItem } from "@/lib/beats/public";
import { mapPublicBeatRow, type BeatRow } from "@/lib/beats/types";
import {
  catalogGenresFromBeats,
  catalogKeysFromBeats,
  presentBeats,
} from "@/lib/ui/demo-beats";

/** Synthetic public-shaped row (BEAT_SELECT_PUBLIC columns only). No DB. */
function makePublicBeatRow(overrides: Partial<BeatRow> = {}): BeatRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    owner_id: null,
    ownership_type: "PLATFORM",
    title: "Contract Beat",
    producer: "BRD",
    description: null,
    genre: null,
    style: null,
    bpm: 140,
    key: null,
    scale: null,
    duration_seconds: 120,
    tags: null,
    cover_ref: null,
    status: "PUBLISHED",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Production catalog path without listPublishedBeats / Supabase. */
function chipOptionsFromPublicRows(rows: BeatRow[]) {
  const presented = presentBeats(
    rows.map((row) => toPublicCatalogItem(mapPublicBeatRow(row))),
  );
  return {
    presented,
    genreOptions: catalogGenresFromBeats(presented),
    keyOptions: catalogKeysFromBeats(presented),
  };
}

describe("public catalog genre/key metadata contract", () => {
  it("passes non-empty genre and key through map → catalog → present → chip options", () => {
    const { presented, genreOptions, keyOptions } = chipOptionsFromPublicRows([
      makePublicBeatRow({
        genre: "Trap",
        key: "Am",
        style: "Dark",
        scale: "minor",
      }),
    ]);

    expect(presented).toHaveLength(1);
    expect(presented[0].genre).toBe("Trap");
    expect(presented[0].key).toBe("Am");
    expect(genreOptions).toEqual(["Trap"]);
    expect(keyOptions).toEqual(["Am"]);
    // style/scale stay on public DTO but are not PresentedBeat chip sources
    expect(presented[0]).not.toHaveProperty("style");
    expect(presented[0]).not.toHaveProperty("scale");
    expect(genreOptions).not.toContain("Dark");
    expect(keyOptions).not.toContain("minor");
  });

  it("trims whitespace genre/key at present; empty/whitespace/null become null and yield no chips", () => {
    const padded = chipOptionsFromPublicRows([
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000010",
        genre: "  Trap  ",
        key: "  Am  ",
      }),
    ]);
    expect(padded.presented[0].genre).toBe("Trap");
    expect(padded.presented[0].key).toBe("Am");
    expect(padded.genreOptions).toEqual(["Trap"]);
    expect(padded.keyOptions).toEqual(["Am"]);

    // mapPublicBeatRow / toPublicCatalogItem pass through raw values (trim is present-only)
    const rawRow = makePublicBeatRow({ genre: "  Trap  ", key: "  Am  " });
    const mapped = mapPublicBeatRow(rawRow);
    expect(mapped.genre).toBe("  Trap  ");
    expect(mapped.key).toBe("  Am  ");
    expect(toPublicCatalogItem(mapped).genre).toBe("  Trap  ");
    expect(toPublicCatalogItem(mapped).key).toBe("  Am  ");

    const emptyMeta = chipOptionsFromPublicRows([
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000011",
        genre: null,
        key: null,
      }),
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000012",
        genre: "",
        key: "",
      }),
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000013",
        genre: "   ",
        key: "\t",
      }),
    ]);

    for (const beat of emptyMeta.presented) {
      expect(beat.genre).toBeNull();
      expect(beat.key).toBeNull();
    }
    expect(emptyMeta.genreOptions).toEqual([]);
    expect(emptyMeta.keyOptions).toEqual([]);
  });

  it("deduplicates chip options via Set after present trim; mixed nulls do not invent options", () => {
    const { genreOptions, keyOptions } = chipOptionsFromPublicRows([
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000021",
        genre: "Trap",
        key: "Am",
      }),
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000022",
        genre: " Trap ",
        key: "Am",
      }),
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000023",
        genre: null,
        key: "Dm",
      }),
      makePublicBeatRow({
        id: "00000000-0000-4000-8000-000000000024",
        genre: "Hip-Hop",
        key: "   ",
      }),
    ]);

    expect(genreOptions).toEqual(
      ["Hip-Hop", "Trap"].sort((a, b) => a.localeCompare(b, "pl")),
    );
    expect(keyOptions).toEqual(
      ["Am", "Dm"].sort((a, b) => a.localeCompare(b, "pl")),
    );
  });
});
