import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { decideDeliver, deliverOptions, FREE_WATERMARK_PER_DAY, FREE_WATERMARK_WEEK_BACKSTOP, freeWatermarkDownloadEnabled } from "./policy";

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
    expect(d("BRONZE", "project", "ZIP")).toEqual({ allowed: false, reason: "tier_project" });
    expect(d("SILVER", "project", "ZIP").allowed).toBe(true);
    expect(d("GOLD", "project", "ZIP").allowed).toBe(true);
    expect(d("GOLD", "project", "WAV_24")).toEqual({ allowed: false, reason: "bad_request" });
    expect(d("GOLD", "master", "ZIP")).toEqual({ allowed: false, reason: "bad_request" });
    expect(deliverOptions("FREE").find((o) => o.kind === "project")).toEqual({ kind: "project", format: "ZIP", enabled: false });
    expect(deliverOptions(null).every((o) => !o.enabled)).toBe(true);
  });
});

describe("Free watermark download (Owner 2026-11-12)", () => {
  const w = (kind: string, format: string, freeWatermark: boolean) =>
    decideDeliver({ tier: "FREE", kind, format, approved: true, freeWatermark });

  it("is off by default: Free stays locked until the worker is updated", () => {
    expect(freeWatermarkDownloadEnabled({})).toBe(false);
    expect(d("FREE", "master", "MP3_128")).toEqual({ allowed: false, reason: "tier_format" });
    expect(freeWatermarkDownloadEnabled({ STUDIO_FREE_WATERMARK_DOWNLOAD: "1" })).toBe(true);
  });
  it("with the switch on: only MP3_128 of a mix or master, marked watermark", () => {
    expect(w("master", "MP3_128", true)).toMatchObject({ allowed: true, watermark: true });
    expect(w("mix", "MP3_128", true)).toMatchObject({ allowed: true, watermark: true });
    for (const [kind, format] of [["raw", "MP3_128"], ["master", "MP3_192"], ["master", "WAV_24"], ["mix", "MP3_320"]] as const) {
      expect(w(kind, format, true)).toEqual({ allowed: false, reason: "tier_format" });
    }
    expect(w("project", "ZIP", true)).toEqual({ allowed: false, reason: "tier_project" });
  });
  it("still needs an approved master", () => {
    expect(decideDeliver({ tier: "FREE", kind: "master", format: "MP3_128", approved: false, freeWatermark: true })).toEqual({ allowed: false, reason: "not_approved" });
  });
  it("paid plans are not marked as watermarked", () => {
    expect(decideDeliver({ tier: "BRONZE", kind: "master", format: "MP3_128", approved: true, freeWatermark: true })).toEqual({ allowed: true, weeklyLimit: null });
  });
  it("limits: 3 per 24 h, 7-day backstop 21", () => {
    expect(FREE_WATERMARK_PER_DAY).toBe(3);
    expect(FREE_WATERMARK_WEEK_BACKSTOP).toBe(21);
  });
  it("worker and server wiring fail closed", () => {
    const worker = readFileSync("src/lib/studio/master/worker.ts", "utf8");
    expect(worker).toContain("settings?.watermark === 1");
    expect(worker).toContain("watermark_format");
    const server = readFileSync("src/lib/studio/master/server.ts", "utf8");
    expect(server).toContain("settings: { watermark: 1 }");
    expect(server).toContain('error: "daily_limit"');
  });
});
