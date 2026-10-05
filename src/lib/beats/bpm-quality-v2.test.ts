/**
 * BPM Quality V2 — decision policy vs scoring.
 * Design: docs/architecture/BPM_QUALITY_V2_DESIGN.md
 */
import { describe, expect, it } from "vitest";

import {
  BPM_AUTO_MARGIN_MIN,
  isDimsDisagree,
  isRatioOnePointFive,
  resolveCanonicalBpm,
  type MultiSignalEvidenceInput,
} from "@/lib/beats/bpm-resolve";
import {
  REJECT_SELECTION_REQUIRED,
  buildBpmUncertaintyEnvelope,
  resolveCreateBpmWithEnvelope,
} from "@/lib/beats/bpm-uncertainty";
import { buildBpmUxModel } from "@/lib/beats/bpm-uncertainty-ui";

function ev(
  partial: Partial<MultiSignalEvidenceInput> & { bpm: number },
): MultiSignalEvidenceInput {
  return {
    estimatorSupport: 0.5,
    onsetAlignment: 0.5,
    ibiRegularity: 0.5,
    segmentMean: 0.5,
    segmentConsistency: 0.5,
    segmentWinRate: 0.5,
    ...partial,
  };
}

function score(bpm: number, composite: number, dimsLeading = 2) {
  return {
    bpm,
    estimatorNorm: 0.5,
    onset: 0.5,
    regularity: 0.5,
    segment: 0.5,
    composite,
    dimensionsLeading: dimsLeading,
  };
}

describe("BPM Quality V2 — ratio 1.5 classification", () => {
  it("classifies 92/138 as RATIO_1_5 (no collapse)", () => {
    expect(isRatioOnePointFive(92, 138)).toBe(true);
    expect(isRatioOnePointFive(138, 92)).toBe(true);
  });

  it("does not classify half/double 70/140 as RATIO_1_5", () => {
    expect(isRatioOnePointFive(70, 140)).toBe(false);
  });

  it("RATIO_1_5 on top/runner forces MANUAL (no auto-collapse)", () => {
    // Strong margin that would otherwise AUTO, but 1.5× pair blocks.
    const r = resolveCanonicalBpm({
      evidences: [
        ev({
          bpm: 138,
          estimatorSupport: 2,
          onsetAlignment: 0.9,
          ibiRegularity: 0.9,
          segmentMean: 0.9,
          segmentConsistency: 0.9,
          segmentWinRate: 0.9,
        }),
        ev({
          bpm: 92,
          estimatorSupport: 0.5,
          onsetAlignment: 0.4,
          ibiRegularity: 0.4,
          segmentMean: 0.4,
          segmentConsistency: 0.4,
          segmentWinRate: 0.4,
        }),
      ],
      aBpm: 92,
      bBpm: 138,
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    if (r.status === "MANUAL_REQUIRED") {
      expect(r.reason).toBe("RATIO_1_5_AMBIGUITY");
      expect(r.bpm).toBeNull();
    }
  });
});

describe("BPM Quality V2 — DIMS_DISAGREE veto", () => {
  it("helper: runner +2 dims and margin < 0.08", () => {
    expect(
      isDimsDisagree({
        winnerDimsLeading: 1,
        runnerDimsLeading: 3,
        margin: 0.0088,
      }),
    ).toBe(true);
    expect(
      isDimsDisagree({
        winnerDimsLeading: 1,
        runnerDimsLeading: 2,
        margin: 0.0088,
      }),
    ).toBe(false);
    expect(
      isDimsDisagree({
        winnerDimsLeading: 1,
        runnerDimsLeading: 3,
        margin: BPM_AUTO_MARGIN_MIN,
      }),
    ).toBe(false);
  });

  it("Gryź-like scores → REQUIRE_SELECTION (DIMS_DISAGREE)", () => {
    // Mirror probe: 116 wins composite slightly; 95 leads 3 dims.
    const r = resolveCanonicalBpm({
      evidences: [
        ev({
          bpm: 116,
          estimatorSupport: 2,
          onsetAlignment: 0.323,
          ibiRegularity: 0.982,
          segmentMean: 0.414,
          segmentConsistency: 0.4,
          segmentWinRate: 0.4,
        }),
        ev({
          bpm: 95,
          estimatorSupport: 1.2,
          onsetAlignment: 0.435,
          ibiRegularity: 0.993,
          segmentMean: 0.696,
          segmentConsistency: 0.7,
          segmentWinRate: 0.7,
        }),
      ],
      aBpm: 95,
      bBpm: 116,
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    if (r.status === "MANUAL_REQUIRED") {
      expect(["DIMS_DISAGREE", "ESTIMATOR_HARD_CONFLICT", "INSUFFICIENT_MARGIN"]).toContain(
        r.reason,
      );
      // With hard conflict tops 95/116, hard conflict may fire first —
      // either way selection is required and bpm is null.
      expect(r.bpm).toBeNull();
      expect(r.scores[0]?.bpm).toBeDefined();
    }
  });

  it("synthetic soft conflict dims-disagree without hard tops", () => {
    // Mirror Gryź composites: denser grid wins score via estimatorNorm;
    // slower grid leads onset/IBI/segment (3 dims) with tiny margin.
    const r = resolveCanonicalBpm({
      evidences: [
        ev({
          bpm: 116,
          estimatorSupport: 2.0,
          onsetAlignment: 0.323,
          ibiRegularity: 0.982,
          segmentMean: 0.414,
          segmentConsistency: 0.4,
          segmentWinRate: 0.4,
        }),
        ev({
          bpm: 95,
          estimatorSupport: 1.328,
          onsetAlignment: 0.435,
          ibiRegularity: 0.993,
          segmentMean: 0.7,
          segmentConsistency: 0.69,
          segmentWinRate: 0.7,
        }),
      ],
      aBpm: 110,
      bBpm: 111, // near — not hard conflict
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    if (r.status === "MANUAL_REQUIRED") {
      expect(r.reason).toBe("DIMS_DISAGREE");
      expect(r.scores[0]?.bpm).toBe(116);
      expect(r.runnerUpBpm).toBe(95);
      expect(r.margin).toBeLessThan(BPM_AUTO_MARGIN_MIN);
      expect(
        (r.scores[1]?.dimensionsLeading ?? 0) -
          (r.scores[0]?.dimensionsLeading ?? 0),
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("BPM Quality V2 — CONFLICT no silent persist", () => {
  it("CONFLICT without selectionMode → BLOCKED_BPM_SELECTION_REQUIRED", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "ESTIMATOR_HARD_CONFLICT",
      message: "conflict",
      detectedBpm: 138,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ESTIMATOR_HARD_CONFLICT",
        confidence: "NONE",
        scores: [score(138, 0.8, 3), score(92, 0.71, 2)],
        margin: 0.09,
        runnerUpBpm: 92,
        estimatorHardConflict: true,
      },
      aBpm: 92,
      bBpm: 138,
      rawCandidateBpms: [92, 138],
    });
    expect(envelope.confidenceClass).toBe("CONFLICT");
    expect(envelope.requiresExplicitSelection).toBe(true);
    expect(envelope.detectedBpm).toBe(138); // ranking hint OK

    const silent = resolveCreateBpmWithEnvelope({
      clientBpm: 138,
      envelope,
    });
    expect(silent.ok).toBe(false);
    if (!silent.ok) expect(silent.error).toBe(REJECT_SELECTION_REQUIRED);

    const autoAttempt = resolveCreateBpmWithEnvelope({
      clientBpm: 138,
      envelope,
      selectionMode: "AUTO",
    });
    expect(autoAttempt.ok).toBe(false);

    const explicit = resolveCreateBpmWithEnvelope({
      clientBpm: 92,
      envelope,
      selectionMode: "CANDIDATE",
    });
    expect(explicit.ok).toBe(true);
    if (explicit.ok) {
      expect(explicit.bpmSource).toBe("USER_SELECTED_CANDIDATE");
      expect(explicit.bpm).toBe(92);
    }
  });

  it("LOW without selectionMode → blocked", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "INSUFFICIENT_MARGIN",
      message: "low",
      detectedBpm: 125,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "INSUFFICIENT_MARGIN",
        confidence: "NONE",
        scores: [score(125, 0.7), score(117, 0.699)],
        margin: 0.001,
        runnerUpBpm: 117,
        estimatorHardConflict: false,
      },
      aBpm: 117,
      bBpm: 125,
      rawCandidateBpms: [88, 117, 125],
    });
    expect(envelope.requiresExplicitSelection).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({ clientBpm: 125, envelope }).ok,
    ).toBe(false);
  });
});

describe("BPM Quality V2 — HIGH AUTO preserved", () => {
  it("HIGH + detectedBpm may AUTO without CANDIDATE mode", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "AUTO_SUGGEST",
      reason: "MULTI_SIGNAL_AGREED",
      message: "ok",
      detectedBpm: 88,
      canonical: {
        status: "AUTO_SUGGEST",
        bpm: 88,
        reason: "MULTI_SIGNAL_AGREED",
        confidence: "HIGH",
        scores: [score(88, 0.85, 4), score(108, 0.6, 0)],
        margin: 0.25,
        runnerUpBpm: 108,
        estimatorHardConflict: false,
      },
      aBpm: 88,
      bBpm: 88,
      rawCandidateBpms: [88, 108],
    });
    expect(envelope.confidenceClass).toBe("HIGH");
    expect(envelope.requiresExplicitSelection).toBe(false);
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 88,
      envelope,
      selectionMode: "AUTO",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bpmSource).toBe("AUTO_DETECTED");
  });
});

describe("BPM Quality V2 — security regressions", () => {
  it("arbitrary 150 rejected", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "INSUFFICIENT_MARGIN",
      message: "low",
      detectedBpm: 92,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "INSUFFICIENT_MARGIN",
        confidence: "NONE",
        scores: [score(92, 0.5), score(95, 0.45)],
        margin: 0.05,
        runnerUpBpm: 95,
        estimatorHardConflict: false,
      },
      aBpm: 92,
      bBpm: 95,
      rawCandidateBpms: [92, 95],
    });
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 150,
        envelope,
        selectionMode: "CANDIDATE",
        bpmManualOverride: true,
      }).ok,
    ).toBe(false);
  });

  it("92/95 discrete — no continuum invent", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "INSUFFICIENT_MARGIN",
      message: "low",
      detectedBpm: 92,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "INSUFFICIENT_MARGIN",
        confidence: "NONE",
        scores: [score(92, 0.5), score(95, 0.45)],
        margin: 0.05,
        runnerUpBpm: 95,
        estimatorHardConflict: false,
      },
      aBpm: 92,
      bBpm: 95,
      rawCandidateBpms: [92, 95],
    });
    expect(envelope.allowlist).toEqual([92, 95]);
    expect(envelope.allowlist).not.toContain(93);
    expect(envelope.allowlist).not.toContain(94);
  });

  it("92/138 separate hypotheses", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "ESTIMATOR_HARD_CONFLICT",
      message: "conflict",
      detectedBpm: 138,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ESTIMATOR_HARD_CONFLICT",
        confidence: "NONE",
        scores: [score(138, 0.8), score(92, 0.7)],
        margin: 0.1,
        runnerUpBpm: 92,
        estimatorHardConflict: true,
      },
      aBpm: 92,
      bBpm: 138,
      rawCandidateBpms: [92, 138],
    });
    expect(envelope.hypotheses.length).toBe(2);
    expect(envelope.range).toBeNull();
    const ux = buildBpmUxModel(envelope);
    expect(ux.phase).toBe("CONFLICT");
    expect(ux.recommendedBpm).toBeNull();
  });

  it("empty allowlist rejected", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "NO_CANDIDATES",
      message: "none",
      detectedBpm: null,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "NO_CANDIDATES",
        confidence: "NONE",
        scores: [],
        margin: 0,
        runnerUpBpm: null,
        estimatorHardConflict: false,
      },
      aBpm: null,
      bBpm: null,
      rawCandidateBpms: [],
    });
    expect(envelope.allowlist).toEqual([]);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 120,
        envelope,
        selectionMode: "CANDIDATE",
      }).ok,
    ).toBe(false);
  });
});

describe("BPM Quality V2 — material fixture decision (no VocalRemover SSOT)", () => {
  const materialPairs: Array<{
    name: string;
    top: number;
    runner: number;
    a: number;
    b: number;
  }> = [
    { name: "Bit By DTT", top: 138, runner: 92, a: 92, b: 138 },
    { name: "komitywa2 by DTT", top: 125, runner: 117, a: 117, b: 125 },
    { name: "DTremix", top: 120, runner: 89, a: 120, b: 89 },
    { name: "Bitrymdym1", top: 161, runner: 92, a: 92, b: 161 },
    { name: "Gryź remix", top: 116, runner: 95, a: 95, b: 116 },
  ];

  for (const m of materialPairs) {
    it(`${m.name}: inconclusive pair → REQUIRE_SELECTION envelope`, () => {
      const hard = Math.abs(m.a - m.b) > 10;
      const envelope = buildBpmUncertaintyEnvelope({
        decision: "MANUAL_REQUIRED",
        reason: hard ? "ESTIMATOR_HARD_CONFLICT" : "INSUFFICIENT_MARGIN",
        message: "manual",
        detectedBpm: m.top,
        canonical: {
          status: "MANUAL_REQUIRED",
          bpm: null,
          reason: hard ? "ESTIMATOR_HARD_CONFLICT" : "INSUFFICIENT_MARGIN",
          confidence: "NONE",
          scores: [score(m.top, 0.7), score(m.runner, 0.65)],
          margin: 0.05,
          runnerUpBpm: m.runner,
          estimatorHardConflict: hard,
        },
        aBpm: m.a,
        bBpm: m.b,
        rawCandidateBpms: [m.a, m.b, m.top, m.runner],
      });
      expect(envelope.requiresExplicitSelection).toBe(true);
      expect(envelope.confidenceClass).not.toBe("HIGH");
      expect(
        resolveCreateBpmWithEnvelope({
          clientBpm: m.top,
          envelope,
        }).ok,
      ).toBe(false);
      expect(envelope.allowlist).toContain(m.top);
      expect(envelope.allowlist).toContain(m.runner);
    });
  }
});
