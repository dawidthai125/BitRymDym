import { describe, expect, it } from "vitest";

import { takeTimeLeft } from "./time-left";

describe("takeTimeLeft", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  it("counts days and hours, rounded down", () => {
    expect(takeTimeLeft("2026-11-30T05:30:00Z", now)).toEqual({ days: 3, hours: 17 });
    expect(takeTimeLeft("2026-11-26T12:30:00Z", now)).toEqual({ days: 0, hours: 0 });
  });
  it("gives nothing for a passed or broken date", () => {
    expect(takeTimeLeft("2026-11-26T11:59:00Z", now)).toBeNull();
    expect(takeTimeLeft("x", now)).toBeNull();
  });
});
