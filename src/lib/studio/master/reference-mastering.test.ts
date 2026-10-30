import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { masterStylesForTier, referenceMasteringGate } from "@/config/plan-policy";
import pl from "../../../../messages/pl.json";
import en from "../../../../messages/en.json";

import { planStudioMasterJob } from "./job-plan";
import { studioJobProgress } from "./progress";
import { explainReferenceMatch, referenceFormatOf, referenceObjectKey, validateReferenceUpload, type ReferenceMatchReport } from "./reference";
import { applyMasterStyle, DEFAULT_MASTER_SETTINGS, MASTER_STYLE_IDS, MASTER_STYLE_OFFSETS } from "./targets";

const O = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("reference mastering gate (plan-policy)", () => {
  it("Gold included, Silver only with the add-on, Free/Bronze locked with Silver as the lowest plan", () => {
    expect(referenceMasteringGate("GOLD", false)).toEqual({ allowed: true, via: "plan" });
    expect(referenceMasteringGate("SILVER", true)).toEqual({ allowed: true, via: "addon" });
    expect(referenceMasteringGate("SILVER", false)).toEqual({ allowed: false, reason: "addon_missing", minTier: "SILVER" });
    for (const t of ["FREE", "BRONZE"] as const) {
      expect(referenceMasteringGate(t, true)).toEqual({ allowed: false, reason: "plan", minTier: "SILVER" });
    }
  });
  it("styles are for every plan that can master", () => {
    expect((["FREE", "BRONZE", "SILVER", "GOLD"] as const).every(masterStylesForTier)).toBe(true);
  });
});

describe("mastering styles", () => {
  it("intensity scales the offsets, 0 % = no change, result clamped to ±3", () => {
    const s = DEFAULT_MASTER_SETTINGS;
    expect(applyMasterStyle(s, "warm", 0)).toEqual(s);
    expect(applyMasterStyle(s, "warm", 100)).toMatchObject({ bass: 1.5, bright: -1.5, squash: 0.5 });
    expect(applyMasterStyle(s, "warm", 50)).toMatchObject({ bass: 0.75, bright: -0.75 });
    expect(applyMasterStyle({ ...s, loudness: 2.5 }, "loud", 100).loudness).toBe(3);
    expect(applyMasterStyle(s, null, 100)).toEqual(s);
  });
  it("each style has a distinct direction", () => {
    expect(MASTER_STYLE_IDS).toEqual(["warm", "bright", "loud", "dynamic"]);
    expect(MASTER_STYLE_OFFSETS.loud.loudness).toBeGreaterThan(0);
    expect(MASTER_STYLE_OFFSETS.dynamic.loudness).toBeLessThan(0);
    expect(MASTER_STYLE_OFFSETS.bright.bright).toBeGreaterThan(0);
    expect(MASTER_STYLE_OFFSETS.warm.bass).toBeGreaterThan(0);
  });
  it("job plan sends the effective settings and the reference to master.py", () => {
    const [step] = planStudioMasterJob({ kind: "master", target: "streaming", settings: { bass: 1 }, output_format: "WAV_FLOAT", style: "warm", style_intensity: 100, reference_id: R, reference_intensity: 70 });
    expect(step).toEqual({ op: "python_master", target: "streaming", settings: { loudness: 0, bright: -1.5, bass: 2.5, width: 0, squash: 0.5 }, reference: { id: R, intensity: 70 } });
    const [plain] = planStudioMasterJob({ kind: "master", target: "club", settings: { bass: 1 }, output_format: "WAV_FLOAT" });
    expect(plain).toEqual({ op: "python_master", target: "club", settings: { bass: 1 }, reference: null });
    const [bad] = planStudioMasterJob({ kind: "master", target: "club", settings: {}, output_format: "WAV_FLOAT", style: "evil", reference_id: "../x" });
    expect(bad).toMatchObject({ settings: {}, reference: null });
  });
});

describe("reference upload", () => {
  it("MP3/WAV only, ≤200 MB, ≤10 min, parts of 40 MiB", () => {
    expect(referenceFormatOf("a.MP3")).toBe("mp3");
    expect(referenceFormatOf("a.wave")).toBe("wav");
    expect(referenceFormatOf("a.flac", "audio/flac")).toBeNull();
    expect(validateReferenceUpload({ fileName: "a.flac", byteSize: 1, durationMs: 5000 })).toEqual({ ok: false, error: "bad_format" });
    expect(validateReferenceUpload({ fileName: "a.wav", byteSize: 201 * 1024 * 1024, durationMs: 5000 })).toEqual({ ok: false, error: "too_big" });
    expect(validateReferenceUpload({ fileName: "a.wav", byteSize: 1000, durationMs: 600_001 })).toEqual({ ok: false, error: "too_long" });
    expect(validateReferenceUpload({ fileName: "a.wav", byteSize: 1000, durationMs: 500 })).toEqual({ ok: false, error: "too_short" });
    const ok = validateReferenceUpload({ fileName: "  Ref.wav", mime: "audio/wav", byteSize: 106 * 1024 * 1024, durationMs: 600_000 });
    expect(ok).toEqual({ ok: true, value: { fileName: "Ref.wav", format: "wav", byteSize: 106 * 1024 * 1024, durationMs: 600_000, parts: 3 } });
  });
  it("storage key carries only uuids and matches the DB check", () => {
    expect(referenceObjectKey(O, P, R, "mp3")).toBe(`studio-reference/${O}/${P}/${R}/ref.mp3`);
    expect(() => referenceObjectKey("x", P, R, "mp3")).toThrow("bad_id");
    const mig = read("supabase/migrations/20261030090000_studio_reference_mastering.sql");
    expect(mig).toContain("studio-reference/");
    expect(mig).toMatch(/ref\\\.\(mp3\|wav\)/);
  });
});

describe("BITEK explains the match in first person", () => {
  const report: ReferenceMatchReport = {
    intensity: 70,
    reference: { lufs: -8.4, sideToMid: 0.3, durationS: 210 },
    eqDb: { sub: 0.2, bass: -1.2, lowmid: 0.1, mid: 0.4, high: 2.6, air: 3.1 },
    loudness: { goalLufs: -9.9, fromTargetLufs: -14 },
    width: { factor: 1.18, mixSideToMid: 0.2, refSideToMid: 0.3 },
  };
  it("biggest EQ moves first, then loudness, width, strength", () => {
    expect(explainReferenceMatch(report)).toEqual([
      { key: "eqBoost", band: "air", db: 3.1 },
      { key: "eqBoost", band: "high", db: 2.6 },
      { key: "eqCut", band: "bass", db: 1.2 },
      { key: "louder", lufs: -9.9, refLufs: -8.4 },
      { key: "wider", pct: 18 },
      { key: "intensity", pct: 70 },
    ]);
    expect(explainReferenceMatch({ ...report, eqDb: { sub: 0, bass: 0, lowmid: 0, mid: 0, high: 0.2, air: 0 }, width: { ...report.width, factor: 1 }, loudness: { goalLufs: -14, fromTargetLufs: -14 } }).map((l) => l.key))
      .toEqual(["eqFlat", "sameLoudness", "sameWidth", "intensity"]);
  });
  it("every line has a PL and EN message, written in first person in PL", () => {
    const keys = ["gotowe", "eqBoost", "eqCut", "eqFlat", "louder", "quieter", "sameLoudness", "wider", "narrower", "sameWidth", "intensity"];
    const plB = pl.studio.masterStep.referencja.bitek as Record<string, string>;
    const enB = en.studio.masterStep.referencja.bitek as Record<string, string>;
    for (const k of keys) {
      expect(plB[k], k).toBeTruthy();
      expect(enB[k], k).toBeTruthy();
    }
    expect(plB.gotowe).toMatch(/Dopasowałem/);
    expect(plB.eqBoost).toMatch(/Podbiłem/);
    expect(pl.studio.masterStep.referencja.prywatnosc).toMatch(/24 h/);
  });
});

describe("progress + migration contract", () => {
  it("reference stage sits between render and master", () => {
    const a = studioJobProgress("master", false, "render", 1, true);
    const b = studioJobProgress("master", false, "reference", 0.5, true);
    const c = studioJobProgress("master", false, "master", 0, true);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
  it("migration: add-on entitlements, private reference table, claim validates the reference, service_role only", () => {
    const sql = read("supabase/migrations/20261030090000_studio_reference_mastering.sql").replace(/^--.*$/gm, "");
    expect(sql).toMatch(/create table if not exists public\.plan_addon_entitlements/);
    expect(sql).toMatch(/create table if not exists public\.studio_master_references/);
    expect(sql).toMatch(/duration_ms[^,]*600000/);
    expect(sql).toMatch(/expires_at timestamptz not null default \(?now\(\) \+ interval '24 hours'\)?/);
    expect(sql).toContain("MASTER_REFERENCE_INVALID");
    expect(sql).toMatch(/r\.status = 'ready' and r\.expires_at > now\(\)/);
    expect(sql).toMatch(/grant execute on function public\.claim_studio_master_job\([^)]*\) to service_role/);
    // Clients may only SELECT their own rows (RLS); writes + RPCs are service_role only.
    expect(sql).not.toMatch(/grant (insert|update|delete|all|execute)[^;]* to [^;]*(anon|authenticated)/i);
    expect(sql).toMatch(/for select to authenticated using \(owner_id = auth\.uid\(\)\)/);
  });
  it("account deletion purges studio-reference/<uid>/", () => {
    const del = read("src/lib/auth/delete-account.ts");
    expect(del).toContain("`studio-reference/${userId}/`");
    expect(del).toContain("STUDIO_REFERENCE_PREFIX(userId)");
  });
});
