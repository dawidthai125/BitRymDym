import { describe, expect, it } from "vitest";

import { catalogPageHref, pageOfRow, pagerItems, paginate, parseCatalogPage } from "./paginate";

const rows = Array.from({ length: 45 }, (_, i) => ({ id: `r${i + 1}` }));

describe("catalogue paging", () => {
  it("shows 20 per page and the rest on the last one", () => {
    expect(paginate(rows, 1).rows).toHaveLength(20);
    expect(paginate(rows, 2).rows[0]!.id).toBe("r21");
    expect(paginate(rows, 3)).toMatchObject({ page: 3, pages: 3 });
    expect(paginate(rows, 3).rows).toHaveLength(5);
    expect(paginate(rows, 99).page).toBe(3);
    expect(paginate([], 4)).toEqual({ page: 1, pages: 1, rows: [] });
    expect(paginate(rows.slice(0, 20), 1).pages).toBe(1);
  });
  it("reads the page from the address safely", () => {
    expect(parseCatalogPage("2")).toBe(2);
    for (const bad of [undefined, null, "", "0", "-1", "1.5", "abc", "99999"]) expect(parseCatalogPage(bad)).toBe(1);
  });
  it("keeps other parameters in links", () => {
    expect(catalogPageHref("katalog=platny", 2)).toBe("?katalog=platny&strona=2");
    expect(catalogPageHref("zrodlo=user&strona=3", 1)).toBe("?zrodlo=user");
    expect(catalogPageHref("", 1)).toBe("?");
  });
  it("finds the page of a row and shortens long pagers", () => {
    expect(pageOfRow(rows, "r21")).toBe(2);
    expect(pageOfRow(rows, "x")).toBeNull();
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(2, 3)).toEqual([1, 2, 3]);
    expect(pagerItems(5, 12)).toEqual([1, 0, 4, 5, 6, 0, 12]);
  });
});
