import { describe, expect, it } from "vitest";

import { validateSiteMaintenanceInput } from "@/lib/site/maintenance-settings";

describe("validateSiteMaintenanceInput", () => {
  it("normalises blank message/until to null and ISO-normalises the end time", () => {
    expect(validateSiteMaintenanceInput({ enabled: true, message: "   ", until: "" })).toEqual({
      ok: true,
      value: { enabled: true, message: null, until: null },
    });
    expect(
      validateSiteMaintenanceInput({ enabled: false, message: " Wracamy ", until: "2026-10-30T17:00:00Z" }),
    ).toEqual({ ok: true, value: { enabled: false, message: "Wracamy", until: "2026-10-30T17:00:00.000Z" } });
  });

  it("rejects an over-long message and an invalid date", () => {
    expect(validateSiteMaintenanceInput({ enabled: true, message: "x".repeat(501), until: null }).ok).toBe(false);
    expect(validateSiteMaintenanceInput({ enabled: true, message: null, until: "jutro" })).toEqual({
      ok: false,
      error: "Nieprawidłowa data zakończenia prac.",
    });
  });
});
