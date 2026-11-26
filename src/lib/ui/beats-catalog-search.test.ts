import { describe, expect, it } from "vitest";

import {
  filterPresentedBeatsCatalogByQuery,
  catalogSearchPool,
  foldCatalogSearchText,
  parseTempoQuery,
} from "@/lib/ui/beats-catalog-search";
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

  it("matches ASCII query against Polish diacritics (laka↔Łąka, zolty↔Żółty)", () => {
    const input = [...FIXTURE];
    expect(
      filterPresentedBeatsCatalogByQuery(input, "laka").map((b) => b.id),
    ).toEqual(["f"]);
    expect(
      filterPresentedBeatsCatalogByQuery(input, "zolty").map((b) => b.id),
    ).toEqual(["d"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("rev", { title: "Laka" })],
        "łąka",
      ).map((b) => b.id),
    ).toEqual(["rev"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("rev2", { title: "Zolty" })],
        "żółty",
      ).map((b) => b.id),
    ).toEqual(["rev2"]);
  });

  it("folds Polish diacritics on producer / genre / key as well as title", () => {
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("p", { title: "X", producer: "Łąka Beats" })],
        "laka",
      ).map((b) => b.id),
    ).toEqual(["p"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("g", { title: "X", genre: "Żółty" })],
        "zolty",
      ).map((b) => b.id),
    ).toEqual(["g"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("k", { title: "X", key: "Łąka" })],
        "laka",
      ).map((b) => b.id),
    ).toEqual(["k"]);
  });

  it("matches NFC and NFD Unicode forms symmetrically", () => {
    const nfc = "Łąka";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(foldCatalogSearchText(nfc)).toBe(foldCatalogSearchText(nfd));
    expect(foldCatalogSearchText(nfc)).toBe("laka");

    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("nfc", { title: nfc })],
        nfd,
      ).map((b) => b.id),
    ).toEqual(["nfc"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("nfd", { title: nfd })],
        "laka",
      ).map((b) => b.id),
    ).toEqual(["nfd"]);
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("zol", { title: "Żółty".normalize("NFD") })],
        "zolty",
      ).map((b) => b.id),
    ).toEqual(["zol"]);
  });

  it("maps ł explicitly because NFD alone does not fold it to l", () => {
    expect("ł".normalize("NFD")).toBe("ł");
    expect(foldCatalogSearchText("ł")).toBe("l");
    expect(foldCatalogSearchText("Ł")).toBe("l");
    expect(
      filterPresentedBeatsCatalogByQuery(
        [beat("l", { title: "Łąka" })],
        "laka",
      ).map((b) => b.id),
    ).toEqual(["l"]);
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

describe("search by tempo and users' beats", () => {
  const beat = (id: string, title: string, bpm: number, community = false) =>
    ({ id, title, producer: "x", genre: null, mood: null, key: null, bpm, durationSeconds: 1, artworkVariant: 0, community }) as PresentedBeat;
  const list = [beat("a", "Noc", 90), beat("b", "Blok 90", 140), beat("c", "Dym", 190)];
  const ids = (q: string) => filterPresentedBeatsCatalogByQuery(list, q).map((b) => b.id);

  it("finds the exact tempo, and a bare number also titles", () => {
    expect(ids("90")).toEqual(["a", "b"]);
    expect(ids("90 BPM")).toEqual(["a"]);
    expect(ids("90bpm")).toEqual(["a"]);
    expect(ids("bpm 140")).toEqual(["b"]);
    expect(ids("999")).toEqual([]);
    expect(parseTempoQuery("blok 90")).toBeNull();
  });

  it("adds users' beats only while something is typed", () => {
    const mine = [beat("u", "Cudzy", 90, true)];
    expect(catalogSearchPool(list, mine, "  ")).toBe(list);
    expect(catalogSearchPool(list, mine, "90").map((b) => b.id)).toEqual(["a", "b", "c", "u"]);
  });
});
