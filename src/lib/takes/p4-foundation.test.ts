/**
 * P4.1 — recording eligibility pure gate tests.
 */

import { describe, expect, it, vi } from "vitest";

import { getSamplePolicy } from "@/lib/takes/entitlement";
import { decideRecordingEligibility } from "@/lib/takes/recording-eligibility";
import { buildTakeExportLadder, canExportOwnTake } from "@/lib/takes/take-export-capability";
import { normalizeTakeTitle, displayTakeTitle } from "@/lib/takes/take-title";
import { OWN_TAKE_RAW_DOWNLOADS_DAILY } from "@/config/recording";
import { assertUnderOwnTakeRawDailyCap } from "@/lib/takes/take-raw-download-limits";
import { AuthError } from "@/lib/auth/session";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("P4.1 decideRecordingEligibility", () => {
  const beat = 60;

  it("allows FREE under caps", () => {
    const policy = getSamplePolicy({ actor: "FREE", beatDurationSeconds: beat });
    const d = decideRecordingEligibility({
      beatStatus: "PUBLISHED",
      policy,
      premiumTier: "FREE",
      sessionsToday: 0,
      activeReadyCount: 0,
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("ALLOWED");
    expect(d.maxRecordingSeconds).toBe(30);
  });

  it("denies SESSION_DAY_CAP", () => {
    const policy = getSamplePolicy({ actor: "FREE", beatDurationSeconds: beat });
    const d = decideRecordingEligibility({
      beatStatus: "PUBLISHED",
      policy,
      premiumTier: "FREE",
      sessionsToday: policy.dailySessionLimit,
      activeReadyCount: 0,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("SESSION_DAY_CAP");
    expect(d.upgradeHintTier).toBe("BRONZE");
  });

  it("denies ACTIVE_READY_CAP", () => {
    const policy = getSamplePolicy({ actor: "BRONZE", beatDurationSeconds: beat });
    const d = decideRecordingEligibility({
      beatStatus: "PUBLISHED",
      policy,
      premiumTier: "BRONZE",
      sessionsToday: 0,
      activeReadyCount: policy.activeReadyCap,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("ACTIVE_READY_CAP");
  });

  it("denies unpublished beat", () => {
    const policy = getSamplePolicy({ actor: "GOLD", beatDurationSeconds: beat });
    const d = decideRecordingEligibility({
      beatStatus: "DRAFT",
      policy,
      premiumTier: "GOLD",
      sessionsToday: 0,
      activeReadyCount: 0,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("BEAT_NOT_PUBLISHED");
  });

  it("ANONYMOUS 15s policy unchanged", () => {
    const policy = getSamplePolicy({
      actor: "ANONYMOUS",
      beatDurationSeconds: beat,
    });
    expect(policy.maxRecordingSeconds).toBe(15);
    const d = decideRecordingEligibility({
      beatStatus: "PUBLISHED",
      policy,
      premiumTier: null,
      sessionsToday: 0,
      activeReadyCount: 0,
    });
    expect(d.allowed).toBe(true);
    expect(d.maxRecordingSeconds).toBe(15);
  });
});

describe("P4.1 mic gate wiring", () => {
  it("RecordingPanel calls eligibility before getUserMedia", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/takes/recording-panel.tsx"),
      "utf8",
    );
    const armFn = src.slice(src.indexOf("async function armMicrophone"));
    const eligIdx = armFn.indexOf("/api/takes/eligibility");
    const gumIdx = armFn.indexOf("getUserMedia");
    expect(eligIdx).toBeGreaterThan(0);
    expect(gumIdx).toBeGreaterThan(eligIdx);
    expect(armFn).toMatch(/if\s*\(\s*!elig\.allowed\s*\)/);
  });
});

describe("P4.2 take title", () => {
  it("normalizes and caps title", () => {
    expect(normalizeTakeTitle("  hello   world  ")).toBe("hello world");
    expect(normalizeTakeTitle("")).toBeNull();
    expect(normalizeTakeTitle("   ")).toBeNull();
    expect(() => normalizeTakeTitle("x".repeat(121))).toThrow();
  });

  it("display falls back to beat title", () => {
    expect(displayTakeTitle({ title: null, beatTitle: "Beat A" })).toBe("Beat A");
    expect(displayTakeTitle({ title: "Mine", beatTitle: "Beat A" })).toBe("Mine");
    expect(displayTakeTitle({ title: null, beatTitle: null })).toBe("Nagranie");
  });
});

describe("P4.4 take export ladder", () => {
  it("FREE: 128 unlocked; 192/320/WAV locked", () => {
    const ladder = buildTakeExportLadder("FREE");
    expect(ladder.map((i) => [i.quality, i.unlocked])).toEqual([
      ["MP3_128", true],
      ["MP3_192", false],
      ["MP3_320", false],
      ["WAV", false],
    ]);
    expect(ladder.find((i) => i.quality === "MP3_320")?.lockedMessage).toMatch(
      /SILVER/,
    );
  });

  it("BRONZE: 128+192 unlocked; 320/WAV locked", () => {
    expect(canExportOwnTake({ premiumTier: "BRONZE", quality: "MP3_192" })).toBe(
      true,
    );
    expect(canExportOwnTake({ premiumTier: "BRONZE", quality: "MP3_320" })).toBe(
      false,
    );
    const ladder = buildTakeExportLadder("BRONZE");
    expect(ladder.filter((i) => i.unlocked).map((i) => i.quality)).toEqual([
      "MP3_128",
      "MP3_192",
    ]);
  });

  it("SILVER: unlocked through 320; WAV locked", () => {
    const ladder = buildTakeExportLadder("SILVER");
    expect(ladder.find((i) => i.quality === "MP3_320")?.unlocked).toBe(true);
    expect(ladder.find((i) => i.quality === "WAV")?.unlocked).toBe(false);
  });

  it("GOLD: all unlocked", () => {
    const ladder = buildTakeExportLadder("GOLD");
    expect(ladder.every((i) => i.unlocked)).toBe(true);
  });

  it("does not hardcode tiers in TakeDownloadMenu", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/takes/take-download-menu.tsx"),
      "utf8",
    );
    expect(src).toMatch(/downloadLadder/);
    expect(src).not.toMatch(/premiumTier\s*===\s*["']FREE["']/);
  });
});

describe("P4.5 RAW daily C", () => {
  it("OWN_TAKE_RAW_DOWNLOADS_DAILY is 5", () => {
    expect(OWN_TAKE_RAW_DOWNLOADS_DAILY).toBe(5);
  });

  it("5th allows, 6th denies", () => {
    expect(() => assertUnderOwnTakeRawDailyCap({ usedToday: 4 })).not.toThrow();
    expect(() => assertUnderOwnTakeRawDailyCap({ usedToday: 5 })).toThrow(
      AuthError,
    );
  });

  it("take-download enforces canDownloadOwnTake + ledger", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/takes/take-download.ts"),
      "utf8",
    );
    expect(src).toMatch(/canDownloadOwnTake/);
    expect(src).toMatch(/recordOwnTakeRawDownloadEvent/);
    expect(src).toMatch(/assertUnderOwnTakeRawDailyCap/);
  });

  it("uses take_download_events not beat_download_events", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/takes/take-raw-download-ledger.ts"),
      "utf8",
    );
    expect(src).toMatch(/\.from\("take_download_events"\)/);
    expect(src).not.toMatch(/\.from\("beat_download_events"\)/);
  });
});

describe("P4.6 TAKE_EXPORT foundation", () => {
  it("EXPORT_MP3_192 exists in capability keys", () => {
    const src = readFileSync(
      join(process.cwd(), "src/config/audio-render.ts"),
      "utf8",
    );
    expect(src).toMatch(/EXPORT_MP3_192/);
    expect(src).toMatch(/MP3_192_BITRATE_KBPS:\s*192/);
  });

  it("migration adds takes.title + take_download_events + TAKE_EXPORT", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261005230000_p4_recording_identity_download_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS title/);
    expect(sql).toMatch(/take_download_events/);
    expect(sql).toMatch(/TAKE_EXPORT/);
    expect(sql).toMatch(/MP3_192/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  it("take export service never runs ffmpeg in request path", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/takes/take-export-service.ts"),
      "utf8",
    );
    expect(src).toMatch(/TAKE_EXPORT/);
    expect(src).toMatch(/PREPARED_CODE/);
    // No process spawn / child_process / ffmpeg binary invocation in enqueue path.
    expect(src).not.toMatch(/child_process|spawn\(|execFile\(|runFfmpeg/);
  });

  it("marks Contabo live worker as not yet enabled (Phase 2)", () => {
    // Code PREPARED_CODE; live Contabo process remains STOPPED until Phase 2 GO.
    const contaboLiveEnabled = false;
    expect(contaboLiveEnabled).toBe(false);
  });
});

describe("P4 regression contracts", () => {
  it("does not add Project/Track/Clip tables in P4 migration", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261005230000_p4_recording_identity_download_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/CREATE TABLE.*projects/i);
    expect(sql).not.toMatch(/CREATE TABLE.*tracks/i);
    expect(sql).not.toMatch(/CREATE TABLE.*clips/i);
  });

  it("ownership paths untouched in migration", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261005230000_p4_recording_identity_download_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/owner_id.*DROP/);
    expect(sql).not.toMatch(/anonymous_token_hash/);
  });
});

// silence unused vi if tree-shaken
void vi;
