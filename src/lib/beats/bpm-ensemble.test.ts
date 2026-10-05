import { describe, expect, it } from "vitest";

import {
  hasOctaveAmbiguity,
  resolveCreateBpmFromEnsemble,
  resolveEnsembleSuggestion,
} from "@/lib/beats/bpm-ensemble";
import { resolveCreateBpm } from "@/lib/beats/bpm-uncertainty";

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

  it("low-side octave trap resolves from detector evidence (not always ×2)", () => {
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
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(71);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });

  it("high-side near agreement resolves to evidence-backed BPM", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 161,
      bBpm: 160,
      candidatesA: [{ bpm: 161, confidence: 1 }],
      candidatesB: [{ bpm: 160, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    // C_NEAR mean rounds to 161; half/double pair scored from detector evidence.
    expect(r.bpm).toBe(161);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });

  it("83/84 near resolves via half/double evidence", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 83,
      bBpm: 84,
      candidatesA: [{ bpm: 83, confidence: 1 }],
      candidatesB: [{ bpm: 84, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(84);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });

  it("92 vs 184 conflict → HALF_DOUBLE_RESOLVED (not MANUAL)", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 92,
      bBpm: 184,
      candidatesA: [
        { bpm: 92, confidence: 0.85 },
        { bpm: 184, confidence: 0.7 },
      ],
      candidatesB: [
        { bpm: 184, confidence: 0.8 },
        { bpm: 92, confidence: 0.6 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect([92, 184]).toContain(r.bpm);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });

  it("research non-harmonic conflicts stay MANUAL when no cross-support", () => {
    const cases = [
      { a: 120, b: 90 }, // not half/double, each list only has its top
      { a: 112, b: 70 },
      { a: 94, b: 140 },
      { a: 172, b: 175 }, // |Δ|=3 → conflict
    ];
    for (const c of cases) {
      const r = resolveEnsembleSuggestion({
        aBpm: c.a,
        bBpm: c.b,
        candidatesA: [{ bpm: c.a, confidence: 1 }],
        candidatesB: [{ bpm: c.b, confidence: 1 }],
      });
      expect(r.status).toBe("MANUAL_REQUIRED");
      expect(r.reason).toBe("CONFLICT");
    }
  });

  it("cross-support: B top present strongly in A candidates → AUTO", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 120,
      bBpm: 89,
      candidatesA: [
        { bpm: 120, confidence: 1 },
        { bpm: 89, confidence: 0.96 },
      ],
      candidatesB: [{ bpm: 89, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(89);
    expect(r.reason).toBe("NEAR_AGREEMENT");
  });

  it("half/double twin of top in candidate pool → AUTO", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 92,
      bBpm: 161,
      candidatesA: [
        { bpm: 92, confidence: 1 },
        { bpm: 176, confidence: 0.5 },
      ],
      candidatesB: [
        { bpm: 161, confidence: 1 },
        { bpm: 183, confidence: 0.9 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(92);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });

  it("99/100 near resolves half/double trap from evidence", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 99,
      bBpm: 100,
      candidatesA: [{ bpm: 99, confidence: 1 }],
      candidatesB: [{ bpm: 100, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(100);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });

  it("hasOctaveAmbiguity still detects octave twin in candidates", () => {
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

  it("half/double with stronger double-time evidence picks higher BPM", () => {
    const r = resolveEnsembleSuggestion({
      aBpm: 70,
      bBpm: 140,
      candidatesA: [
        { bpm: 140, confidence: 0.95 },
        { bpm: 70, confidence: 0.2 },
      ],
      candidatesB: [
        { bpm: 140, confidence: 0.9 },
        { bpm: 70, confidence: 0.15 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    expect(r.bpm).toBe(140);
    expect(r.reason).toBe("HALF_DOUBLE_RESOLVED");
  });
});

describe("resolveCreateBpm (ensemble create policy / allowlist)", () => {
  it("rejects explicit override outside suggest allowlist", () => {
    const r = resolveCreateBpm({
      clientBpm: 142,
      bpmManualOverride: true,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
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
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bpm).toBe(120);
  });

  it("rejects free manual fill when MANUAL_REQUIRED / no suggest", () => {
    const r = resolveCreateBpm({
      clientBpm: 142,
      bpmManualOverride: false,
      suggestedBpm: null,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });

  it("resolveCreateBpmFromEnsemble rejects override outside estimator allowlist", () => {
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
    expect(r.ok).toBe(false);
  });

  it("resolveCreateBpmFromEnsemble accepts allowlisted estimator top", () => {
    const r = resolveCreateBpmFromEnsemble({
      clientBpm: 120,
      bpmManualOverride: true,
      analysis: {
        status: "AUTO_SUGGEST",
        bpm: 120,
        reason: "AGREEMENT",
        estimatorA: { bpm: 120, confidence: 0.9, candidates: [] },
        estimatorB: { bpm: 140, confidence: 0.8, candidates: [] },
      },
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 120 });
  });
});
