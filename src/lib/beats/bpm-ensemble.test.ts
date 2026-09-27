import { describe, expect, it } from "vitest";

import {
  hasOctaveAmbiguity,
  resolveCreateBpmFromEnsemble,
  resolveEnsembleSuggestion,
} from "@/lib/beats/bpm-ensemble";
import { resolveCreateBpm } from "@/lib/beats/audio-bpm-rank";

describe("C_NEAR + RULE B ensemble (production Design Freeze)", () => {
  it("AGREEMENT → AUTO when mid-band (no octave trap)", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 120,
      bBpm: 120,
      candidatesA: [{ bpm: 120, confidence: 1 }],
      candidatesB: [{ bpm: 120, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(120);
    expect(r.reason).toBe("AGREEMENT");
  });

  it("NEAR_AGREEMENT → mean when safe", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 119,
      bBpm: 121,
      candidatesA: [{ bpm: 119, confidence: 1 }],
      candidatesB: [{ bpm: 121, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(120);
    expect(r.reason).toBe("NEAR_AGREEMENT");
  });

  it("CONFLICT → MANUAL_REQUIRED", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 120,
      bBpm: 90,
      candidatesA: [{ bpm: 120, confidence: 1 }],
      candidatesB: [{ bpm: 90, confidence: 1 }],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.bpm).toBeNull();
    expect(r.reason).toBe("CONFLICT");
  });

  it("critical 142→71: A=B=71 → OCTAVE_AMBIGUITY MANUAL (never auto ×2)", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 71,
      bBpm: 71,
      candidatesA: [
        { bpm: 71, confidence: 1 },
        { bpm: 96, confidence: 0.6 },
      ],
      candidatesB: [
        { bpm: 71, confidence: 1 },
        { bpm: 95, confidence: 0.6 },
      ],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.reason).toBe("OCTAVE_AMBIGUITY");
    expect(r.bpm).toBeNull();
  });

  it("critical 80→161 near: OCTAVE_AMBIGUITY MANUAL", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 161,
      bBpm: 160,
      candidatesA: [{ bpm: 161, confidence: 1 }],
      candidatesB: [{ bpm: 160, confidence: 1 }],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.reason).toBe("OCTAVE_AMBIGUITY");
  });

  it("critical 166→84 near: OCTAVE_AMBIGUITY MANUAL", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 83,
      bBpm: 84,
      candidatesA: [{ bpm: 83, confidence: 1 }],
      candidatesB: [{ bpm: 84, confidence: 1 }],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.reason).toBe("OCTAVE_AMBIGUITY");
  });

  it("research conflict shapes stay MANUAL (C_NEAR conflict)", () => {
    const cases = [
      { a: 120, b: 90 }, // 90→120
      { a: 112, b: 70 }, // 140→112
      { a: 94, b: 140 }, // 140→94
      { a: 172, b: 175 }, // 87→172 (near but |Δ|=3 → conflict)
      { a: 170, b: 88 }, // 88→170
    ];
    for (const c of cases) {
      const r = resolveEnsembleSuggestion({
        aBpm: c.a,
        bBpm: c.b,
        candidatesA: [{ bpm: c.a, confidence: 1 }],
        candidatesB: [{ bpm: c.b, confidence: 1 }],
      });
      expect(r.status).toBe("MANUAL_REQUIRED");
      expect(["CONFLICT", "OCTAVE_AMBIGUITY"]).toContain(r.reason);
    }
  });

  it("100→99 near may AUTO only if RULE B allows (≤100 is low-side trap)", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 99,
      bBpm: 100,
      candidatesA: [{ bpm: 99, confidence: 1 }],
      candidatesB: [{ bpm: 100, confidence: 1 }],
    });
    // mean 100 → low-side octave trap → MANUAL
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.reason).toBe("OCTAVE_AMBIGUITY");
  });

  it("never auto-picks ×2 for octave twin in candidates", () => {
    expect(
      hasOctaveAmbiguity({
        suggestedBpm: 71,
        candidatesA: [
          { bpm: 71 },
          { bpm: 142 },
        ],
        candidatesB: [{ bpm: 71 }],
      }),
    ).toBe(true);
  });
});

describe("resolveCreateBpm (ensemble create policy)", () => {
  it("accepts explicit override when suggestion differs", () => {
    const r = resolveCreateBpm({
      clientBpm: 142,
      bpmManualOverride: true,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 142 });
  });

  it("rejects out of range", () => {
    expect(
      resolveCreateBpm({
        clientBpm: 0,
        bpmManualOverride: true,
        suggestedBpm: null,
        decodeAvailable: false,
      }).ok,
    ).toBe(false);
    expect(
      resolveCreateBpm({
        clientBpm: 301,
        bpmManualOverride: false,
        suggestedBpm: 120,
        decodeAvailable: true,
      }).ok,
    ).toBe(false);
    expect(
      resolveCreateBpm({
        clientBpm: -1,
        bpmManualOverride: true,
        suggestedBpm: null,
        decodeAvailable: false,
      }).ok,
    ).toBe(false);
    expect(
      resolveCreateBpm({
        clientBpm: 120.5 as unknown as number,
        bpmManualOverride: true,
        suggestedBpm: null,
        decodeAvailable: false,
      }).ok,
    ).toBe(false);
  });

  it("rejects tamper without override when AUTO_SUGGEST present", () => {
    const r = resolveCreateBpm({
      clientBpm: 90,
      bpmManualOverride: false,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });

  it("accepts client matching AUTO_SUGGEST", () => {
    const r = resolveCreateBpm({
      clientBpm: 120,
      bpmManualOverride: false,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 120 });
  });

  it("accepts manual fill when MANUAL_REQUIRED / no suggest", () => {
    const r = resolveCreateBpm({
      clientBpm: 142,
      bpmManualOverride: false,
      suggestedBpm: null,
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 142 });
  });

  it("resolveCreateBpmFromEnsemble mirrors override accept", () => {
    const r = resolveCreateBpmFromEnsemble({
      clientBpm: 140,
      bpmManualOverride: true,
      analysis: {
        status: "AUTO_SUGGEST",
        bpm: 120,
        reason: "AGREEMENT",
      },
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 140 });
  });
});
