import { describe, expect, it } from "vitest";

import {
  RECORDING_GLOBAL_MAX_SECONDS,
  SAMPLE_POLICY_DEFAULTS,
} from "@/config/recording";
import {
  assertRequestedDurationAllowed,
  getSamplePolicy,
  sampleActorFromPremiumTier,
  validateAdminRecordingDurationSeconds,
} from "@/lib/takes/entitlement";

const BEAT = 300;

describe("P1 Sample Policy matrix — getSamplePolicy", () => {
  it("ANONYMOUS: 15s / 2h / 1 / 3 / false", () => {
    const p = getSamplePolicy({ actor: "ANONYMOUS", beatDurationSeconds: BEAT });
    expect(p.maxRecordingSeconds).toBe(15);
    expect(p.ttlSeconds).toBe(2 * 60 * 60);
    expect(p.activeReadyCap).toBe(1);
    expect(p.dailySessionLimit).toBe(3);
    expect(p.canDownloadOwnTake).toBe(false);
  });

  it("FREE: 30s / 12h / 3 / 3 / false", () => {
    const p = getSamplePolicy({ actor: "FREE", beatDurationSeconds: BEAT });
    expect(p.maxRecordingSeconds).toBe(30);
    expect(p.ttlSeconds).toBe(12 * 60 * 60);
    expect(p.activeReadyCap).toBe(3);
    expect(p.dailySessionLimit).toBe(3);
    expect(p.canDownloadOwnTake).toBe(false);
  });

  it("BRONZE: 60s / 36h / 5 / 5 / false", () => {
    const p = getSamplePolicy({ actor: "BRONZE", beatDurationSeconds: BEAT });
    expect(p.maxRecordingSeconds).toBe(60);
    expect(p.ttlSeconds).toBe(36 * 60 * 60);
    expect(p.activeReadyCap).toBe(5);
    expect(p.dailySessionLimit).toBe(5);
    expect(p.canDownloadOwnTake).toBe(false);
  });

  it("SILVER: 120s / 60h / 7 / 7 / false", () => {
    const p = getSamplePolicy({ actor: "SILVER", beatDurationSeconds: BEAT });
    expect(p.maxRecordingSeconds).toBe(120);
    expect(p.ttlSeconds).toBe(60 * 60 * 60);
    expect(p.activeReadyCap).toBe(7);
    expect(p.dailySessionLimit).toBe(7);
    expect(p.canDownloadOwnTake).toBe(false);
  });

  it("GOLD: 180s / 84h / 10 / 10 / true", () => {
    const p = getSamplePolicy({ actor: "GOLD", beatDurationSeconds: BEAT });
    expect(p.maxRecordingSeconds).toBe(180);
    expect(p.ttlSeconds).toBe(84 * 60 * 60);
    expect(p.activeReadyCap).toBe(10);
    expect(p.dailySessionLimit).toBe(10);
    expect(p.canDownloadOwnTake).toBe(true);
  });

  it("caps by shorter beat duration", () => {
    expect(
      getSamplePolicy({ actor: "GOLD", beatDurationSeconds: 45 })
        .maxRecordingSeconds,
    ).toBe(45);
    expect(
      getSamplePolicy({ actor: "ANONYMOUS", beatDurationSeconds: 10 })
        .maxRecordingSeconds,
    ).toBe(10);
  });

  it("never exceeds global technical max 180", () => {
    expect(RECORDING_GLOBAL_MAX_SECONDS).toBe(180);
    const p = getSamplePolicy({
      actor: "GOLD",
      beatDurationSeconds: 999,
      overrides: { goldMaxRecordingSeconds: 180 },
    });
    expect(p.maxRecordingSeconds).toBe(180);
  });
});

describe("P1 Admin duration overrides", () => {
  it("Bronze 60 → 90 PASS", () => {
    expect(validateAdminRecordingDurationSeconds(90)).toBeNull();
    expect(
      getSamplePolicy({
        actor: "BRONZE",
        beatDurationSeconds: BEAT,
        overrides: { bronzeMaxRecordingSeconds: 90 },
      }).maxRecordingSeconds,
    ).toBe(90);
  });

  it("Silver 120 → 150 PASS", () => {
    expect(
      getSamplePolicy({
        actor: "SILVER",
        beatDurationSeconds: BEAT,
        overrides: { silverMaxRecordingSeconds: 150 },
      }).maxRecordingSeconds,
    ).toBe(150);
  });

  it("Gold 180 → 120 PASS", () => {
    expect(
      getSamplePolicy({
        actor: "GOLD",
        beatDurationSeconds: BEAT,
        overrides: { goldMaxRecordingSeconds: 120 },
      }).maxRecordingSeconds,
    ).toBe(120);
  });

  it("Bronze 181 DENY", () => {
    expect(validateAdminRecordingDurationSeconds(181)).not.toBeNull();
  });

  it("Silver 0 DENY", () => {
    expect(validateAdminRecordingDurationSeconds(0)).not.toBeNull();
  });

  it("Gold -1 DENY", () => {
    expect(validateAdminRecordingDurationSeconds(-1)).not.toBeNull();
  });

  it("Gold 181 DENY", () => {
    expect(validateAdminRecordingDurationSeconds(181)).not.toBeNull();
  });

  it("invalid Admin override is ignored (falls back to default)", () => {
    expect(
      getSamplePolicy({
        actor: "BRONZE",
        beatDurationSeconds: BEAT,
        overrides: { bronzeMaxRecordingSeconds: 181 },
      }).maxRecordingSeconds,
    ).toBe(SAMPLE_POLICY_DEFAULTS.BRONZE.maxRecordingSeconds);
  });

  it("ANONYMOUS / FREE duration cannot be overridden via overrides bag", () => {
    expect(
      getSamplePolicy({
        actor: "ANONYMOUS",
        beatDurationSeconds: BEAT,
        overrides: { bronzeMaxRecordingSeconds: 90 },
      }).maxRecordingSeconds,
    ).toBe(15);
    expect(
      getSamplePolicy({
        actor: "FREE",
        beatDurationSeconds: BEAT,
        overrides: { goldMaxRecordingSeconds: 180 },
      }).maxRecordingSeconds,
    ).toBe(30);
  });
});

describe("P1 security — forged tier / duration", () => {
  it("forged premium string fails closed to FREE", () => {
    expect(sampleActorFromPremiumTier("GOLD_SPOOF")).toBe("FREE");
    expect(sampleActorFromPremiumTier(null)).toBe("FREE");
    expect(sampleActorFromPremiumTier(undefined)).toBe("FREE");
  });

  it("forged GOLD does not apply when resolver gets FREE actor", () => {
    const p = getSamplePolicy({ actor: "FREE", beatDurationSeconds: BEAT });
    expect(p.maxRecordingSeconds).toBe(30);
    expect(p.canDownloadOwnTake).toBe(false);
  });

  it.each([
    ["ANONYMOUS", 16],
    ["FREE", 31],
    ["BRONZE", 61],
    ["SILVER", 121],
    ["GOLD", 181],
  ] as const)("%s requested %s → DENY", (actor, requested) => {
    const policy = getSamplePolicy({ actor, beatDurationSeconds: BEAT });
    expect(assertRequestedDurationAllowed({ requestedSeconds: requested, policy }).ok).toBe(
      false,
    );
  });

  it.each([
    ["ANONYMOUS", 15],
    ["FREE", 30],
    ["BRONZE", 60],
    ["SILVER", 120],
    ["GOLD", 180],
  ] as const)("%s requested %s → ALLOW", (actor, requested) => {
    const policy = getSamplePolicy({ actor, beatDurationSeconds: BEAT });
    expect(assertRequestedDurationAllowed({ requestedSeconds: requested, policy }).ok).toBe(
      true,
    );
  });
});
