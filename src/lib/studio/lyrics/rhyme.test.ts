import { describe, expect, it } from "vitest";

import { foldWord, lineEnding, rhymeReport, splitSections, wordsRhyme } from "./rhyme";

describe("rhyme — words", () => {
  it("folds Polish spelling", () => {
    expect(foldWord("Żółć")).toBe("zulc");
    expect(foldWord("duch")).toBe("duh");
    expect(foldWord("morze")).toBe("moze");
  });
  it("takes the last word of a line", () => {
    expect(lineEnding("Wracam z nocnej zmiany, miasto jeszcze śpi,")).toBe("spi");
    expect(lineEnding("...")).toBe("");
  });
  it("rhymes real Polish pairs", () => {
    const pairs: [string, string][] = [
      ["biegu", "śniegu"],
      ["plan", "stan"],
      ["domu", "nikomu"],
      ["miasto", "ciasto"],
      ["noc", "moc"],
      ["świata", "lata"],
    ];
    for (const [a, b] of pairs) expect(wordsRhyme(foldWord(a), foldWord(b)), `${a}/${b}`).toBe(true);
  });
  it("does not rhyme unrelated words or the same word", () => {
    const pairs: [string, string][] = [
      ["dom", "droga"],
      ["miasto", "serce"],
      ["noc", "dzień"],
      ["ulica", "ulica"],
    ];
    for (const [a, b] of pairs) expect(wordsRhyme(foldWord(a), foldWord(b)), `${a}/${b}`).toBe(false);
  });
});

describe("rhyme — report", () => {
  it("splits sections and ignores empty lines", () => {
    const s = splitSections("[Zwrotka 1]\nraz\n\ndwa\n[Refren]\ntrzy");
    expect(s).toEqual([
      { label: "Zwrotka 1", lines: ["raz", "dwa"] },
      { label: "Refren", lines: ["trzy"] },
    ]);
  });
  it("scores a rhymed AABB verse high", () => {
    const text = "[Zwrotka 1]\nRano kawa stygnie, miasto wraca do biegu,\nja wciąż liczę kroki po nocnym śniegu.\nW kieszeni drobne, w głowie ciężki plan,\ndziś zrobię z niego własny, pewny stan.";
    const r = rhymeReport(text);
    expect(r.score).toBe(1);
    expect(r.weak).toEqual([]);
  });
  it("accepts ABAB too", () => {
    const text = "[Zwrotka]\nśpi miasto\nbiegnie noc\nbudzi się ciasto\nrośnie moc";
    expect(rhymeReport(text).score).toBe(1);
  });
  it("lists the weak lines of an unrhymed verse", () => {
    const text = "[Zwrotka 1]\nCienie w metrze, dźwięk kroków\nMiasto śpiewa, a serce szuka\nNocna zmiana, w kieszeni myśli\nSkręcamy ulicami";
    const r = rhymeReport(text);
    expect(r.score).toBeLessThan(0.5);
    expect(r.weak.length).toBeGreaterThan(0);
    expect(r.weak[0]).toMatchObject({ section: "Zwrotka 1" });
  });
  it("returns 1 when there is nothing to check", () => {
    expect(rhymeReport("[Refren]\njedna linijka").score).toBe(1);
    expect(rhymeReport("").checked).toBe(0);
  });
});
