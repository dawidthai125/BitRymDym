import { describe, expect, it } from "vitest";

import { decideDeliver, deliverOptions } from "./policy";

const d = (tier: Parameters<typeof decideDeliver>[0]["tier"], kind: string, format: string, approved = true) =>
  decideDeliver({ tier, kind, format, approved });

describe("Studio deliver policy", () => {
  it("guest gets nothing, approval is required", () => {
    expect(d(null, "master", "MP3_128")).toEqual({ allowed: false, reason: "login" });
    expect(d("GOLD", "master", "WAV_24", false)).toEqual({ allowed: false, reason: "not_approved" });
  });
  it("Free: no downloads at all (Owner 2026-10-29) — every format denied as tier_format", () => {
    for (const kind of ["mix", "master", "raw"] as const) {
      for (const format of ["MP3_128", "MP3_192", "MP3_320", "WAV_24"] as const) {
        expect(d("FREE", kind, format)).toEqual({ allowed: false, reason: "tier_format" });
      }
    }
    expect(d("FREE", "project", "ZIP")).toEqual({ allowed: false, reason: "tier_project" });
  });
  it("tier ladder", () => {
    expect(d("BRONZE", "mix", "MP3_128")).toEqual({ allowed: true, weeklyLimit: null });
    expect(d("BRONZE", "mix", "MP3_192").allowed).toBe(false);
    expect(d("SILVER", "mix", "MP3_192").allowed).toBe(true);
    expect(d("SILVER", "mix", "MP3_320").allowed).toBe(false);
    expect(d("GOLD", "master", "MP3_320").allowed).toBe(true);
    expect(d("GOLD", "master", "WAV_24").allowed).toBe(true);
  });
  it("project zip: visible for all, enabled only for Gold", () => {
    expect(d("SILVER", "project", "ZIP")).toEqual({ allowed: false, reason: "tier_project" });
    expect(d("GOLD", "project", "ZIP").allowed).toBe(true);
    expect(d("GOLD", "project", "WAV_24")).toEqual({ allowed: false, reason: "bad_request" });
    expect(d("GOLD", "master", "ZIP")).toEqual({ allowed: false, reason: "bad_request" });
    expect(deliverOptions("FREE").find((o) => o.kind === "project")).toEqual({ kind: "project", format: "ZIP", enabled: false });
    expect(deliverOptions(null).every((o) => !o.enabled)).toBe(true);
  });
});
