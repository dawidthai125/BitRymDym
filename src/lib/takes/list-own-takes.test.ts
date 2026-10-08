/**
 * Account profile recent-takes visibility: DELETED excluded before limit.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isTakeSoftDeleted,
  takeRecentNonDeletedTakes,
  type OwnTakeListItem,
} from "@/lib/takes/list-own-takes";

function stub(
  id: string,
  displayStatus: OwnTakeListItem["displayStatus"],
): Pick<OwnTakeListItem, "id" | "displayStatus"> {
  return { id, displayStatus };
}

describe("isTakeSoftDeleted SSOT", () => {
  it("matches status DELETED or deleted_at set", () => {
    expect(isTakeSoftDeleted({ status: "DELETED", deleted_at: null })).toBe(
      true,
    );
    expect(
      isTakeSoftDeleted({
        status: "READY",
        deleted_at: "2026-10-07T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(isTakeSoftDeleted({ status: "READY", deleted_at: null })).toBe(
      false,
    );
    expect(isTakeSoftDeleted({ status: "EXPIRED", deleted_at: null })).toBe(
      false,
    );
  });
});

describe("takeRecentNonDeletedTakes — profile contract", () => {
  it("CASE 1: hides DELETED among READY", () => {
    const items = [
      stub("d1", "DELETED"),
      stub("r1", "READY"),
      stub("r2", "READY"),
      stub("d2", "DELETED"),
      stub("r3", "READY"),
    ];
    const recent = takeRecentNonDeletedTakes(items, 5);
    expect(recent.map((t) => t.id)).toEqual(["r1", "r2", "r3"]);
    expect(recent.every((t) => t.displayStatus !== "DELETED")).toBe(true);
  });

  it("CASE 2: newest DELETED do not occupy the 5-slot before active", () => {
    const items = [
      stub("d1", "DELETED"),
      stub("d2", "DELETED"),
      stub("d3", "DELETED"),
      stub("d4", "DELETED"),
      stub("r1", "READY"),
      stub("r2", "READY"),
    ];
    // Wrong: slice(0,5).filter → only r1 (or empty if only deleted in first 5)
    const wrong = items.slice(0, 5).filter((t) => t.displayStatus !== "DELETED");
    expect(wrong.map((t) => t.id)).toEqual(["r1"]);
    const recent = takeRecentNonDeletedTakes(items, 5);
    expect(recent.map((t) => t.id)).toEqual(["r1", "r2"]);
  });

  it("CASE 3: 300 DELETED → empty recent (empty-state path)", () => {
    const items = Array.from({ length: 300 }, (_, i) =>
      stub(`d${i}`, "DELETED" as const),
    );
    expect(takeRecentNonDeletedTakes(items, 5)).toEqual([]);
  });

  it("CASE 4: many DELETED + 7 ACTIVE → at most 5 ACTIVE", () => {
    const deleted = Array.from({ length: 300 }, (_, i) =>
      stub(`d${i}`, "DELETED" as const),
    );
    const active = Array.from({ length: 7 }, (_, i) =>
      stub(`a${i}`, "READY" as const),
    );
    // Interleave deleted first then active (as if newest were deleted)
    const items = [...deleted.slice(0, 10), ...active, ...deleted.slice(10)];
    const recent = takeRecentNonDeletedTakes(items, 5);
    expect(recent).toHaveLength(5);
    expect(recent.every((t) => t.displayStatus === "READY")).toBe(true);
    expect(recent.map((t) => t.id)).toEqual(["a0", "a1", "a2", "a3", "a4"]);
  });

  it("CASE 5: filter is visibility-only — does not mutate source array", () => {
    const items = [stub("d1", "DELETED"), stub("r1", "READY")];
    const before = items.length;
    takeRecentNonDeletedTakes(items, 5);
    expect(items).toHaveLength(before);
    expect(items[0]?.displayStatus).toBe("DELETED");
  });
});

describe("account page wiring", () => {
  it("loads takes with includeDeleted:false and uses takeRecentNonDeletedTakes", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/account/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/listOwnTakes\(\s*\{\s*includeDeleted:\s*false\s*\}\s*\)/);
    expect(src).toMatch(/takeRecentNonDeletedTakes\(\s*takes\s*,\s*5\s*\)/);
    expect(src).not.toMatch(/\.slice\(\s*0\s*,\s*5\s*\)\.filter/);
  });

  it("listOwnTakes applies DB soft-delete filters when includeDeleted is false", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/takes/list-own-takes.ts"),
      "utf8",
    );
    expect(src).toMatch(/includeDeleted/);
    expect(src).toMatch(/\.neq\(\s*"status"\s*,\s*"DELETED"\s*\)/);
    expect(src).toMatch(/\.is\(\s*"deleted_at"\s*,\s*null\s*\)/);
  });
});
