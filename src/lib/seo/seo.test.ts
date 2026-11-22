import { describe, expect, it } from "vitest";

import { beatsInGenre, collectGenres, genrePagePath, genreSlug } from "@/lib/seo/genre-pages";
import { beatRecordingJsonLd, isoDuration, serializeJsonLd, workRecordingJsonLd } from "@/lib/seo/json-ld";

describe("genre slugs", () => {
  it("slugs genres like the rest of the app", () => {
    expect(genreSlug("Boom Bap")).toBe("boom-bap");
    expect(genreSlug(" Trap ")).toBe("trap");
    expect(genreSlug("Drill")).toBe("drill");
    expect(genreSlug("Rap uliczny / łódzki")).toBe("rap-uliczny-lodzki");
    expect(genreSlug("")).toBeNull();
    expect(genreSlug(null)).toBeNull();
    expect(genreSlug("!!!")).toBeNull();
    expect(genrePagePath("trap")).toBe("/beats/gatunek/trap");
  });

  it("collects genres by slug, most beats first, with newest update", () => {
    const genres = collectGenres([
      { genre: "Trap", updatedAt: "2026-01-01T00:00:00Z" },
      { genre: "trap", updatedAt: "2026-03-01T00:00:00Z" },
      { genre: "Trap", updatedAt: null },
      { genre: "Boom Bap", updatedAt: "2026-02-01T00:00:00Z" },
      { genre: null },
    ]);
    expect(genres).toEqual([
      { slug: "trap", label: "Trap", count: 3, lastModified: "2026-03-01T00:00:00Z" },
      { slug: "boom-bap", label: "Boom Bap", count: 1, lastModified: "2026-02-01T00:00:00Z" },
    ]);
    expect(beatsInGenre([{ genre: "TRAP" }, { genre: "Drill" }], "trap")).toEqual([{ genre: "TRAP" }]);
  });
});

describe("JSON-LD", () => {
  it("formats ISO 8601 durations", () => {
    expect(isoDuration(205)).toBe("PT3M25S");
    expect(isoDuration(180)).toBe("PT3M");
    expect(isoDuration(3605)).toBe("PT1H5S");
    expect(isoDuration(0)).toBeNull();
    expect(isoDuration(null)).toBeNull();
    expect(isoDuration(Number.NaN)).toBeNull();
  });

  it("escapes script-breaking characters", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script> & co" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script> & co" });
  });

  it("builds a beat MusicRecording", () => {
    const ld = JSON.parse(
      serializeJsonLd(
        beatRecordingJsonLd({
          origin: "https://www.bitrymdym.pl",
          id: "b1",
          title: "Nocna zmiana",
          producer: "Bitek",
          genre: "Trap",
          tags: ["dark", " trap ", "dark", ""],
          bpm: 140.4,
          musicalKey: "Am",
          durationSeconds: 125,
          image: "/api/beats/b1/cover?s=full&v=1",
        }),
      ),
    );
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: "Nocna zmiana",
      url: "https://www.bitrymdym.pl/beat/b1",
      byArtist: { "@type": "Person", name: "Bitek" },
      duration: "PT2M5S",
      genre: "Trap",
      image: "https://www.bitrymdym.pl/api/beats/b1/cover?s=full&v=1",
      keywords: "dark, trap",
      additionalProperty: [
        { "@type": "PropertyValue", name: "tempo", value: 140, unitText: "BPM" },
        { "@type": "PropertyValue", name: "musicalKey", value: "Am" },
      ],
    });
  });

  it("omits unknown fields", () => {
    const ld = JSON.parse(
      serializeJsonLd(
        beatRecordingJsonLd({ origin: "https://x.pl/", id: "b2", title: "T", producer: "—", genre: null, durationSeconds: 0 }),
      ),
    );
    expect(ld).not.toHaveProperty("byArtist");
    expect(ld).not.toHaveProperty("duration");
    expect(ld).not.toHaveProperty("genre");
    expect(ld).not.toHaveProperty("keywords");
    expect(ld).not.toHaveProperty("additionalProperty");
    expect(ld.url).toBe("https://x.pl/beat/b2");
  });

  it("builds a work MusicRecording", () => {
    expect(
      workRecordingJsonLd({ origin: "https://x.pl", id: "w1", title: "Numer", author: "Ktoś", datePublished: "2026-11-01" }),
    ).toMatchObject({ "@type": "MusicRecording", url: "https://x.pl/utwor/w1", byArtist: { name: "Ktoś" } });
  });
});
