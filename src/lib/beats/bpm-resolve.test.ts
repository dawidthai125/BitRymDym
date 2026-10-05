import { describe, expect, it } from "vitest";

import {
  findHalfDoublePair,
  clusterNearTempoCandidates,
  isEstimatorHardConflict,
  resolveCanonicalBpm,
  resolveCrossSupportBpm,
  resolveDetectedBpm,
  scoreBpmCandidate,
  scoreMultiSignalCandidates,
  BPM_AUTO_MARGIN_MIN,
  BPM_HARD_CONFLICT_MARGIN_MIN,
  BPM_NEAR_TEMPO_TOL,
  type BpmResolveCandidate,
  type MultiSignalEvidenceInput,
} from "@/lib/beats/bpm-resolve";

function ev(
  partial: Partial<MultiSignalEvidenceInput> & { bpm: number },
): MultiSignalEvidenceInput {
  return {
    estimatorSupport: 0,
    onsetAlignment: 0,
    ibiRegularity: 0,
    segmentMean: 0,
    segmentConsistency: 0,
    segmentWinRate: 0,
    ...partial,
  };
}

describe("resolveDetectedBpm", () => {
  it("1. unambiguous 92 → 92", () => {
    const r = resolveDetectedBpm({
      topEstimates: [92],
      candidatesA: [{ bpm: 92, confidence: 0.9 }],
      candidatesB: [{ bpm: 92, confidence: 0.85 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(92);
  });

  it("2. 184 as double-time candidate → deterministic resolution", () => {
    const r = resolveDetectedBpm({
      pair: [92, 184],
      topEstimates: [184],
      candidatesA: [
        { bpm: 184, confidence: 0.95 },
        { bpm: 92, confidence: 0.4 },
      ],
      candidatesB: [
        { bpm: 184, confidence: 0.9 },
        { bpm: 92, confidence: 0.35 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(184);
  });

  it("3. 92 + 184 → not MANUAL_REQUIRED", () => {
    const r = resolveDetectedBpm({
      pair: [92, 184],
      topEstimates: [92, 184],
      candidatesA: [
        { bpm: 92, confidence: 0.8 },
        { bpm: 184, confidence: 0.75 },
      ],
      candidatesB: [
        { bpm: 92, confidence: 0.7 },
        { bpm: 184, confidence: 0.65 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
  });

  it("4. 72 + 144 → deterministic", () => {
    const r = resolveDetectedBpm({
      pair: [72, 144],
      topEstimates: [72, 144],
      candidatesA: [
        { bpm: 72, confidence: 0.88 },
        { bpm: 144, confidence: 0.5 },
      ],
      candidatesB: [
        { bpm: 72, confidence: 0.82 },
        { bpm: 144, confidence: 0.45 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(72);
  });

  it("5. 80 + 160 → deterministic", () => {
    const r = resolveDetectedBpm({
      pair: [80, 160],
      topEstimates: [160],
      candidatesA: [
        { bpm: 160, confidence: 0.92 },
        { bpm: 80, confidence: 0.3 },
      ],
      candidatesB: [
        { bpm: 160, confidence: 0.9 },
        { bpm: 80, confidence: 0.28 },
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(160);
  });

  it("6. unambiguous 95 → 95", () => {
    const r = resolveDetectedBpm({
      topEstimates: [95],
      candidatesA: [{ bpm: 95, confidence: 1 }],
      candidatesB: [{ bpm: 95, confidence: 0.95 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(95);
  });

  it("7. true conflict → MANUAL_REQUIRED", () => {
    expect(
      resolveDetectedBpm({
        topEstimates: [90, 120],
        candidatesA: [{ bpm: 90, confidence: 0.9 }],
        candidatesB: [{ bpm: 120, confidence: 0.9 }],
      }).status,
    ).toBe("MANUAL_REQUIRED");
  });

  it("8. no candidates → MANUAL_REQUIRED", () => {
    expect(resolveDetectedBpm({}).status).toBe("MANUAL_REQUIRED");
  });

  it("9. identical input → identical output", () => {
    const input = {
      pair: [92, 184] as const,
      topEstimates: [92, 184],
      candidatesA: [
        { bpm: 92, confidence: 0.8 },
        { bpm: 184, confidence: 0.7 },
      ],
      candidatesB: [
        { bpm: 184, confidence: 0.75 },
        { bpm: 92, confidence: 0.65 },
      ],
    };
    expect(resolveDetectedBpm(input)).toEqual(resolveDetectedBpm(input));
  });

  it("10. candidate order permutation → identical output", () => {
    const baseA: BpmResolveCandidate[] = [
      { bpm: 80, confidence: 0.4 },
      { bpm: 160, confidence: 0.9 },
      { bpm: 120, confidence: 0.2 },
    ];
    const baseB: BpmResolveCandidate[] = [
      { bpm: 160, confidence: 0.85 },
      { bpm: 80, confidence: 0.35 },
    ];
    expect(
      resolveDetectedBpm({
        pair: [80, 160],
        topEstimates: [160, 80],
        candidatesA: baseA,
        candidatesB: baseB,
      }),
    ).toEqual(
      resolveDetectedBpm({
        pair: [160, 80],
        topEstimates: [80, 160],
        candidatesA: [...baseA].reverse(),
        candidatesB: [...baseB].reverse(),
      }),
    );
  });

  it("findHalfDoublePair prefers pairs involving tops", () => {
    expect(findHalfDoublePair([61, 92, 123, 183], [92, 161])).toEqual([
      92, 183,
    ]);
  });

  it("cross-support requires both estimators and a top", () => {
    const r = resolveCrossSupportBpm({
      topEstimates: [120, 89],
      candidatesA: [
        { bpm: 120, confidence: 1 },
        { bpm: 89, confidence: 0.96 },
      ],
      candidatesB: [{ bpm: 89, confidence: 1 }],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(89);
  });

  it("scoreBpmCandidate is order-independent", () => {
    const a = [
      { bpm: 92, confidence: 0.5 },
      { bpm: 184, confidence: 0.8 },
    ];
    expect(
      scoreBpmCandidate({
        bpm: 184,
        candidatesA: a,
        candidatesB: [],
        topEstimates: [184],
      }),
    ).toBe(
      scoreBpmCandidate({
        bpm: 184,
        candidatesA: [...a].reverse(),
        candidatesB: [],
        topEstimates: [184],
      }),
    );
  });
});

describe("near-tempo clustering", () => {
  it("uses documented small tol (not ±5)", () => {
    expect(BPM_NEAR_TEMPO_TOL).toBe(1);
  });

  it("91/92 → one tempo cluster", () => {
    const clustered = clusterNearTempoCandidates([
      ev({ bpm: 91, estimatorSupport: 0.9, onsetAlignment: 0.4 }),
      ev({ bpm: 92, estimatorSupport: 1.0, onsetAlignment: 0.5 }),
    ]);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]!.bpm).toBe(92);
  });

  it("115/116 → one tempo cluster", () => {
    const clustered = clusterNearTempoCandidates([
      ev({ bpm: 115, estimatorSupport: 0.8, onsetAlignment: 0.6 }),
      ev({ bpm: 116, estimatorSupport: 0.7, onsetAlignment: 0.55 }),
    ]);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]!.bpm).toBe(115);
  });

  it("true conflicts stay separate (92/122, 92/138, 95/116)", () => {
    expect(
      clusterNearTempoCandidates([
        ev({ bpm: 92 }),
        ev({ bpm: 122 }),
      ]),
    ).toHaveLength(2);
    expect(
      clusterNearTempoCandidates([
        ev({ bpm: 92 }),
        ev({ bpm: 138 }),
      ]),
    ).toHaveLength(2);
    expect(
      clusterNearTempoCandidates([
        ev({ bpm: 95 }),
        ev({ bpm: 116 }),
      ]),
    ).toHaveLength(2);
  });

  it("cluster representative is deterministic; max fields no sum-boost", () => {
    const clustered = clusterNearTempoCandidates([
      ev({
        bpm: 92,
        estimatorSupport: 0.5,
        onsetAlignment: 0.8,
        ibiRegularity: 0.9,
      }),
      ev({
        bpm: 91,
        estimatorSupport: 1.0,
        onsetAlignment: 0.3,
        ibiRegularity: 0.7,
      }),
    ]);
    expect(clustered[0]!.bpm).toBe(91);
    expect(clustered[0]!.onsetAlignment).toBe(0.8);
    expect(clustered[0]!.estimatorSupport).toBe(1.0);
  });

  it("91 vs 92 near-tie no longer false MANUAL after clustering", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 92,
      evidences: [
        ev({
          bpm: 92,
          estimatorSupport: 2,
          onsetAlignment: 0.7,
          ibiRegularity: 0.95,
          segmentMean: 0.65,
          segmentConsistency: 0.9,
          segmentWinRate: 1,
        }),
        ev({
          bpm: 91,
          estimatorSupport: 1.8,
          onsetAlignment: 0.68,
          ibiRegularity: 0.94,
          segmentMean: 0.6,
          segmentConsistency: 0.85,
          segmentWinRate: 0.9,
        }),
        ev({
          bpm: 110,
          estimatorSupport: 0.4,
          onsetAlignment: 0.2,
          ibiRegularity: 0.7,
          segmentMean: 0.2,
          segmentConsistency: 0.4,
          segmentWinRate: 0,
        }),
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") {
      expect([91, 92]).toContain(r.bpm);
      expect(r.margin).toBeGreaterThanOrEqual(BPM_AUTO_MARGIN_MIN);
    }
  });
});

describe("estimator hard-conflict guard", () => {
  it("detects large non-harmonic estimator gaps", () => {
    expect(isEstimatorHardConflict(92, 161)).toBe(true);
    expect(isEstimatorHardConflict(92, 138)).toBe(true);
    expect(isEstimatorHardConflict(92, 122)).toBe(true);
    expect(isEstimatorHardConflict(95, 116)).toBe(true);
  });

  it("does not treat half/double or near tops as hard conflict", () => {
    expect(isEstimatorHardConflict(92, 184)).toBe(false);
    expect(isEstimatorHardConflict(88, 88)).toBe(false);
    expect(isEstimatorHardConflict(95, 94)).toBe(false);
    expect(isEstimatorHardConflict(117, 125)).toBe(false);
  });

  it("92 vs 161 with only moderate margin → MANUAL", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 161,
      evidences: [
        ev({
          bpm: 161,
          estimatorSupport: 2,
          onsetAlignment: 0.55,
          ibiRegularity: 0.95,
          segmentMean: 0.55,
          segmentConsistency: 0.8,
          segmentWinRate: 0.7,
        }),
        ev({
          bpm: 92,
          estimatorSupport: 1.8,
          onsetAlignment: 0.4,
          ibiRegularity: 0.99,
          segmentMean: 0.4,
          segmentConsistency: 0.7,
          segmentWinRate: 0.3,
        }),
      ],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.estimatorHardConflict).toBe(true);
    if (r.status === "MANUAL_REQUIRED") {
      expect(r.margin).toBeLessThan(BPM_HARD_CONFLICT_MARGIN_MIN);
    }
  });

  it("92 vs 138 with margin below hard gate → MANUAL", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 138,
      evidences: [
        ev({
          bpm: 138,
          estimatorSupport: 2,
          onsetAlignment: 0.51,
          ibiRegularity: 0.98,
          segmentMean: 0.75,
          segmentConsistency: 0.8,
          segmentWinRate: 0.7,
        }),
        ev({
          bpm: 92,
          estimatorSupport: 2,
          onsetAlignment: 0.41,
          ibiRegularity: 0.99,
          segmentMean: 0.44,
          segmentConsistency: 0.7,
          segmentWinRate: 0.3,
        }),
      ],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.estimatorHardConflict).toBe(true);
  });

  it("92 vs 122 remains MANUAL without strong resolution", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 122,
      evidences: [
        ev({
          bpm: 92,
          estimatorSupport: 1.5,
          onsetAlignment: 0.35,
          ibiRegularity: 0.99,
          segmentMean: 0.52,
          segmentConsistency: 0.6,
          segmentWinRate: 0.5,
        }),
        ev({
          bpm: 122,
          estimatorSupport: 1.5,
          onsetAlignment: 0.34,
          ibiRegularity: 0.99,
          segmentMean: 0.54,
          segmentConsistency: 0.55,
          segmentWinRate: 0.5,
        }),
      ],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
  });

  it("95 vs 116 remains MANUAL", () => {
    const r = resolveCanonicalBpm({
      aBpm: 95,
      bBpm: 116,
      evidences: [
        ev({
          bpm: 95,
          estimatorSupport: 1.15,
          onsetAlignment: 0.35,
          ibiRegularity: 0.99,
          segmentMean: 0.31,
          segmentConsistency: 0.7,
          segmentWinRate: 0.52,
        }),
        ev({
          bpm: 116,
          estimatorSupport: 1.05,
          onsetAlignment: 0.3,
          ibiRegularity: 0.98,
          segmentMean: 0.29,
          segmentConsistency: 0.65,
          segmentWinRate: 0.48,
        }),
      ],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
  });

  it("strong multi-signal under hard conflict can still AUTO", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 138,
      evidences: [
        ev({
          bpm: 92,
          estimatorSupport: 2,
          onsetAlignment: 0.85,
          ibiRegularity: 0.99,
          segmentMean: 0.85,
          segmentConsistency: 0.95,
          segmentWinRate: 1,
        }),
        ev({
          bpm: 138,
          estimatorSupport: 0.5,
          onsetAlignment: 0.25,
          ibiRegularity: 0.7,
          segmentMean: 0.2,
          segmentConsistency: 0.4,
          segmentWinRate: 0,
        }),
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") {
      expect(r.bpm).toBe(92);
      expect(r.margin).toBeGreaterThanOrEqual(BPM_HARD_CONFLICT_MARGIN_MIN);
      expect(r.estimatorHardConflict).toBe(true);
    }
  });
});

describe("resolveCanonicalBpm (multi-signal)", () => {
  it("unambiguous strong evidence → AUTO", () => {
    const r = resolveCanonicalBpm({
      aBpm: 120,
      bBpm: 120,
      evidences: [
        ev({
          bpm: 120,
          estimatorSupport: 2,
          onsetAlignment: 0.7,
          ibiRegularity: 0.95,
          segmentMean: 0.65,
          segmentConsistency: 0.9,
          segmentWinRate: 1,
        }),
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
  });

  it("large margin + multi-dimension agreement → AUTO", () => {
    const r = resolveCanonicalBpm({
      aBpm: 89,
      bBpm: 89,
      evidences: [
        ev({
          bpm: 89,
          estimatorSupport: 2,
          onsetAlignment: 0.72,
          ibiRegularity: 0.96,
          segmentMean: 0.7,
          segmentConsistency: 0.9,
          segmentWinRate: 0.9,
        }),
        ev({
          bpm: 120,
          estimatorSupport: 0.4,
          onsetAlignment: 0.25,
          ibiRegularity: 0.7,
          segmentMean: 0.2,
          segmentConsistency: 0.4,
          segmentWinRate: 0.1,
        }),
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
    if (r.status === "AUTO_SUGGEST") expect(r.bpm).toBe(89);
  });

  it("small margin → MANUAL", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 92,
      evidences: [
        ev({
          bpm: 100,
          estimatorSupport: 1.1,
          onsetAlignment: 0.4,
          ibiRegularity: 0.9,
          segmentMean: 0.35,
          segmentConsistency: 0.7,
          segmentWinRate: 0.5,
        }),
        ev({
          bpm: 110,
          estimatorSupport: 1.0,
          onsetAlignment: 0.38,
          ibiRegularity: 0.88,
          segmentMean: 0.34,
          segmentConsistency: 0.68,
          segmentWinRate: 0.5,
        }),
      ],
    });
    expect(r.status).toBe("MANUAL_REQUIRED");
  });

  it("half/double collapse before scoring", () => {
    const r = resolveCanonicalBpm({
      aBpm: 92,
      bBpm: 92,
      evidences: [
        ev({
          bpm: 92,
          estimatorSupport: 1.8,
          onsetAlignment: 0.55,
          ibiRegularity: 0.95,
          segmentMean: 0.5,
          segmentConsistency: 0.8,
          segmentWinRate: 0.7,
        }),
        ev({
          bpm: 184,
          estimatorSupport: 0.9,
          onsetAlignment: 0.5,
          ibiRegularity: 0.9,
          segmentMean: 0.48,
          segmentConsistency: 0.7,
          segmentWinRate: 0.3,
        }),
      ],
    });
    expect(r.status).toBe("AUTO_SUGGEST");
  });

  it("identical evidence → identical decision", () => {
    const evidences = [
      ev({
        bpm: 95,
        estimatorSupport: 2,
        onsetAlignment: 0.7,
        ibiRegularity: 0.95,
        segmentMean: 0.65,
        segmentConsistency: 0.9,
        segmentWinRate: 1,
      }),
      ev({
        bpm: 110,
        estimatorSupport: 0.4,
        onsetAlignment: 0.2,
        ibiRegularity: 0.7,
        segmentMean: 0.2,
        segmentConsistency: 0.4,
        segmentWinRate: 0,
      }),
    ];
    expect(resolveCanonicalBpm({ evidences, aBpm: 95, bBpm: 95 })).toEqual(
      resolveCanonicalBpm({
        evidences: [...evidences].reverse(),
        aBpm: 95,
        bBpm: 95,
      }),
    );
  });

  it("stable segments favor winner", () => {
    const scored = scoreMultiSignalCandidates([
      ev({
        bpm: 88,
        estimatorSupport: 2,
        onsetAlignment: 0.6,
        ibiRegularity: 0.95,
        segmentMean: 0.6,
        segmentConsistency: 0.95,
        segmentWinRate: 1,
      }),
      ev({
        bpm: 100,
        estimatorSupport: 0.5,
        onsetAlignment: 0.3,
        ibiRegularity: 0.8,
        segmentMean: 0.25,
        segmentConsistency: 0.4,
        segmentWinRate: 0,
      }),
    ]);
    expect(scored[0]!.bpm).toBe(88);
  });
});
