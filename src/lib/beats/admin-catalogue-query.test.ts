import { describe, expect, it } from "vitest";

import {
  ADMIN_BEATS_DEFAULT_PAGE_SIZE,
  ADMIN_BEATS_SORT_COLUMNS,
  adminBeatsHref,
  adminBeatsPageCount,
  adminBeatsRange,
  adminBeatsToggleSort,
  isAdminBeatsSortKey,
  normalizeAdminBeatsSearch,
  parseAdminBeatsQuery,
} from "@/lib/beats/admin-catalogue-query";

describe("admin beat catalogue sort whitelist", () => {
  it("defaults to upload date, newest first", () => {
    const q = parseAdminBeatsQuery({});
    expect(q).toMatchObject({ sort: "uploaded", dir: "desc", page: 1, size: 20, q: "", status: null });
    expect(ADMIN_BEATS_SORT_COLUMNS[q.sort]).toBe("created_at");
  });

  it("maps public keys to real columns only", () => {
    expect(ADMIN_BEATS_SORT_COLUMNS.bpm).toBe("bpm");
    expect(ADMIN_BEATS_SORT_COLUMNS.duration).toBe("duration_seconds");
    expect(ADMIN_BEATS_SORT_COLUMNS.producer).toBe("producer");
  });

  it.each(["owner_id", "created_at", "bpm;drop table beats", "__proto__", "constructor", "toString", ""])(
    "rejects non-whitelisted sort %j",
    (raw) => {
      expect(isAdminBeatsSortKey(raw)).toBe(false);
      expect(parseAdminBeatsQuery({ sort: raw }).sort).toBe("uploaded");
    },
  );

  it("accepts only asc/desc", () => {
    expect(parseAdminBeatsQuery({ sort: "bpm", dir: "asc" })).toMatchObject({ sort: "bpm", dir: "asc" });
    expect(parseAdminBeatsQuery({ dir: "DESC; --" }).dir).toBe("desc");
  });

  it("header toggle flips direction on the active column and resets page", () => {
    const q = parseAdminBeatsQuery({ sort: "bpm", dir: "desc", page: "3" });
    expect(adminBeatsToggleSort(q, "bpm")).toEqual({ sort: "bpm", dir: "asc", page: 1 });
    expect(adminBeatsToggleSort(q, "title")).toEqual({ sort: "title", dir: "asc", page: 1 });
    expect(adminBeatsToggleSort(q, "duration")).toEqual({ sort: "duration", dir: "desc", page: 1 });
  });
});

describe("admin beat catalogue pagination", () => {
  it("clamps page and page size", () => {
    expect(parseAdminBeatsQuery({ page: "0" }).page).toBe(1);
    expect(parseAdminBeatsQuery({ page: "-4" }).page).toBe(1);
    expect(parseAdminBeatsQuery({ page: "abc" }).page).toBe(1);
    expect(parseAdminBeatsQuery({ page: "999999" }).page).toBe(1000);
    expect(parseAdminBeatsQuery({ size: "10" }).size).toBe(10);
    expect(parseAdminBeatsQuery({ size: "500" }).size).toBe(ADMIN_BEATS_DEFAULT_PAGE_SIZE);
    expect(parseAdminBeatsQuery({ size: ["10", "20"] }).size).toBe(10);
  });

  it("computes inclusive ranges and page counts", () => {
    expect(adminBeatsRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(adminBeatsRange(2, 20)).toEqual({ from: 20, to: 39 });
    expect(adminBeatsPageCount(0, 20)).toBe(1);
    expect(adminBeatsPageCount(23, 20)).toBe(2);
    expect(adminBeatsPageCount(40, 20)).toBe(2);
    expect(adminBeatsPageCount(23, 10)).toBe(3);
  });

  it("builds short URLs that drop defaults", () => {
    const q = parseAdminBeatsQuery({});
    expect(adminBeatsHref(q)).toBe("/admin/beats");
    expect(adminBeatsHref(q, { page: 2 })).toBe("/admin/beats?page=2");
    expect(adminBeatsHref(parseAdminBeatsQuery({ sort: "bpm", dir: "asc", q: "noc", status: "PUBLISHED", size: "10" }), { page: 3 })).toBe(
      "/admin/beats?q=noc&status=PUBLISHED&sort=bpm&dir=asc&size=10&page=3",
    );
  });
});

describe("admin beat catalogue search/filter parsing", () => {
  it("strips PostgREST or-filter metacharacters and wildcards", () => {
    expect(normalizeAdminBeatsSearch("  a,b(c)*d%e\"g\\h  ")).toBe("a b c d e g h");
    expect(normalizeAdminBeatsSearch("Don't stop_now")).toBe("Don't stop_now");
    expect(normalizeAdminBeatsSearch("title.eq.x,owner_id.is.null")).toBe("title.eq.x owner_id.is.null");
    expect(normalizeAdminBeatsSearch("x".repeat(200))).toHaveLength(80);
  });

  it("accepts only known statuses", () => {
    expect(parseAdminBeatsQuery({ status: "PUBLISHED" }).status).toBe("PUBLISHED");
    expect(parseAdminBeatsQuery({ status: "published" }).status).toBeNull();
    expect(parseAdminBeatsQuery({ status: "all" }).status).toBeNull();
  });
});
