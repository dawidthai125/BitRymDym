import { describe, expect, it } from "vitest";

import { absoluteUrl, clampText, SHARE_TARGETS, shareUrl, tryNativeShare } from "./share-links";

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

describe("tryNativeShare", () => {
  const data = { url: URL_, text: "Hej", title: "Kawałek" };
  it("reports unsupported without navigator.share", async () => {
    expect(await tryNativeShare(undefined, data)).toBe("unsupported");
    expect(await tryNativeShare({}, data)).toBe("unsupported");
    expect(await tryNativeShare({ share: async () => {}, canShare: () => false }, data)).toBe("unsupported");
  });
  it("passes data to the share sheet", async () => {
    let got: ShareData | null = null;
    expect(await tryNativeShare({ share: async (d) => void (got = d) }, data)).toBe("shared");
    expect(got).toEqual(data);
  });
  it("treats AbortError as a user cancel and other errors as failed", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    expect(await tryNativeShare({ share: async () => Promise.reject(abort) }, data)).toBe("cancelled");
    expect(await tryNativeShare({ share: async () => Promise.reject(new Error("NotAllowed")) }, data)).toBe("failed");
  });
});
