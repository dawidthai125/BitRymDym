import { describe, expect, it } from "vitest";

import { cleanFeaturedNote, FEATURED_NOTE_MAX, shouldShowFeatured, warsawWeekStart } from "./featured-work";

const WORK = "0b7f3c1e-6c1a-4e57-9a62-1d2c3b4a5f60";

describe("warsawWeekStart (Monday, Europe/Warsaw)", () => {
  it("returns the Monday of the current week", () => {
    // Sunday 2026-11-22 12:00 UTC → week from Monday 2026-11-16.
    expect(warsawWeekStart(new Date("2026-11-22T12:00:00Z"))).toBe("2026-11-16");
    // Wednesday mid-week.
    expect(warsawWeekStart(new Date("2026-11-18T09:00:00Z"))).toBe("2026-11-16");
  });

  it("switches at Warsaw midnight, not UTC midnight", () => {
    // Sunday 23:30 UTC = Monday 00:30 in Warsaw (CET, +1).
    expect(warsawWeekStart(new Date("2026-11-22T23:30:00Z"))).toBe("2026-11-23");
    // Sunday 22:59 UTC = Sunday 23:59 in Warsaw → still the old week.
    expect(warsawWeekStart(new Date("2026-11-22T22:59:00Z"))).toBe("2026-11-16");
  });

  it("handles summer time (CEST, +2)", () => {
    // Sunday 2026-07-05 22:30 UTC = Monday 2026-07-06 00:30 in Warsaw.
    expect(warsawWeekStart(new Date("2026-07-05T22:30:00Z"))).toBe("2026-07-06");
    expect(warsawWeekStart(new Date("2026-07-05T21:30:00Z"))).toBe("2026-06-29");
  });

  it("crosses a year boundary", () => {
    // Friday 2027-01-01 → Monday 2026-12-28.
    expect(warsawWeekStart(new Date("2027-01-01T10:00:00Z"))).toBe("2026-12-28");
  });
});

describe("shouldShowFeatured", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const row = { workId: WORK, weekStart: "2026-11-16" };

  it("shows a live work featured for this week", () => {
    expect(shouldShowFeatured(row, { id: WORK }, now)).toBe(true);
  });

  it("hides when there is no feature or the work is no longer public", () => {
    expect(shouldShowFeatured(null, { id: WORK }, now)).toBe(false);
    expect(shouldShowFeatured(row, null, now)).toBe(false);
  });

  it("hides a feature from another week", () => {
    expect(shouldShowFeatured({ ...row, weekStart: "2026-11-09" }, { id: WORK }, now)).toBe(false);
    expect(shouldShowFeatured(row, { id: WORK }, new Date("2026-11-23T08:00:00Z"))).toBe(false);
  });

  it("hides when the live work is a different one", () => {
    expect(shouldShowFeatured(row, { id: "11111111-1111-4111-8111-111111111111" }, now)).toBe(false);
  });
});

describe("cleanFeaturedNote", () => {
  it("trims, flattens and caps", () => {
    expect(cleanFeaturedNote("  mocny\n\nrefren  ")).toBe("mocny refren");
    expect(cleanFeaturedNote("x".repeat(400))?.length).toBe(FEATURED_NOTE_MAX);
    expect(cleanFeaturedNote("   ")).toBeNull();
    expect(cleanFeaturedNote(42)).toBeNull();
  });
});
