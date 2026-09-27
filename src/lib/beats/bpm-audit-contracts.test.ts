import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createPlatformBeatAction } from "@/lib/beats/actions";
import { resolveCreateBpm } from "@/lib/beats/audio-bpm-rank";
import { validateBeatInput } from "@/lib/beats/validation";

const beatsDir = dirname(fileURLToPath(import.meta.url));

describe("legacy createPlatformBeatAction (audit contract)", () => {
  it("remains hard-disabled — FormData create cannot set beats.bpm", async () => {
    const form = new FormData();
    form.set("title", "Tamper");
    form.set("bpm", "140");
    form.set("durationSeconds", "90");

    const result = await createPlatformBeatAction(
      { error: null, success: false },
      form,
    );

    expect(result.success).toBe(false);
    expect(result.beatId).toBeUndefined();
    expect(result.error).toMatch(/audio-first/i);
  });
});

describe("ADMIN updateBeatMetadata BPM (audit contract — behavior unchanged)", () => {
  it("service path validates BPM via validateBeatInput only (no ensemble import)", () => {
    const src = readFileSync(join(beatsDir, "service.ts"), "utf8");
    expect(src).toContain("export async function updateBeatMetadata");
    expect(src).toContain("validateBeatInput");
    expect(src).toMatch(/bpm:\s*patch\.bpm\s*\?\?\s*current\.bpm/);
    expect(src).not.toMatch(/analyzeBeatBpm|bpm-ensemble|resolveCreateBpm|resolveEnsembleSuggestion/);
  });

  it("documents: integer BPM 1–300 is accepted for metadata write (no re-probe required by validation)", () => {
    const base = {
      ownershipType: "PLATFORM" as const,
      ownerId: null,
      title: "Existing Beat",
      durationSeconds: 120,
      status: "DRAFT" as const,
    };
    expect(validateBeatInput({ ...base, bpm: 87 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, bpm: 1 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, bpm: 300 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, bpm: 0 }).ok).toBe(false);
    expect(validateBeatInput({ ...base, bpm: 301 }).ok).toBe(false);
  });
});

describe("BPM boundary rejects NaN / Infinity / non-integer (cannot persist)", () => {
  const base = {
    ownershipType: "PLATFORM" as const,
    ownerId: null,
    title: "Boundary",
    durationSeconds: 60,
  };

  it("validateBeatInput rejects NaN, ±Infinity, decimals", () => {
    expect(validateBeatInput({ ...base, bpm: Number.NaN }).ok).toBe(false);
    expect(validateBeatInput({ ...base, bpm: Number.POSITIVE_INFINITY }).ok).toBe(
      false,
    );
    expect(validateBeatInput({ ...base, bpm: Number.NEGATIVE_INFINITY }).ok).toBe(
      false,
    );
    expect(validateBeatInput({ ...base, bpm: 140.5 }).ok).toBe(false);
  });

  it("resolveCreateBpm rejects NaN, ±Infinity, decimals even with override", () => {
    for (const clientBpm of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      120.5,
    ]) {
      expect(
        resolveCreateBpm({
          clientBpm,
          bpmManualOverride: true,
          suggestedBpm: null,
          decodeAvailable: false,
        }).ok,
      ).toBe(false);
    }
  });
});
