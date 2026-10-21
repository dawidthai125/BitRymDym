/**
 * PREMIUM-08 — Local acceptance matrix (pure / unit).
 * Live DB / worker / Contabo: NOT RUN — SAFETY (Docker offline).
 */

import { describe, expect, it } from "vitest";

import {
  PREMIUM_DOWNLOAD_BY_TIER,
  PREMIUM_UNLOCK_CREDITS_PER_PERIOD,
  buildPremiumDownloadLadder,
  canDownloadPremiumQuality,
  creditPeriodBounds,
} from "@/config/premium-export-policy";
import { evaluatePremiumDownloadGate } from "@/lib/premium/premium-download-authz";
import {
  createEmptyUnlockStore,
  pureMarkWorkReady,
  pureUnlockWork,
} from "@/lib/premium/premium-unlock-pure";
import { SFM_PLAN_MATRIX } from "@/lib/sfm/sfm-plan-matrix";
import { canExportOwnTake } from "@/lib/takes/take-export-capability";

describe("PREMIUM-08 acceptance (local pure)", () => {
  it("1–6: FREE listen-only download deny; tier qualities + credits", () => {
    expect(PREMIUM_DOWNLOAD_BY_TIER.FREE).toEqual([]);
    expect(canExportOwnTake({ premiumTier: "FREE", quality: "MP3_128" })).toBe(
      false,
    );
    expect(PREMIUM_UNLOCK_CREDITS_PER_PERIOD).toEqual({
      FREE: 0,
      BRONZE: 1,
      SILVER: 2,
      GOLD: 4,
    });
    expect(PREMIUM_DOWNLOAD_BY_TIER.BRONZE).toEqual(["MP3_128"]);
    expect(PREMIUM_DOWNLOAD_BY_TIER.SILVER).toEqual([
      "MP3_128",
      "MP3_192",
      "MP3_256",
    ]);
    expect(PREMIUM_DOWNLOAD_BY_TIER.GOLD).toContain("WAV_MASTER");
  });

  it("7: credit period 7d from activation", () => {
    const a = Date.parse("2026-01-01T12:00:00.000Z");
    const b = creditPeriodBounds({
      activatedAtMs: a,
      nowMs: a + 6.9 * 24 * 60 * 60 * 1000,
    });
    expect(b.periodIndex).toBe(0);
  });

  it("8–12: one unlock RAW/MIX/MASTER; retry idempotent; KEY_REUSE", () => {
    const store = createEmptyUnlockStore();
    const t0 = Date.now();
    pureMarkWorkReady({
      store,
      userId: "u",
      workId: "w",
      premiumTier: "GOLD",
      nowMs: t0,
    });
    const u1 = pureUnlockWork({
      store,
      userId: "u",
      workId: "w",
      idempotencyKey: "k1",
      premiumTier: "GOLD",
      activatedAtMs: t0,
      nowMs: t0 + 1,
    });
    expect(u1.ok && !u1.reused).toBe(true);
    const u2 = pureUnlockWork({
      store,
      userId: "u",
      workId: "w",
      idempotencyKey: "k1",
      premiumTier: "GOLD",
      activatedAtMs: t0,
      nowMs: t0 + 2,
    });
    expect(u2.ok && u2.reused).toBe(true);
    expect(store.periods[0]?.consumed).toBe(1);

    pureMarkWorkReady({
      store,
      userId: "u",
      workId: "w2",
      premiumTier: "GOLD",
      nowMs: t0,
    });
    expect(
      pureUnlockWork({
        store,
        userId: "u",
        workId: "w2",
        idempotencyKey: "k1",
        premiumTier: "GOLD",
        activatedAtMs: t0,
        nowMs: t0 + 3,
      }),
    ).toEqual({ ok: false, reason: "KEY_REUSE" });
  });

  it("13–17: R1 ready once; expired cannot unlock", () => {
    const store = createEmptyUnlockStore();
    const t0 = 1000;
    const a = pureMarkWorkReady({
      store,
      userId: "u",
      workId: "w",
      premiumTier: "BRONZE",
      nowMs: t0,
    });
    const b = pureMarkWorkReady({
      store,
      userId: "u",
      workId: "w",
      premiumTier: "BRONZE",
      nowMs: t0 + 999,
    });
    expect(b.created).toBe(false);
    expect(b.retentionExpiresAtMs).toBe(a.retentionExpiresAtMs);
    store.works.get("w")!.retentionExpiresAtMs = t0;
    expect(
      pureUnlockWork({
        store,
        userId: "u",
        workId: "w",
        idempotencyKey: "x",
        premiumTier: "BRONZE",
        activatedAtMs: t0,
        nowMs: t0 + 1,
      }).ok,
    ).toBe(false);
  });

  it("19–20: quality live at mint; FREE ladder locked", () => {
    expect(
      evaluatePremiumDownloadGate({
        premiumTier: "BRONZE",
        quality: "MP3_320",
        hasUnlock: true,
        retentionExpiresAtMs: 9e15,
        nowMs: 1,
        workStatus: "WORK_READY",
      }).ok,
    ).toBe(false);
    expect(buildPremiumDownloadLadder("FREE").every((r) => !r.unlocked)).toBe(
      true,
    );
    expect(
      canDownloadPremiumQuality({ premiumTier: "GOLD", quality: "WAV_PRO" }),
    ).toBe(true);
  });

  it("24: SFM remains separate", () => {
    expect(SFM_PLAN_MATRIX.SILVER.qualities).not.toContain("MP3_256");
    expect(SFM_PLAN_MATRIX.GOLD.firstDownloadsPerDay).toBe(5);
  });
});
