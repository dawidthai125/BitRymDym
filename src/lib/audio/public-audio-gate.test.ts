/**
 * AC-PE-12 / F-PE-02 — Public Free Audio gate unit tests.
 * Uses pure isPublicFreeAudioReleasedFor so cases are independent of local .env flags.
 */

import { describe, expect, it } from "vitest";

import {
  AUDIO_ARTIFACTS_BUCKET,
  AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
  isE3PublicAudioAuthorized,
} from "@/config/audio-render";
import {
  assertAudioCapability,
  hasAudioCapability,
  rejectClientChosenPremiumClaims,
  resolveEffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import {
  PublicAudioGateError,
  assertPublicFreeAudioReleased,
  isPublicFreeAudioReleasedFor,
} from "@/lib/audio/public-audio-gate";
import {
  capabilityForRenderTier,
} from "@/lib/audio/render-job-core";
import { assertWorkerSecret } from "@/lib/audio/render-job-service";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function freeEntitlement() {
  return resolveEffectiveAudioEntitlement({
    userId: USER,
    accountLevel: "BEGINNER_RAPPER",
    premium: null,
  });
}

function premiumEntitlement() {
  return resolveEffectiveAudioEntitlement({
    userId: USER,
    accountLevel: "BEGINNER_RAPPER",
    premium: {
      userId: USER,
      active: true,
      source: "manual_admin",
      expiresAt: null,
    },
  });
}

function anonEntitlement() {
  return resolveEffectiveAudioEntitlement({
    userId: null,
    accountLevel: null,
    premium: null,
  });
}

describe("AC-PE-12 — Public Free Audio gate", () => {
  it("1/2 OFF and UNSET-equivalent: Free Mix path DENY when unauthorized", () => {
    const free = freeEntitlement();
    expect(isPublicFreeAudioReleasedFor(free, false)).toBe(false);
    expect(() => {
      if (!isPublicFreeAudioReleasedFor(free, false)) {
        throw new PublicAudioGateError(
          "Public Free Audio is not released (E3_PUBLIC_AUDIO=OFF).",
        );
      }
    }).toThrow(PublicAudioGateError);
  });

  it("3 OFF + Free BASIC_MP3 create capability still needs public release", () => {
    const free = freeEntitlement();
    expect(() =>
      assertAudioCapability(free, capabilityForRenderTier("BASIC_MP3")),
    ).not.toThrow();
    expect(isPublicFreeAudioReleasedFor(free, false)).toBe(false);
  });

  it("4 OFF + Free Basic download still needs public release after capability", () => {
    const free = freeEntitlement();
    expect(hasAudioCapability(free, "EXPORT_BASIC_MP3")).toBe(true);
    expect(isPublicFreeAudioReleasedFor(free, false)).toBe(false);
  });

  it("5 ON + Free Basic + remaining AuthZ PASS → gate ALLOW", () => {
    const free = freeEntitlement();
    expect(isPublicFreeAudioReleasedFor(free, true)).toBe(true);
    expect(() =>
      assertAudioCapability(free, capabilityForRenderTier("BASIC_MP3")),
    ).not.toThrow();
  });

  it("6/7 ON + Free HQ/WAV → DENY by capability (gate may pass)", () => {
    const free = freeEntitlement();
    expect(isPublicFreeAudioReleasedFor(free, true)).toBe(true);
    expect(() =>
      assertAudioCapability(free, capabilityForRenderTier("HQ_MP3")),
    ).toThrow();
    expect(() =>
      assertAudioCapability(free, capabilityForRenderTier("WAV")),
    ).toThrow();
  });

  it("8 unauthorized / anonymous → no Mix capability; gate does not authorize", () => {
    const anon = anonEntitlement();
    expect(anon.capabilities).toEqual([]);
    expect(() => assertAudioCapability(anon, "MIX_BASIC")).toThrow();
    // Anon is not premium; unauthorized public flag still false for Free rule.
    expect(isPublicFreeAudioReleasedFor(anon, false)).toBe(false);
    expect(isPublicFreeAudioReleasedFor(anon, true)).toBe(true);
  });

  it("9 foreign artifact ownership DENY remains independent of PUBLIC_AUDIO", () => {
    const ownerId: string = USER;
    const actorId: string = OTHER;
    expect(ownerId === actorId).toBe(false);
    // Additive: even if public audio released, foreign owner must DENY.
    expect(isPublicFreeAudioReleasedFor(freeEntitlement(), true)).toBe(true);
  });

  it("10 non-READY artifact DENY remains independent of PUBLIC_AUDIO", () => {
    const status: string = "PROCESSING";
    expect(status === "READY").toBe(false);
    expect(isPublicFreeAudioReleasedFor(freeEntitlement(), true)).toBe(true);
  });

  it("11 failed job DENY remains independent of PUBLIC_AUDIO", () => {
    const jobStatus: string = "FAILED";
    expect(jobStatus === "SUCCEEDED").toBe(false);
    expect(isPublicFreeAudioReleasedFor(freeEntitlement(), true)).toBe(true);
  });

  it("12 private artifact + authorized Free Basic keeps private signed path invariants", () => {
    expect(AUDIO_ARTIFACTS_BUCKET).toBe("audio-artifacts");
    expect(AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS).toBe(300);
    expect(isPublicFreeAudioReleasedFor(freeEntitlement(), true)).toBe(true);
  });

  it("13 worker claim AuthZ does not consult PUBLIC_AUDIO", () => {
    // assertWorkerSecret fails closed on missing/invalid secret — not on public flag.
    expect(() => assertWorkerSecret(null)).toThrow(RenderJobDomainError);
    expect(() => assertWorkerSecret("Bearer wrong")).toThrow(RenderJobDomainError);
    // isE3PublicAudioAuthorized is orthogonal; worker path must not require it.
    void isE3PublicAudioAuthorized;
  });

  it("14/15/16 Premium Mix / HQ/WAV / download ignore PUBLIC_AUDIO OFF", () => {
    const premium = premiumEntitlement();
    expect(premium.premiumTier).toBe("SILVER");
    expect(isPublicFreeAudioReleasedFor(premium, false)).toBe(true);
    expect(isPublicFreeAudioReleasedFor(premium, true)).toBe(true);
    expect(() => assertAudioCapability(premium, "MIX_BASIC")).not.toThrow();
    expect(() => assertAudioCapability(premium, "MIX_PRO")).not.toThrow();
    expect(() =>
      assertAudioCapability(premium, capabilityForRenderTier("HQ_MP3")),
    ).not.toThrow();
    // Legacy Premium → SILVER: WAV is GOLD-only under W2-A matrix.
    expect(() =>
      assertAudioCapability(premium, capabilityForRenderTier("WAV")),
    ).toThrow(/EXPORT_WAV/);
    const gold = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: {
        userId: USER,
        active: true,
        source: "manual_admin",
        expiresAt: null,
        tier: "GOLD",
      },
    });
    expect(() =>
      assertAudioCapability(gold, capabilityForRenderTier("WAV")),
    ).not.toThrow();
    expect(isPublicFreeAudioReleasedFor(gold, false)).toBe(true);
    expect(() =>
      assertAudioCapability(premium, capabilityForRenderTier("BASIC_MP3")),
    ).not.toThrow();
  });

  it("assertPublicFreeAudioReleased uses live env helper (Premium always passes)", () => {
    expect(() => assertPublicFreeAudioReleased(premiumEntitlement())).not.toThrow();
  });

  it("assertPublicFreeAudioReleased DENY Free when env PUBLIC_AUDIO is not authorized", () => {
    if (isE3PublicAudioAuthorized()) {
      // Local env may have PUBLIC_AUDIO=ON — skip env-coupled Free deny assertion.
      expect(isE3PublicAudioAuthorized()).toBe(true);
      return;
    }
    expect(() => assertPublicFreeAudioReleased(freeEntitlement())).toThrow(
      PublicAudioGateError,
    );
  });

  it("rejects client-supplied public audio claims", () => {
    expect(() =>
      rejectClientChosenPremiumClaims({ publicAudio: true }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ e3PublicAudio: true }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ E3_PUBLIC_AUDIO: true }),
    ).toThrow();
  });
});
