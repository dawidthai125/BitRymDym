import { describe, expect, it } from "vitest";

import {
  sortPresentedBeatsCatalog,
  type BeatsCatalogSortId,
} from "@/lib/ui/beats-catalog-sort";
import type { PresentedBeat } from "@/lib/ui/demo-beats";

function beat(
  id: string,
  title: string,
  bpm: number,
): PresentedBeat {
  return {
    id,
    title,
    producer: "Probe",
    genre: "Trap",
    mood: null,
    key: "Am",
    bpm,
    durationSeconds: 30,
    artworkVariant: 0,
  };
}

/**
 * Input order deliberately differs from title A–Z and from BPM desc.
 * Polish titles: Ącka, Łąka, Żółty — remis BPM 140: Ącka vs Lampa.
 */
const FIXTURE: PresentedBeat[] = [
  beat("e", "Beta", 160),
  beat("c", "Zebra", 90),
  beat("a", "Ącka", 140),
  beat("d", "Żółty", 100),
  beat("b", "Lampa", 140),
  beat("f", "Łąka", 110),
];

const INPUT_IDS = ["e", "c", "a", "d", "b", "f"] as const;

describe("sortPresentedBeatsCatalog", () => {
  it("newest preserves props/service order and does not mutate input", () => {
    const input = [...FIXTURE];
    const snapshot = input.map((b) => b.id);
    const result = sortPresentedBeatsCatalog(input, "newest");

    expect(result.map((b) => b.id)).toEqual([...INPUT_IDS]);
    expect(result).not.toBe(input);
    expect(input.map((b) => b.id)).toEqual(snapshot);
    expect(input).toEqual(FIXTURE);
  });

  it("featured orders titles with localeCompare pl (incl. Polish letters)", () => {
    const input = [...FIXTURE];
    const result = sortPresentedBeatsCatalog(input, "featured");

    // Node/ICU pl: Ącka|Beta|Lampa|Łąka|Zebra|Żółty
    expect(result.map((b) => b.id)).toEqual(["a", "e", "b", "f", "c", "d"]);
    expect(result.map((b) => b.title)).toEqual([
      "Ącka",
      "Beta",
      "Lampa",
      "Łąka",
      "Zebra",
      "Żółty",
    ]);
    expect(input.map((b) => b.id)).toEqual([...INPUT_IDS]);
    expect(result).not.toBe(input);
  });

  it("listened orders BPM descending with pl title tie-break", () => {
    const input = [...FIXTURE];
    const result = sortPresentedBeatsCatalog(input, "listened");

    // 160 Beta → 140 Ącka/Lampa (pl) → 110 Łąka → 100 Żółty → 90 Zebra
    expect(result.map((b) => b.id)).toEqual(["e", "a", "b", "f", "d", "c"]);
    expect(result.map((b) => b.bpm)).toEqual([160, 140, 140, 110, 100, 90]);
    expect(input.map((b) => b.id)).toEqual([...INPUT_IDS]);
    expect(result).not.toBe(input);
  });

  it("empty and singleton stay stable for every sort id", () => {
    const sorts: BeatsCatalogSortId[] = ["newest", "featured", "listened"];
    for (const sort of sorts) {
      expect(sortPresentedBeatsCatalog([], sort)).toEqual([]);
      const one = [beat("only", "Solo", 120)];
      const out = sortPresentedBeatsCatalog(one, sort);
      expect(out.map((b) => b.id)).toEqual(["only"]);
      expect(out).not.toBe(one);
      expect(one.map((b) => b.id)).toEqual(["only"]);
    }
  });

  it("client wires SortId options to the shared helper", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/brand/beats-catalog-client.tsx"),
      "utf8",
    );
    expect(src).toMatch(/sortPresentedBeatsCatalog\(list,\s*sort\)/);
    expect(src).not.toMatch(/\[\.\.\.list\]\.sort\(/);
  });
});
