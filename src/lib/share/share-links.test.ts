import { describe, expect, it } from "vitest";

import { absoluteUrl, clampText, SHARE_TARGETS, shareUrl } from "./share-links";

const URL_ = "https://bitrymdym.pl/beat/abc?x=1&y=2";

describe("shareUrl", () => {
  it("encodes the url for every target", () => {
    for (const s of SHARE_TARGETS) expect(shareUrl(s, URL_, "Bit & rym")).toContain(encodeURIComponent(URL_));
  });
  it("builds the public intents", () => {
    expect(shareUrl("facebook", URL_, "t")).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
    expect(shareUrl("x", URL_, "Bit & rym")).toContain("text=Bit%20%26%20rym");
    expect(shareUrl("whatsapp", URL_, "Hej")).toBe(`https://wa.me/?text=${encodeURIComponent(`Hej ${URL_}`)}`);
  });
});

describe("helpers", () => {
  it("absoluteUrl joins without double slashes", () => {
    expect(absoluteUrl("https://a.pl/", "/beat/1")).toBe("https://a.pl/beat/1");
  });
  it("clampText trims on a word", () => {
    expect(clampText("  a   b  ", 10)).toBe("a b");
    const out = clampText("Bardzo długi tytuł bitu który się nie mieści", 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
    expect(clampText(null, 5)).toBe("");
  });
});
