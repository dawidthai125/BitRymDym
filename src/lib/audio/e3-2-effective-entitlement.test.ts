import { describe, expect, it } from "vitest";

import { AUDIO_CAPABILITY_KEYS } from "@/config/audio-render";
import {
  FREE_AUDIO_CAPABILITIES,
  PREMIUM_AUDIO_CAPABILITIES,
  assertAudioCapability,
  hasAnyAudioCapability,
  hasAudioCapability,
  isAudioCapabilityKey,
  isPremiumEntitlementActive,
  rejectClientChosenPremiumClaims,
  resolveEffectiveAudioEntitlement,
  type PremiumEntitlementSnapshot,
} from "@/lib/audio/effective-entitlement";
import { ACCOUNT_LEVELS } from "@/types/domain";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function premium(partial: Partial<PremiumEntitlementSnapshot> & { expiresAt: string | null }): PremiumEntitlementSnapshot {
  return {
    userId: USER,
    active: true,
    source: "manual_admin",
    ...partial,
  };
}

describe("E3.2 — effective audio entitlement (unit)", () => {
  it("authenticated Free gets only Basic capabilities", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(e.premiumActive).toBe(false);
    expect([...e.capabilities]).toEqual([...FREE_AUDIO_CAPABILITIES]);
    expect(hasAudioCapability(e, "MIX_BASIC")).toBe(true);
    expect(hasAudioCapability(e, "MASTER_BASIC")).toBe(true);
    expect(hasAudioCapability(e, "EXPORT_BASIC_MP3")).toBe(true);
    expect(hasAudioCapability(e, "MIX_PRO")).toBe(false);
    expect(hasAudioCapability(e, "EXPORT_WAV")).toBe(false);
  });

  it("PRO_RAPPER / LEGEND_RAPPER account levels are not Premium", () => {
    for (const level of ACCOUNT_LEVELS) {
      const e = resolveEffectiveAudioEntitlement({
        userId: USER,
        accountLevel: level,
        premium: null,
      });
      expect(e.premiumActive).toBe(false);
      expect(hasAudioCapability(e, "MIX_PRO")).toBe(false);
      expect(hasAudioCapability(e, "MASTER_PRO")).toBe(false);
      expect(hasAudioCapability(e, "EXPORT_HQ_MP3")).toBe(false);
      expect(hasAudioCapability(e, "EXPORT_WAV")).toBe(false);
    }
  });

  it("legacy active Premium maps to SILVER (HQ + Mix/Master Pro, not WAV)", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: premium({ expiresAt: null }),
    });
    expect(e.premiumActive).toBe(true);
    expect(e.premiumTier).toBe("SILVER");
    expect(e.premiumSource).toBe("manual_admin");
    for (const key of FREE_AUDIO_CAPABILITIES) {
      expect(hasAudioCapability(e, key)).toBe(true);
    }
    expect(hasAudioCapability(e, "EXPORT_HQ_MP3")).toBe(true);
    expect(hasAudioCapability(e, "MIX_PRO")).toBe(true);
    expect(hasAudioCapability(e, "MASTER_PRO")).toBe(true);
    expect(hasAudioCapability(e, "EXPORT_WAV")).toBe(false);
    expect(PREMIUM_AUDIO_CAPABILITIES).toContain("EXPORT_WAV");
  });

  it("GOLD tier grants EXPORT_WAV", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: premium({ expiresAt: null, tier: "GOLD" }),
    });
    expect(e.premiumTier).toBe("GOLD");
    for (const key of PREMIUM_AUDIO_CAPABILITIES) {
      expect(hasAudioCapability(e, key)).toBe(true);
    }
  });

  it("Premium expired at exact expires_at boundary is inactive", () => {
    const expiresAt = "2026-09-28T18:00:00.000Z";
    const atExpiry = new Date(expiresAt).getTime();
    const row = premium({ expiresAt });

    expect(isPremiumEntitlementActive(row, atExpiry)).toBe(false);
    expect(isPremiumEntitlementActive(row, atExpiry - 1)).toBe(true);
    expect(isPremiumEntitlementActive(row, atExpiry + 1)).toBe(false);

    const expired = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "PRO_RAPPER",
      premium: row,
      nowMs: atExpiry,
    });
    expect(expired.premiumActive).toBe(false);
    expect(hasAudioCapability(expired, "MIX_PRO")).toBe(false);
    expect(hasAudioCapability(expired, "MIX_BASIC")).toBe(true);
  });

  it("inactive overlay row never grants Premium even with future expires_at", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "LEGEND_RAPPER",
      premium: premium({
        active: false,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    });
    expect(e.premiumActive).toBe(false);
    expect(hasAudioCapability(e, "EXPORT_WAV")).toBe(false);
  });

  it("ignores premium snapshot that belongs to another user", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: premium({ userId: OTHER, expiresAt: null }),
    });
    expect(e.premiumActive).toBe(false);
    expect(hasAudioCapability(e, "MIX_PRO")).toBe(false);
  });

  it("anonymous receives zero audio capabilities", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: null,
      accountLevel: null,
      premium: premium({ expiresAt: null }),
    });
    expect(e.premiumActive).toBe(false);
    expect(e.capabilities).toEqual([]);
    expect(() => assertAudioCapability(e, "MIX_BASIC")).toThrow(
      /Authentication required/,
    );
  });

  it("assertAudioCapability denies missing Premium capability", () => {
    const free = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(() => assertAudioCapability(free, "EXPORT_WAV")).toThrow(
      /Missing audio capability/,
    );
    expect(() => assertAudioCapability(free, "MIX_BASIC")).not.toThrow();
  });

  it("rejects client-chosen premium / capability / limit claims", () => {
    expect(() =>
      rejectClientChosenPremiumClaims({ premiumActive: true }),
    ).toThrow(/must not supply premiumActive/);
    expect(() =>
      rejectClientChosenPremiumClaims({ premiumTier: "GOLD" }),
    ).toThrow(/must not supply premiumTier/);
    expect(() =>
      rejectClientChosenPremiumClaims({ capabilities: ["MIX_PRO"] }),
    ).toThrow(/must not supply capabilities/);
    expect(() =>
      rejectClientChosenPremiumClaims({ tier: "WAV" }),
    ).toThrow(/must not supply tier/);
    expect(() =>
      rejectClientChosenPremiumClaims({ limits: { rendersDaily: 999 } }),
    ).toThrow(/must not supply limits/);
    expect(() => rejectClientChosenPremiumClaims({})).not.toThrow();
  });

  it("hasAnyAudioCapability mirrors permissions helper pattern", () => {
    const free = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(hasAnyAudioCapability(free, ["MIX_PRO", "MIX_BASIC"])).toBe(true);
    expect(hasAnyAudioCapability(free, ["MIX_PRO", "EXPORT_WAV"])).toBe(false);
  });

  it("frozen capability universe has no STEMS and matches config SSOT", () => {
    expect(AUDIO_CAPABILITY_KEYS.join(",")).not.toMatch(/STEM/i);
    for (const key of [
      ...FREE_AUDIO_CAPABILITIES,
      ...PREMIUM_AUDIO_CAPABILITIES,
    ]) {
      expect(isAudioCapabilityKey(key)).toBe(true);
    }
    expect(isAudioCapabilityKey("EXPORT_STEMS")).toBe(false);
  });
});
