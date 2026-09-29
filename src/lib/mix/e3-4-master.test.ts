import { describe, expect, it } from "vitest";

import {
  FREE_AUDIO_CAPABILITIES,
  PREMIUM_AUDIO_CAPABILITIES,
  hasAudioCapability,
  rejectClientChosenPremiumClaims,
  resolveEffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import {
  assertOwnMixSession,
  masterBasicAllowed,
  masterProAllowed,
  sanitizeMixClientClaims,
} from "@/lib/mix/authz-core";
import { describeMixGraphStages } from "@/lib/mix/mix-graph";
import {
  defaultMasterParameters,
  defaultMixParameters,
  parseMixParameters,
  serializeMixParameters,
  MixParamsError,
} from "@/lib/mix/params";
import { E3_MIX_ENABLED, E3_PUBLIC_AUDIO } from "@/config/audio-render";

const USER = "11111111-1111-4111-8111-111111111111";

describe("E3.4 — Master AuthZ + params + pipeline (unit)", () => {
  it("anonymous → no MASTER_BASIC / MASTER_PRO", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: null,
      accountLevel: null,
      premium: null,
    });
    expect(e.capabilities).toEqual([]);
    expect(hasAudioCapability(e, "MASTER_BASIC")).toBe(false);
    expect(hasAudioCapability(e, "MASTER_PRO")).toBe(false);
    expect(masterBasicAllowed(e)).toBe(false);
    expect(masterProAllowed(e)).toBe(false);
  });

  it("Free → MASTER_BASIC ALLOW · MASTER_PRO DENY", () => {
    const free = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(hasAudioCapability(free, "MASTER_BASIC")).toBe(true);
    expect(hasAudioCapability(free, "MASTER_PRO")).toBe(false);
    expect(masterBasicAllowed(free)).toBe(true);
    expect(masterProAllowed(free)).toBe(false);
    expect(FREE_AUDIO_CAPABILITIES).toContain("MASTER_BASIC");
    expect(PREMIUM_AUDIO_CAPABILITIES).toContain("MASTER_PRO");
  });

  it("Premium active → MASTER_BASIC + MASTER_PRO recognized", () => {
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
    expect(hasAudioCapability(premium, "MASTER_BASIC")).toBe(true);
    expect(hasAudioCapability(premium, "MASTER_PRO")).toBe(true);
    expect(masterProAllowed(premium)).toBe(true);
  });

  it("expired Premium → MASTER_BASIC ALLOW · MASTER_PRO DENY", () => {
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
    expect(hasAudioCapability(e, "MASTER_BASIC")).toBe(true);
    expect(hasAudioCapability(e, "MASTER_PRO")).toBe(false);
    expect(masterProAllowed(e)).toBe(false);
  });

  it("Account Level PRO_RAPPER ≠ Premium without overlay", () => {
    const e = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "PRO_RAPPER",
      premium: null,
    });
    expect(hasAudioCapability(e, "MASTER_PRO")).toBe(false);
    expect(hasAudioCapability(e, "MASTER_BASIC")).toBe(true);
  });

  it("rejects client premium / capabilities / userId claims", () => {
    expect(() =>
      sanitizeMixClientClaims({ premium: true } as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      sanitizeMixClientClaims({
        capabilities: ["MASTER_PRO"],
      } as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      sanitizeMixClientClaims({ userId: USER } as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ isPremium: true }),
    ).toThrow();
  });

  it("foreign Mix Session denied", () => {
    expect(() =>
      assertOwnMixSession({ sessionOwnerId: USER, userId: "other" }),
    ).toThrow(/Not mix session owner/);
  });

  it("valid Basic Master defaults + nest under Mix parameters", () => {
    const defaults = defaultMasterParameters();
    expect(defaults.gainDb).toBe(0);
    expect(defaults.clipProtect).toBe(true);
    expect(defaults.basicLimiter.thresholdDb).toBe(-1);
    expect(defaults.basicLoudness.targetLufs).toBe(-14);

    const parsed = parseMixParameters(
      {
        ...defaultMixParameters(),
        master: {
          gainDb: -3,
          clipProtect: false,
          basicLimiter: { thresholdDb: -2, ceilingDb: -0.3 },
          basicLoudness: { targetLufs: -16 },
        },
      },
      { allowPro: false, allowMaster: true },
    );
    expect(parsed.master.gainDb).toBe(-3);
    expect(parsed.master.clipProtect).toBe(false);
    expect(parsed.master.basicLoudness.targetLufs).toBe(-16);
  });

  it("applies master defaults when key omitted", () => {
    const { master: _omit, ...withoutMaster } = defaultMixParameters();
    void _omit;
    const parsed = parseMixParameters(withoutMaster, {
      allowPro: false,
      allowMaster: true,
    });
    expect(parsed.master).toEqual(defaultMasterParameters());
  });

  it("rejects invalid master ranges and unknown keys", () => {
    expect(() =>
      parseMixParameters(
        {
          ...defaultMixParameters(),
          master: { ...defaultMasterParameters(), gainDb: 99 },
        },
        { allowPro: false, allowMaster: true },
      ),
    ).toThrow(MixParamsError);

    expect(() =>
      parseMixParameters(
        {
          ...defaultMixParameters(),
          master: {
            ...defaultMasterParameters(),
            basicLoudness: { targetLufs: -2 },
          },
        },
        { allowPro: false, allowMaster: true },
      ),
    ).toThrow(/targetLufs/);

    expect(() =>
      parseMixParameters(
        {
          ...defaultMixParameters(),
          master: { ...defaultMasterParameters(), multiband: true },
        },
        { allowPro: false, allowMaster: true },
      ),
    ).toThrow(/Unknown master parameter key/);

    expect(() =>
      parseMixParameters(
        { ...defaultMixParameters(), stems: true },
        { allowPro: false, allowMaster: true },
      ),
    ).toThrow(/Unknown parameter key/);
  });

  it("rejects master without MASTER_BASIC", () => {
    expect(() =>
      parseMixParameters(
        {
          ...defaultMixParameters(),
          master: defaultMasterParameters(),
        },
        { allowPro: false, allowMaster: false },
      ),
    ).toThrow(/MASTER_BASIC/);
  });

  it("Pro Master cannot be self-enabled via client params (no pro DSP keys)", () => {
    expect(() =>
      parseMixParameters(
        {
          ...defaultMixParameters(),
          master: {
            ...defaultMasterParameters(),
            proMultiband: true,
          },
        },
        { allowPro: true, allowMaster: true },
      ),
    ).toThrow(/Unknown master parameter key/);
  });

  it("serializes master deterministically", () => {
    const a = serializeMixParameters(defaultMixParameters());
    const b = serializeMixParameters(defaultMixParameters());
    expect(JSON.stringify(a.master)).toBe(JSON.stringify(b.master));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("Mix → Master pipeline stages (after Mix limiter)", () => {
    const stages = describeMixGraphStages(defaultMixParameters()).join("|");
    expect(stages).toContain("masterBus→mixLimiter→basicMaster");
    expect(stages).toContain(
      "basicMaster:gain→clipProtect→basicLimiter→basicLoudness→destination",
    );
    expect(stages).not.toContain("render_jobs");
    expect(stages).not.toContain("audio-artifacts");
  });

  it("runtime flags remain OFF (Master reuses E3_MIX_ENABLED)", () => {
    expect(E3_MIX_ENABLED).toBe(false);
    expect(E3_PUBLIC_AUDIO).toBe(false);
  });
});
