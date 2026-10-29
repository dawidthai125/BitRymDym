import { describe, expect, it } from "vitest";

import { decideDeliver, deliverOptions } from "./policy";

const d = (tier: Parameters<typeof decideDeliver>[0]["tier"], kind: string, format: string, approved = true) =>
  decideDeliver({ tier, kind, format, approved });

describe("Studio deliver policy", () => {
  it("guest gets nothing, approval is required", () => {
    expect(d(null, "master", "MP3_128")).toEqual({ allowed: false, reason: "login" });
    expect(d("GOLD", "master", "WAV_24", false)).toEqual({ allowed: false, reason: "not_approved" });
  });
  it("Free: MP3 128 only, 1 per week", () => {
    expect(d("FREE", "raw", "MP3_128")).toEqual({ allowed: true, weeklyLimit: 1 });
    expect(d("FREE", "master", "MP3_192")).toEqual({ allowed: false, reason: "tier_format" });
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
