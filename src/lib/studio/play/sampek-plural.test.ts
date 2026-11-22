import { describe, expect, it } from "vitest";

import { plPlural } from "@/lib/studio/play/sampek-edit";

describe("plPlural (Sampek counts)", () => {
  it("picks the Polish form for 1 / 2–4 / 5+ / 12–14 / 22", () => {
    const f = (n: number) => plPlural(n, "nuta", "nuty", "nut");
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25].map(f)).toEqual(["nuta", "nuty", "nuty", "nut", "nut", "nut", "nut", "nut", "nuty", "nut"]);
  });
});
