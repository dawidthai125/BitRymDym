import { describe, expect, it } from "vitest";

import {
  artworkVariantForId,
  catalogGenresFromBeats,
  catalogKeysFromBeats,
  presentBeat,
  presentBeats,
} from "./demo-beats";

const FIXTURE_TITLES = [
  "Nocny kurs",
  "Beton i deszcz",
  "Szybki świt",
  "After Hours",
  "Night Ride",
] as const;

describe("presentBeats — real catalog read path", () => {
  it("empty input → empty catalog (no invented rows)", () => {
    expect(presentBeats([])).toEqual([]);
  });

  it("uses canonical DB title", () => {
    const beat = presentBeat({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      title: "Real Title From DB",
      producer: "Canonical Author",
      genre: "Trap",
      bpm: 140,
      key: "Am",
      durationSeconds: 125,
    });
    expect(beat.title).toBe("Real Title From DB");
  });

  it("Bit By DTT survives presentation (no Blackout Verse / Kaas)", () => {
    const beat = presentBeat({
      id: "ee65a815-449a-49a4-92f4-0e3bad3d6831",
      title: "Bit By DTT",
      producer: null,
      genre: null,
      bpm: 138,
      key: null,
      durationSeconds: 174,
    });
    expect(beat.title).toBe("Bit By DTT");
    expect(beat.bpm).toBe(138);
    expect(beat.durationSeconds).toBe(174);
    expect(beat.producer).toBe("—");
    expect(beat.title).not.toBe("Blackout Verse");
    expect(beat.producer).not.toBe("Kaas");
    expect(beat.title).not.toBe("Wireframe");
  });

  it("module exports no DEMO_BEAT_TEMPLATES / fixture catalogs", async () => {
    const mod = await import("./demo-beats");
    expect(mod).not.toHaveProperty("DEMO_BEAT_TEMPLATES");
    expect(mod).not.toHaveProperty("CATALOG_MOODS");
    expect(mod).not.toHaveProperty("CATALOG_GENRES");
    expect(mod).not.toHaveProperty("demoTemplateForId");
  });

  it("17 real rows → 17 real presentations (no fiction inject)", () => {
    const input = Array.from({ length: 17 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `Real Beat ${i + 1}`,
      producer: null as string | null,
      genre: null as string | null,
      bpm: 80 + i,
      key: null as string | null,
      durationSeconds: 100 + i,
    }));
    const rows = presentBeats(input);
    expect(rows).toHaveLength(17);
    expect(rows.map((r) => r.title)).toEqual(
      input.map((r) => r.title),
    );
    expect(rows.every((r) => r.producer === "—")).toBe(true);
    expect(rows.some((r) => r.title === "Wireframe")).toBe(false);
    expect(rows.some((r) => r.producer === "Kaas")).toBe(false);
  });

  it("never applies fixture / demo titles", () => {
    const beat = presentBeat({
      id: "9af764b9-35ed-45ac-9e32-9befbfe2aa2c",
      title: "phase19-master-tone",
      producer: "JA",
      genre: "RNB",
      bpm: 120,
      key: null,
      durationSeconds: 5,
    });
    expect(beat.title).toBe("phase19-master-tone");
    for (const fake of FIXTURE_TITLES) {
      expect(beat.title).not.toBe(fake);
    }
  });

  it("does not invent BPM or genre", () => {
    const beat = presentBeat({
      id: "id-1",
      title: "X",
      producer: null,
      genre: null,
      bpm: 0,
      key: null,
      durationSeconds: 0,
    });
    expect(beat.bpm).toBe(0);
    expect(beat.genre).toBeNull();
    expect(beat.key).toBeNull();
    expect(beat.mood).toBeNull();
    expect(beat.durationSeconds).toBe(0);
  });

  it("preserves canonical author from public path (no fixture producer)", () => {
    const beat = presentBeat({
      id: "id-2",
      title: "Y",
      producer: "Tajski",
      genre: "Hip-Hop",
      bpm: 92,
      key: "Em",
      durationSeconds: 180,
    });
    expect(beat.producer).toBe("Tajski");
    expect(beat.producer).not.toBe("Kubi");
    expect(beat.producer).not.toBe("Mira Beats");
    expect(beat.producer).not.toBe("North Tape");
  });

  it("empty/null producer → unknown marker, not a fake name", () => {
    expect(
      presentBeat({
        id: "id-3",
        title: "Z",
        producer: null,
        genre: null,
        bpm: 100,
        key: null,
        durationSeconds: 10,
      }).producer,
    ).toBe("—");
  });

  it("presentBeats does not inject fixture rows", () => {
    const rows = presentBeats([
      {
        id: "a",
        title: "Alpha",
        producer: "P1",
        genre: "Trap",
        bpm: 140,
        key: "Am",
        durationSeconds: 60,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Alpha");
    expect(rows[0]!.genre).toBe("Trap");
    expect(rows[0]!.bpm).toBe(140);
  });

  it("catalog filters derive only from real beat fields", () => {
    const rows = presentBeats([
      {
        id: "1",
        title: "A",
        producer: "P",
        genre: "Trap",
        bpm: 140,
        key: "Am",
        durationSeconds: 1,
      },
      {
        id: "2",
        title: "B",
        producer: "P",
        genre: null,
        bpm: 90,
        key: "Dm",
        durationSeconds: 1,
      },
      {
        id: "3",
        title: "C",
        producer: "P",
        genre: "Trap",
        bpm: 100,
        key: null,
        durationSeconds: 1,
      },
    ]);
    expect(catalogGenresFromBeats(rows)).toEqual(["Trap"]);
    expect(catalogKeysFromBeats(rows)).toEqual(["Am", "Dm"]);
    expect(catalogGenresFromBeats(rows)).not.toContain("Hip-Hop");
    expect(catalogGenresFromBeats(rows)).not.toContain("Boom Bap");
  });

  it("artworkVariant is deterministic visual chrome, not content", () => {
    const id = "stable-id";
    expect(artworkVariantForId(id)).toBe(artworkVariantForId(id));
    expect(presentBeat({
      id,
      title: "T",
      producer: "P",
      genre: "G",
      bpm: 1,
      key: "C",
      durationSeconds: 1,
    }).artworkVariant).toBe(artworkVariantForId(id));
  });
});
