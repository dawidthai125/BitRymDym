import { describe, expect, it } from "vitest";

import { filterListings, listingSummaryKeys } from "./listing-filter";

describe("own listings", () => {
  const items = [{ title: "Trąbka z tłumikiem" }, { title: "Gumowy bas" }];
  it("finds titles without Polish marks and keeps all for an empty search", () => {
    expect(filterListings(items, "trabka z tlum")).toEqual([items[0]]);
    expect(filterListings(items, "BAS")).toEqual([items[1]]);
    expect(filterListings(items, "  ")).toEqual(items);
    expect(filterListings(items, "xyz")).toEqual([]);
  });
  it("summarises a closed row", () => {
    const off = { listed: false, allowRatings: false, allowComments: false, inRankings: false };
    expect(listingSummaryKeys(off)).toEqual(["off"]);
    expect(listingSummaryKeys({ listed: true, allowRatings: true, allowComments: false, inRankings: true })).toEqual(["listed", "ratings", "ranking"]);
  });
});
