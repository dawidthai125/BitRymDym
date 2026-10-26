import { describe, expect, it } from "vitest";

import {
  catalogBpmBoundsFromBeats,
  countActiveCatalogChipFilters,
  filterPresentedBeatsCatalogByChips,
} from "@/lib/ui/beats-catalog-filters";
import type { PresentedBeat } from "@/lib/ui/demo-beats";

function beat(
  id: string,
  overrides: Partial<PresentedBeat> & Pick<PresentedBeat, "title">,
): PresentedBeat {
  return {
    id,
    title: overrides.title,
    producer: overrides.producer ?? "Probe",
    genre: overrides.genre !== undefined ? overrides.genre : "Trap",
    mood: null,
    key: overrides.key !== undefined ? overrides.key : "Am",
    bpm: overrides.bpm ?? 140,
    durationSeconds: 30,
    artworkVariant: 0,
    ...overrides,
  };
}

const FIXTURE: PresentedBeat[] = [
  beat("e", { title: "Beta", genre: "Trap", key: "Am", bpm: 160 }),
  beat("c", { title: "Zebra", genre: "Drill", key: "Dm", bpm: 90 }),
  beat("a", { title: "Ącka", genre: "Trap", key: "Am", bpm: 140 }),
  beat("d", { title: "Żółty", genre: "Hip-Hop", key: "F#m", bpm: 100 }),
  beat("b", { title: "Lampa", genre: null, key: null, bpm: 140 }),
  beat("f", { title: "Łąka", genre: "Trap", key: "Cm", bpm: 110 }),
];

const NONE = {
  genres: [] as string[],
  keys: [] as string[],
  bpmFilterActive: false,
  bpmMin: 70,
  bpmMax: 160,
};

describe("filterPresentedBeatsCatalogByChips", () => {
  it("passes through when no chips/BPM active and does not mutate input", () => {
    const input = [...FIXTURE];
    const snapshot = input.map((b) => b.id);
    const result = filterPresentedBeatsCatalogByChips(input, NONE);
    expect(result.map((b) => b.id)).toEqual(snapshot);
    expect(result).not.toBe(input);
    expect(input.map((b) => b.id)).toEqual(snapshot);
  });

  it("filters genre with OR within dimension and excludes null genre", () => {
    const result = filterPresentedBeatsCatalogByChips(FIXTURE, {
      ...NONE,
      genres: ["Trap"],
    });
    expect(result.map((b) => b.id)).toEqual(["e", "a", "f"]);
    const multi = filterPresentedBeatsCatalogByChips(FIXTURE, {
      ...NONE,
      genres: ["Trap", "Drill"],
    });
    expect(multi.map((b) => b.id)).toEqual(["e", "c", "a", "f"]);
  });

  it("filters key with OR and excludes null key", () => {
    expect(
      filterPresentedBeatsCatalogByChips(FIXTURE, {
        ...NONE,
        keys: ["Am"],
      }).map((b) => b.id),
    ).toEqual(["e", "a"]);
  });

  it("applies BPM only when active, inclusive bounds", () => {
    const inactive = filterPresentedBeatsCatalogByChips(FIXTURE, {
      ...NONE,
      bpmFilterActive: false,
      bpmMin: 150,
      bpmMax: 160,
    });
    expect(inactive.map((b) => b.id)).toEqual(FIXTURE.map((b) => b.id));

    const active = filterPresentedBeatsCatalogByChips(FIXTURE, {
      ...NONE,
      bpmFilterActive: true,
      bpmMin: 100,
      bpmMax: 140,
    });
    expect(active.map((b) => b.id)).toEqual(["a", "d", "b", "f"]);
  });

  it("ANDs genre + key + BPM dimensions", () => {
    const result = filterPresentedBeatsCatalogByChips(FIXTURE, {
      genres: ["Trap"],
      keys: ["Am"],
      bpmFilterActive: true,
      bpmMin: 130,
      bpmMax: 150,
    });
    expect(result.map((b) => b.id)).toEqual(["a"]);
  });

  it("returns [] for empty input or no matches", () => {
    expect(filterPresentedBeatsCatalogByChips([], NONE)).toEqual([]);
    expect(
      filterPresentedBeatsCatalogByChips(FIXTURE, {
        ...NONE,
        genres: ["Nonexistent"],
      }),
    ).toEqual([]);
  });
});

describe("countActiveCatalogChipFilters / catalogBpmBoundsFromBeats", () => {
  it("counts genres, keys, and active BPM", () => {
    expect(
      countActiveCatalogChipFilters({
        genres: ["Trap", "Drill"],
        keys: ["Am"],
        bpmFilterActive: true,
      }),
    ).toBe(4);
    expect(
      countActiveCatalogChipFilters({
        genres: [],
        keys: [],
        bpmFilterActive: false,
      }),
    ).toBe(0);
  });

  it("derives BPM bounds with fallback", () => {
    expect(catalogBpmBoundsFromBeats([])).toEqual({ min: 70, max: 160 });
    expect(catalogBpmBoundsFromBeats(FIXTURE)).toEqual({ min: 90, max: 160 });
  });
});

describe("client wiring", () => {
  it("uses shared chip filter helper and seeds BPM state from catalog bounds", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/brand/beats-catalog-client.tsx"),
      "utf8",
    );
    expect(src).toMatch(/filterPresentedBeatsCatalogByChips\(/);
    expect(src).toMatch(
      /useState\(\s*\(\)\s*=>\s*catalogBpmBoundsFromBeats\(beats\)\.min/,
    );
    expect(src).toMatch(
      /useState\(\s*\(\)\s*=>\s*catalogBpmBoundsFromBeats\(beats\)\.max/,
    );
    expect(src).not.toMatch(/useState\(70\)/);
    expect(src).not.toMatch(/useState\(160\)/);
    expect(src).not.toMatch(
      /genres\.length && \(!b\.genre \|\| !genres\.includes\(b\.genre\)\)/,
    );
  });
});
