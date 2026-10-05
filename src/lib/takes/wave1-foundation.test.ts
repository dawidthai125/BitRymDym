import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  ANON_TAKE_TTL_SECONDS,
  RECORDING_ANTI_ABUSE,
  RECORDING_GLOBAL_MAX_SECONDS,
  RECORDING_RETENTION_SECONDS,
  TAKE_AUDIO_BUCKET,
} from "@/config/recording";
import {
  buildAnonTakeObjectKey,
  buildUserTakeObjectKey,
  expectedUserTakeObjectKey,
  isTakeAudioBucket,
} from "@/lib/takes/object-key";
import { TAKE_RECORDING_MODES, TAKE_STATUSES } from "@/types/domain";

describe("Recording Wave 1 — take foundation (unit)", () => {
  it("uses take-audio bucket constant distinct from beat-audio", () => {
    expect(TAKE_AUDIO_BUCKET).toBe("take-audio");
    expect(isTakeAudioBucket("take-audio")).toBe(true);
    expect(isTakeAudioBucket("beat-audio")).toBe(false);
  });

  it("locks global max and Sample Policy defaults (P1 Premium Tier axis)", () => {
    expect(RECORDING_GLOBAL_MAX_SECONDS).toBe(180);
    // Deprecated Account Level aliases mirror FREE / SILVER / GOLD TTLs for legacy imports.
    expect(RECORDING_RETENTION_SECONDS.BEGINNER_RAPPER).toBe(12 * 60 * 60);
    expect(RECORDING_RETENTION_SECONDS.PRO_RAPPER).toBe(60 * 60 * 60);
    expect(RECORDING_RETENTION_SECONDS.LEGEND_RAPPER).toBe(84 * 60 * 60);
    expect(ANON_TAKE_TTL_SECONDS).toBe(2 * 60 * 60);
    expect(RECORDING_ANTI_ABUSE.BEGINNER_RAPPER.maxActiveReady).toBe(3);
    expect(RECORDING_ANTI_ABUSE.BEGINNER_RAPPER.maxSessionsPerUtcDay).toBe(3);
    expect(RECORDING_ANTI_ABUSE.LEGEND_RAPPER.maxSessionsPerUtcDay).toBe(10);
  });

  it("builds canonical user take object key", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const takeId = "22222222-2222-4222-8222-222222222222";
    expect(buildUserTakeObjectKey({ ownerId, takeId })).toBe(
      `user/${ownerId}/takes/${takeId}/mic.bin`,
    );
    expect(
      expectedUserTakeObjectKey({
        ownerId,
        takeId,
        objectKey: `user/${ownerId}/takes/${takeId}/mic.bin`,
      }),
    ).toBe(true);
    expect(
      expectedUserTakeObjectKey({
        ownerId,
        takeId,
        objectKey: `user/${ownerId}/takes/${takeId}/evil.bin`,
      }),
    ).toBe(false);
  });

  it("rejects spoofed / non-uuid path segments", () => {
    expect(() =>
      buildUserTakeObjectKey({
        ownerId: "../other",
        takeId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow(/uuid/i);
    expect(() =>
      buildAnonTakeObjectKey({
        tokenHashPrefix: "not-hex!",
        takeId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow(/hex/i);
  });

  it("builds anon take object key with hash prefix", () => {
    const takeId = "33333333-3333-4333-8333-333333333333";
    const prefix = "abcdef0123456789abcdef0123456789";
    expect(buildAnonTakeObjectKey({ tokenHashPrefix: prefix, takeId })).toBe(
      `anon/${prefix}/takes/${takeId}/mic.bin`,
    );
  });

  it("exposes take status / mode enums without RECORDING status", () => {
    expect(TAKE_STATUSES).toEqual([
      "PENDING_UPLOAD",
      "READY",
      "FAILED",
      "EXPIRED",
      "DELETED",
    ]);
    expect(TAKE_RECORDING_MODES).toEqual(["QUICK", "FULL"]);
    expect(TAKE_STATUSES).not.toContain("RECORDING");
  });

  it("migration file defines takes + take-audio + owner SELECT only", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260927180000_recording_wave1_take_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE public\.takes/);
    expect(sql).toMatch(/take-audio/);
    expect(sql).toMatch(/takes_select_own/);
    expect(sql).toMatch(/Only service_role may mutate takes/);
    expect(sql).not.toMatch(/CREATE TABLE public\.beat_audio_assets/);
    expect(sql).not.toMatch(/MediaRecorder/);
  });
});
