import { describe, expect, it } from "vitest";

import { WORKS_MAX_PAGE, worksPageHref, worksPageOf } from "./works-page";

describe("/utwory paging", () => {
  it("parses ?strona= as a 1-based page, anything odd → 1", () => {
    expect(worksPageOf(undefined)).toBe(1);
    expect(worksPageOf("")).toBe(1);
    expect(worksPageOf("0")).toBe(1);
    expect(worksPageOf("-2")).toBe(1);
    expect(worksPageOf("2.5")).toBe(1);
    expect(worksPageOf("abc")).toBe(1);
    expect(worksPageOf("3")).toBe(3);
    expect(worksPageOf(["4", "9"])).toBe(4);
    expect(worksPageOf("9999")).toBe(WORKS_MAX_PAGE);
  });
  it("page 1 links to the bare catalogue (one canonical URL)", () => {
    expect(worksPageHref(1)).toBe("/utwory");
    expect(worksPageHref(2)).toBe("/utwory?strona=2");
  });
});
