import { describe, expect, it } from "vitest";

import {
  buildBpmUncertaintyEnvelope,
  buildBpmUncertaintyEnvelopeFromProbe,
  resolveCreateBpm,
  resolveCreateBpmWithEnvelope,
  type BpmUncertaintyEnvelope,
} from "@/lib/beats/bpm-uncertainty";
import type { MultiSignalScores } from "@/lib/beats/bpm-resolve";

function score(bpm: number, composite: number): MultiSignalScores {
  return {
    bpm,
    estimatorNorm: composite,
    onset: composite,
    regularity: composite,
    segment: composite,
    composite,
    dimensionsLeading: 2,
  };
}

function highAuto(bpm: number, runner?: number): BpmUncertaintyEnvelope {
  return buildBpmUncertaintyEnvelope({
    decision: "AUTO_SUGGEST",
    reason: "MULTI_SIGNAL_AGREED",
    message: "Wykryto automatycznie.",
    detectedBpm: bpm,
    canonical: {
      status: "AUTO_SUGGEST",
      bpm,
      reason: "MULTI_SIGNAL_AGREED",
      confidence: "HIGH",
      scores: [
        score(bpm, 0.7),
        ...(runner != null ? [score(runner, 0.4)] : []),
      ],
      margin: 0.3,
      runnerUpBpm: runner ?? null,
      estimatorHardConflict: false,
    },
    aBpm: bpm,
    bBpm: bpm,
    rawCandidateBpms: runner != null ? [bpm, runner] : [bpm],
  });
}

describe("BPM uncertainty envelope (T01–T18)", () => {
  it("T01 HIGH → AUTO accepts detected", () => {
    const envelope = highAuto(88);
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 88,
      envelope,
      selectionMode: "AUTO",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bpm).toBe(88);
      expect(r.bpmSource).toBe("AUTO_DETECTED");
      expect(r.userSelectedBpm).toBeNull();
    }
  });

  it("T02 HIGH + arbitrary 150 → reject", () => {
    const envelope = highAuto(88);
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 150,
      envelope,
      bpmManualOverride: true,
    });
    expect(r.ok).toBe(false);
  });

  it("T03 HIGH + runner candidate selection → USER_SELECTED_CANDIDATE", () => {
    const envelope = highAuto(88, 108);
    expect(envelope.allowlist).toContain(108);
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 108,
      envelope,
      selectionMode: "CANDIDATE",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bpmSource).toBe("USER_SELECTED_CANDIDATE");
      expect(r.userSelectedBpm).toBe(108);
    }
  });

  it("T04 CONFLICT 92 vs 138 → accept 92", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "ESTIMATOR_HARD_CONFLICT",
      message: "conflict",
      detectedBpm: 92,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ESTIMATOR_HARD_CONFLICT",
        confidence: "NONE",
        scores: [score(92, 0.5), score(138, 0.41)],
        margin: 0.09,
        runnerUpBpm: 138,
        estimatorHardConflict: true,
      },
      aBpm: 138,
      bBpm: 92,
      rawCandidateBpms: [92, 138],
    });
    expect(envelope.confidenceClass).toBe("CONFLICT");
    expect(envelope.range).toBeNull();
    expect(envelope.hypotheses.length).toBe(2);
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 92,
      envelope,
      selectionMode: "CANDIDATE",
    });
    expect(r.ok).toBe(true);
  });

  it("T05 CONFLICT 92 vs 138 → reject mid 115", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "ESTIMATOR_HARD_CONFLICT",
      message: "conflict",
      detectedBpm: 92,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ESTIMATOR_HARD_CONFLICT",
        confidence: "NONE",
        scores: [score(92, 0.5), score(138, 0.41)],
        margin: 0.09,
        runnerUpBpm: 138,
        estimatorHardConflict: true,
      },
      aBpm: 138,
      bBpm: 92,
      rawCandidateBpms: [92, 138],
    });
    expect(envelope.allowlist).not.toContain(115);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 115,
        envelope,
        bpmManualOverride: true,
      }).ok,
    ).toBe(false);
  });

  it("T06 CONFLICT never fabricates range 92–138", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "ESTIMATOR_HARD_CONFLICT",
      message: "conflict",
      detectedBpm: 92,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ESTIMATOR_HARD_CONFLICT",
        confidence: "NONE",
        scores: [score(92, 0.5), score(138, 0.41)],
        margin: 0.09,
        runnerUpBpm: 138,
        estimatorHardConflict: true,
      },
      aBpm: 92,
      bBpm: 138,
      rawCandidateBpms: [92, 138],
    });
    expect(envelope.range).toBeNull();
    expect(envelope.allowlist).toEqual([92, 138]);
  });

  it("T07 near-tempo 91/92 → one family, both allowlisted", () => {
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
        scores: [score(92, 0.4)],
        margin: 0.02,
        runnerUpBpm: null,
        estimatorHardConflict: false,
      },
      aBpm: 92,
      bBpm: 91,
      rawCandidateBpms: [91, 92],
    });
    expect(envelope.hypotheses.length).toBe(1);
    expect(envelope.range).toEqual({ min: 91, max: 92 });
    expect(envelope.allowlist).toEqual([91, 92]);
    expect(envelope.requiresExplicitSelection).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 91,
        envelope,
        selectionMode: "CANDIDATE",
      }).ok,
    ).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 92,
        envelope,
        selectionMode: "CANDIDATE",
      }).ok,
    ).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({ clientBpm: 92, envelope }).ok,
    ).toBe(false);
  });

  it("T08 92/95 → discrete candidates, reject 93", () => {
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
        scores: [score(92, 0.45), score(95, 0.42)],
        margin: 0.03,
        runnerUpBpm: 95,
        estimatorHardConflict: false,
      },
      aBpm: 92,
      bBpm: 95,
      rawCandidateBpms: [92, 95],
    });
    expect(envelope.range).toBeNull();
    expect(envelope.allowlist).toEqual([92, 95]);
    expect(envelope.allowlist).not.toContain(93);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 93,
        envelope,
        bpmManualOverride: true,
      }).ok,
    ).toBe(false);
  });

  it("T09 92/95 → accept 95 candidate", () => {
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
        scores: [score(92, 0.45), score(95, 0.42)],
        margin: 0.03,
        runnerUpBpm: 95,
        estimatorHardConflict: false,
      },
      aBpm: 92,
      bBpm: 95,
      rawCandidateBpms: [92, 95],
    });
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 95,
      envelope,
      selectionMode: "CANDIDATE",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bpmSource).toBe("USER_SELECTED_CANDIDATE");
  });

  it("T10 empty selection / empty allowlist → reject", () => {
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
      resolveCreateBpmWithEnvelope({ clientBpm: 120, envelope }).ok,
    ).toBe(false);
  });

  it("T11 stale client vs rebuilt allowlist → reject", () => {
    const analyzeEnvelope = highAuto(88, 108);
    const finalizeEnvelope = highAuto(95);
    expect(analyzeEnvelope.allowlist).toContain(108);
    expect(finalizeEnvelope.allowlist).not.toContain(108);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 108,
        envelope: finalizeEnvelope,
        bpmManualOverride: true,
      }).ok,
    ).toBe(false);
  });

  it("T12 RANGE mode with null range → reject", () => {
    const envelope = highAuto(88, 108);
    expect(envelope.range).toBeNull();
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 88,
        envelope,
        selectionMode: "RANGE",
      }).ok,
    ).toBe(false);
  });

  it("T13 non-int / OOR → reject", () => {
    const envelope = highAuto(120);
    expect(
      resolveCreateBpmWithEnvelope({ clientBpm: 120.5, envelope }).ok,
    ).toBe(false);
    expect(resolveCreateBpmWithEnvelope({ clientBpm: 0, envelope }).ok).toBe(
      false,
    );
    expect(resolveCreateBpmWithEnvelope({ clientBpm: 301, envelope }).ok).toBe(
      false,
    );
  });

  it("T14 UNAVAILABLE + empty candidates → no arbitrary BPM", () => {
    const envelope = buildBpmUncertaintyEnvelopeFromProbe({
      status: "unavailable",
      reason: "unsupported_format",
      message: "unsupported",
    });
    expect(envelope.confidenceClass).toBe("UNAVAILABLE");
    expect(envelope.allowlist).toEqual([]);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 128,
        envelope,
        bpmManualOverride: true,
      }).ok,
    ).toBe(false);
    expect(
      resolveCreateBpm({
        clientBpm: 128,
        bpmManualOverride: true,
        suggestedBpm: null,
        decodeAvailable: false,
      }).ok,
    ).toBe(false);
  });

  it("T15 narrow contiguous range → USER_SELECTED_WITHIN_SYSTEM_RANGE", () => {
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
        scores: [score(92, 0.4)],
        margin: 0.02,
        runnerUpBpm: null,
        estimatorHardConflict: false,
      },
      aBpm: 92,
      bBpm: 91,
      rawCandidateBpms: [91, 92],
    });
    expect(envelope.range).toEqual({ min: 91, max: 92 });
    const r = resolveCreateBpmWithEnvelope({
      clientBpm: 91,
      envelope,
      selectionMode: "RANGE",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bpmSource).toBe("USER_SELECTED_WITHIN_SYSTEM_RANGE");
    }
  });

  it("T16 half/double alternatives stay discrete (70/140), reject 105", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "OCTAVE_AMBIGUITY",
      message: "octave",
      detectedBpm: 70,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "TRUE_CONFLICT",
        confidence: "NONE",
        scores: [score(70, 0.5), score(140, 0.48)],
        margin: 0.02,
        runnerUpBpm: 140,
        estimatorHardConflict: false,
      },
      aBpm: 70,
      bBpm: 140,
      rawCandidateBpms: [70, 140],
    });
    expect(envelope.allowlist).toEqual([70, 140]);
    expect(envelope.range).toBeNull();
    expect(envelope.requiresExplicitSelection).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 70,
        envelope,
        selectionMode: "CANDIDATE",
      }).ok,
    ).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 140,
        envelope,
        selectionMode: "CANDIDATE",
      }).ok,
    ).toBe(true);
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 105,
        envelope,
        bpmManualOverride: true,
        selectionMode: "CANDIDATE",
      }).ok,
    ).toBe(false);
  });

  it("T17 frontend bypass / manipulated override → server rejects", () => {
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "MANUAL_REQUIRED",
      reason: "INSUFFICIENT_MARGIN",
      message: "low",
      detectedBpm: 90,
      canonical: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "INSUFFICIENT_MARGIN",
        confidence: "NONE",
        scores: [score(90, 0.4), score(95, 0.38)],
        margin: 0.02,
        runnerUpBpm: 95,
        estimatorHardConflict: false,
      },
      aBpm: 90,
      bBpm: 95,
      rawCandidateBpms: [90, 95],
    });
    expect(envelope.allowlist).toEqual([90, 95]);
    expect(envelope.range).toBeNull();
    expect(
      resolveCreateBpmWithEnvelope({
        clientBpm: 150,
        envelope,
        bpmManualOverride: true,
      }).ok,
    ).toBe(false);
  });

  it("T18 bpmManualOverride no longer accepts arbitrary 1–300", () => {
    const r = resolveCreateBpm({
      clientBpm: 142,
      bpmManualOverride: true,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    // Legacy bridge allowlist is singleton {120} — 142 rejected.
    expect(r.ok).toBe(false);
  });
});

describe("resolveCreateBpm legacy bridge", () => {
  it("accepts matching AUTO suggest without override", () => {
    const r = resolveCreateBpm({
      clientBpm: 120,
      bpmManualOverride: false,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bpm).toBe(120);
      expect(r.bpmSource).toBe("AUTO_DETECTED");
    }
  });

  it("rejects mismatch even with override (allowlist hole closed)", () => {
    const r = resolveCreateBpm({
      clientBpm: 90,
      bpmManualOverride: true,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects MANUAL path without envelope (no free entry)", () => {
    const r = resolveCreateBpm({
      clientBpm: 128,
      bpmManualOverride: false,
      suggestedBpm: null,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });
});
