import { describe, expect, it } from "vitest";

import {
  FREE_AUDIO_CAPABILITIES,
  PREMIUM_AUDIO_CAPABILITIES,
  hasAudioCapability,
  rejectClientChosenPremiumClaims,
  resolveEffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import {
  assertMixBeatPlaybackAccess,
  assertOwnMixSession,
  mixProAllowed,
  sanitizeMixClientClaims,
} from "@/lib/mix/authz-core";
import { describeMixGraphStages } from "@/lib/mix/mix-graph";
import {
  MIX_PARAMS_VERSION,
  defaultMixParameters,
  defaultMixProParams,
  parseMixParameters,
  previewEngineForCapabilities,
  serializeMixParameters,
  MixParamsError,
} from "@/lib/mix/params";
import { E3_MIX_ENABLED, E3_PUBLIC_AUDIO } from "@/config/audio-render";

const USER = "11111111-1111-4111-8111-111111111111";

describe("E3.3 — Mix params + AuthZ + graph plan (unit)", () => {
  it("defaults are valid Basic Mix parameters", () => {
    const p = defaultMixParameters();
    const parsed = parseMixParameters(p, { allowPro: false });
    expect(parsed.pro).toBeNull();
    expect(parsed.take.gainDb).toBe(0);
    expect(MIX_PARAMS_VERSION).toBe(1);
  });

  it("rejects out-of-range and unknown keys", () => {
    expect(() =>
      parseMixParameters(
        { ...defaultMixParameters(), take: { gainDb: 99, pan: 0 } },
        { allowPro: false },
      ),
    ).toThrow(MixParamsError);

    expect(() =>
      parseMixParameters(
        { ...defaultMixParameters(), stems: true },
        { allowPro: false },
      ),
    ).toThrow(/Unknown parameter key/);
  });

  it("rejects Pro params without MIX_PRO", () => {
    expect(() =>
      parseMixParameters(
        { ...defaultMixParameters(), pro: defaultMixProParams() },
        { allowPro: false },
      ),
    ).toThrow(/MIX_PRO/);
  });

  it("accepts Pro params when allowPro", () => {
    const parsed = parseMixParameters(
      { ...defaultMixParameters(), pro: defaultMixProParams() },
      { allowPro: true },
    );
    expect(parsed.pro?.eqBands.length).toBeGreaterThan(0);
  });

  it("serializes deterministically", () => {
    const a = serializeMixParameters(defaultMixParameters());
    const b = serializeMixParameters(defaultMixParameters());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("Free entitlement → MIX_BASIC only; Premium → MIX_PRO", () => {
    const free = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(hasAudioCapability(free, "MIX_BASIC")).toBe(true);
    expect(hasAudioCapability(free, "MIX_PRO")).toBe(false);
    expect(mixProAllowed(free)).toBe(false);
    expect(previewEngineForCapabilities(free.capabilities)).toBe(
      "webaudio-basic-v1",
    );

    const premium = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: {
        userId: USER,
        active: true,
        source: "manual_admin",
        expiresAt: null,
      },
    });
    expect(hasAudioCapability(premium, "MIX_PRO")).toBe(true);
    expect(mixProAllowed(premium)).toBe(true);
    expect(previewEngineForCapabilities(premium.capabilities)).toBe(
      "webaudio-pro-v1",
    );
    expect(FREE_AUDIO_CAPABILITIES).toContain("MIX_BASIC");
    expect(PREMIUM_AUDIO_CAPABILITIES).toContain("MIX_PRO");
  });

  it("expired Premium loses MIX_PRO", () => {
    const expiresAt = "2026-09-28T18:00:00.000Z";
    const at = new Date(expiresAt).getTime();
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "PRO_RAPPER",
      premium: {
        userId: USER,
        active: true,
        source: "manual_admin",
        expiresAt,
      },
      nowMs: at,
    });
    expect(hasAudioCapability(e, "MIX_PRO")).toBe(false);
    expect(hasAudioCapability(e, "MIX_BASIC")).toBe(true);
  });

  it("anonymous has no Mix capabilities", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: null,
      accountLevel: null,
      premium: null,
    });
    expect(e.capabilities).toEqual([]);
    expect(hasAudioCapability(e, "MIX_BASIC")).toBe(false);
  });

  it("rejects client premium/tier/userId claims", () => {
    expect(() =>
      sanitizeMixClientClaims({ premium: true } as Record<string, unknown>),
    ).toThrow(/must not supply premium|Premium overlay/i);
    expect(() =>
      sanitizeMixClientClaims({ tier: "premium" } as Record<string, unknown>),
    ).toThrow(/tier|Premium/i);
    expect(() =>
      sanitizeMixClientClaims({ userId: USER } as Record<string, unknown>),
    ).toThrow(/userId/);
    expect(() => rejectClientChosenPremiumClaims({ isPremium: true })).toThrow();
  });

  it("foreign mix session owner is denied", () => {
    expect(() =>
      assertOwnMixSession({ sessionOwnerId: USER, userId: "other" }),
    ).toThrow(/Not mix session owner/);
  });

  it("beat Playback Gate denies non-PUBLISHED for USER", () => {
    expect(() =>
      assertMixBeatPlaybackAccess({
        beatStatus: "DRAFT",
        actorRole: "USER",
      }),
    ).toThrow(/not available for Mix/);
    expect(() =>
      assertMixBeatPlaybackAccess({
        beatStatus: "PUBLISHED",
        actorRole: "USER",
      }),
    ).not.toThrow();
  });

  it("graph stages are deterministic Basic then Pro extension", () => {
    const basic = describeMixGraphStages(defaultMixParameters());
    expect(basic.join("|")).toContain("beat:source→gain→pan");
    expect(basic.join("|")).toContain("limiter→destination");
    expect(basic.join("|")).not.toContain("proEq");

    const withPro = describeMixGraphStages({
      ...defaultMixParameters(),
      pro: defaultMixProParams(),
    });
    expect(withPro.join("|")).toContain("proEq");
  });

  it("keeps public Free Audio and Mix flags OFF by default", () => {
    expect(E3_PUBLIC_AUDIO).toBe(false);
    expect(E3_MIX_ENABLED).toBe(false);
  });
});
