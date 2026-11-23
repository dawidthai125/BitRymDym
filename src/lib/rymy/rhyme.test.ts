import { describe, expect, it } from "vitest";

import { phonetic, rhymeKeys } from "@/lib/rymy/rhyme";

const key = (w: string) => rhymeKeys(w)!.key;

describe("Polish rhyme keys", () => {
  it("normalises pronunciation", () => {
    expect(phonetic("góra")).toBe("gura");
    expect(phonetic("rzeka")).toBe("żeka");
    expect(phonetic("chleb")).toBe("hlep");
    expect(phonetic("pies")).toBe("pjes");
    expect(phonetic("siano")).toBe("śano");
    expect(phonetic("idą")).toBe("idom");
  });
  it("matches classic rhymes from the penultimate vowel", () => {
    expect(key("serce")).toBe(key("w-serce".slice(2)));
    expect(key("ulica")).toBe(key("granica"));
    expect(key("noga")).toBe(key("droga"));
    expect(key("kot")).toBe(key("płot"));
    expect(key("góra")).toBe(key("chmura"));
    expect(key("bóg")).toBe(key("róg"));
  });
  it("near rhymes share the ending after the stressed vowel", () => {
    expect(key("miłość")).not.toBe(key("czułość"));
    expect(rhymeKeys("miłość")!.near).toBe(rhymeKeys("czułość")!.near);
    expect(rhymeKeys("życie")!.near).toBe(rhymeKeys("bicie")!.near);
    expect(rhymeKeys("kot")!.near).toBeNull();
  });
  it("does not rhyme different endings", () => {
    expect(key("noga")).not.toBe(key("nogi"));
    expect(key("ulica")).not.toBe(key("ulice"));
  });
  it("keeps a three-syllable key for multi-syllable rhymes", () => {
    expect(rhymeKeys("ulica")!.key3).toBe("ulica");
    expect(rhymeKeys("dzielnica")!.key3).toBe("elńica");
    expect(rhymeKeys("kot")!.key3).toBeNull();
  });
});
