import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import pl from "../../../messages/pl.json";
import { findStudioFeatures, normalizeFeatureText, STUDIO_FEATURES } from "./studio-feature-finder";

type Items = Record<string, { label: string; keywords: string }>;
const textFrom = (messages: typeof pl) => (id: string) => (messages.studio.featureFinder.items as Items)[id]!;
const ids = (query: string, messages: typeof pl = pl) => findStudioFeatures(query, textFrom(messages)).map((f) => f.id);

describe("studio feature finder", () => {
  it("has a name and keywords in both languages for every entry, and no unused text", () => {
    for (const messages of [pl, en as typeof pl]) {
      const items = messages.studio.featureFinder.items as Items;
      expect(Object.keys(items).sort()).toEqual(STUDIO_FEATURES.map((f) => f.id).sort());
      for (const feature of STUDIO_FEATURES) {
        expect(items[feature.id]!.label.length).toBeGreaterThan(0);
        expect(messages.studio.featureFinder.miejsca).toHaveProperty(feature.place);
      }
    }
  });

  it("shows everything while nothing is typed", () => {
    expect(ids("  ")).toEqual(STUDIO_FEATURES.map((f) => f.id));
  });

  it("finds the places people could not find", () => {
    expect(ids("auto")[0]).toBe("autotune");
    expect(ids("opóźnienie")[0]).toBe("latency");
    expect(ids("opoznienie")).toContain("latency");
    expect(ids("zwrotki")).toContain("markers");
    expect(ids("refren")).toContain("markers");
    expect(ids("tekst")).toContain("lyrics");
    expect(ids("import")).toEqual(expect.arrayContaining(["importVocal", "stems"]));
    expect(ids("pobierz")).toContain("export");
    expect(ids("szum")).toContain("cleanup");
    expect(ids("reverb")).toContain("effects");
  });

  it("works in English", () => {
    expect(ids("latency", en as typeof pl)[0]).toBe("latency");
    expect(ids("export", en as typeof pl)[0]).toBe("export");
  });

  it("needs every word and answers nothing for nonsense", () => {
    expect(ids("xyzq")).toEqual([]);
    expect(ids("automatyka głośności")).toContain("volumeAutomation");
    expect(ids("automatyka xyzq")).toEqual([]);
  });

  it("drops Polish accents, also ł", () => {
    expect(normalizeFeatureText("Ścieżka, GŁOŚNOŚĆ")).toBe("sciezka, glosnosc");
  });
});
