import { describe, expect, it } from "vitest";

import { downloadFilename, logicalNames, partCount, partName, partsOf, PART_BYTES, slugTitle } from "./parts";

describe("parts", () => {
  it("orders parts and prefers the whole object", () => {
    expect(partsOf(["source.wav.p001", "source.wav.p000", "x.wav.p000"], "source.wav")).toEqual(["source.wav.p000", "source.wav.p001"]);
    expect(partsOf(["source.wav", "source.wav.p000"], "source.wav")).toEqual(["source.wav"]);
    expect(partsOf([], "source.wav")).toEqual([]);
    expect(partName("a.wav", 7)).toBe("a.wav.p007");
    expect(partCount(PART_BYTES * 2 + 1)).toBe(3);
    expect(logicalNames(["01-a.wav.p000", "01-a.wav.p001", "02-b.wav"])).toEqual(["01-a.wav", "02-b.wav"]);
  });
  it("slugs titles with Polish letters", () => {
    expect(slugTitle("Mój Numer — Żółć ŁĄKA!")).toBe("moj-numer-zolc-laka");
    expect(slugTitle("")).toBe("bitrymdym");
    expect(downloadFilename("Mój numer", "master", "MP3_320", "mp3")).toBe("moj-numer_master_320.mp3");
    expect(downloadFilename("Mój numer", "projekt", "ZIP", "zip")).toBe("moj-numer_projekt.zip");
    expect(downloadFilename(null, "mix", "WAV_24", "wav")).toBe("bitrymdym_mix_wav24.wav");
  });
});
