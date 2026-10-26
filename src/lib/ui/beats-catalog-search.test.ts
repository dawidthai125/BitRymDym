import { describe, expect, it } from "vitest";

import { filterPresentedBeatsCatalogByQuery } from "@/lib/ui/beats-catalog-search";
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

/** Input order ≠ alphabetical — used for empty-query / multi-hit order. */
const FIXTURE: PresentedBeat[] = [
  beat("e", { title: "Beta", bpm: 160 }),
  beat("c", {
    title: "Zebra",
    producer: "North",
    genre: "Boom Bap",
    key: "Dm",
  }),
  beat("a", { title: "Ącka", producer: "Tajski", genre: "Trap", key: "Am" }),
  beat("d", { title: "Żółty", genre: "Hip-Hop", key: "F#m" }),
  beat("b", {
    title: "Lampa",
    producer: "Mira Beats",
    genre: null,
    key: null,
  }),
  beat("f", { title: "Łąka", bpm: 110 }),
];

const INPUT_IDS = ["e", "c", "a", "d", "b", "f"] as const;

describe("filterPresentedBeatsCatalogByQuery", () => {
  it("empty or whitespace query returns full input order without mutating", () => {
    for (const query of ["", "   ", "\t\n "]) {
      const input = [...FIXTURE];
      const snapshot = input.map((b) => b.id);
      const result = filterPresentedBeatsCatalogByQuery(input, query);
      expect(result.map((b) => b.id)).toEqual([...INPUT_IDS]);
      expect(result).not.toBe(input);
      expect(input.map((b) => b.id)).toEqual(snapshot);
    }
  });

  it("trims query before matching", () => {
    const input = [
      beat("t1", { title: "Nocny kurs" }),
      beat("t2", { title: "Other", producer: "Tajski" }),
    ];
    expect(
      filterPresentedBeatsCatalogByQuery(input, "  kurs  ").map((b) => b.id),
    ).toEqual(["t1"]);
    expect(
      filterPresentedBeatsCatalogByQuery(input, "  taj  ").map((b) => b.id),
    ).toEqual(["t2"]);
  });

  it("matches title / producer / genre / key as substrings (OR)", () => {
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("t", { title: "Nocny kurs" })],
        "kurs",
      ).map((b) => b.id),
    ).toEqual(["t"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("p", { title: "X", producer: "Tajski" })],
        "taj",
      ).map((b) => b.id),
    ).toEqual(["p"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("g", { title: "X", genre: "Trap" })],
        "rap",
      ).map((b) => b.id),
    ).toEqual(["g"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("k", { title: "X", key: "F#m" })],
        "f#",
      ).map((b) => b.id),
    ).toEqual(["k"]);
  });

  it("is case-insensitive including Polish letter case variants", () => {
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("z", { title: "Żółty Bit" })],
        "żółty",
      ).map((b) => b.id),
    ).toEqual(["z"]);
    expect(
      filterPresentedBeatsCatalogByQuery([beat("l", { title: "Łąka" })], "ŁĄKA").map(
        (b) => b.id,
      ),
    ).toEqual(["l"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("h", { title: "X", genre: "Hip-Hop" })],
        "HIP-HOP",
      ).map((b) => b.id),
    ).toEqual(["h"]);
  });

  it("returns [] when nothing matches; null genre/key do not throw", () => {
    const input = [...FIXTURE];
    expect(
      filterPresentedBeatsCatalogByQuery(input, "__brak_takiego_stringa__"),
    ).toEqual([]);
    expect(filterPresentedBeatsCatalogByQuery([], "anything")).toEqual([]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("b", { title: "Lampa", genre: null, key: null })],
        "lampa",
      ).map((b) => b.id),
    ).toEqual(["b"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("b", { title: "Lampa", genre: null, key: null })],
        "trap",
      ),
    ).toEqual([]);
  });

  it("preserves input order among hits and does not mutate the array", () => {
    const input = [...FIXTURE];
    const snapshot = input.map((b) => b.id);
    expect(
      filterPresentedBeatsCatalogByQuery(input, "north").map((b) => b.id),
    ).toEqual(["c"]);
    // "trap" → genre Trap on e, a, f — input order preserved
    const multi = filterPresentedBeatsCatalogByQuery(input, "trap");
    expect(multi.map((b) => b.id)).toEqual(["e", "a", "f"]);
    expect(input.map((b) => b.id)).toEqual(snapshot);
    expect(multi).not.toBe(input);
  });

  it("does not match BPM as text search", () => {
    const input = [beat("bpm", { title: "Solo", bpm: 140 })];
    expect(filterPresentedBeatsCatalogByQuery(input, "140")).toEqual([]);
  });

  it("client wires text search through the shared helper", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/brand/beats-catalog-client.tsx"),
      "utf8",
    );
    expect(src).toMatch(/filterPresentedBeatsCatalogByQuery\(/);
    expect(src).not.toMatch(
      /b\.title\.toLowerCase\(\)\.includes\(q\)/,
    );
  });
});
