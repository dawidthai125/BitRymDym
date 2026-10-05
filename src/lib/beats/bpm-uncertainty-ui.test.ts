import { describe, expect, it } from "vitest";

import type { BpmUncertaintyEnvelope } from "@/lib/beats/bpm-uncertainty";
import {
  buildBpmUxModel,
  canProceedWithBpmSelection,
  mapFinalizeBpmError,
  resolveBpmSelectionMode,
} from "@/lib/beats/bpm-uncertainty-ui";

function envelope(
  partial: Partial<BpmUncertaintyEnvelope> &
    Pick<BpmUncertaintyEnvelope, "confidenceClass" | "allowlist">,
): BpmUncertaintyEnvelope {
  return {
    decision: partial.decision ?? "MANUAL_REQUIRED",
    confidenceClass: partial.confidenceClass,
    reason: partial.reason ?? "TEST",
    detectedBpm: partial.detectedBpm ?? null,
    candidates: partial.candidates ?? [],
    hypotheses: partial.hypotheses ?? [],
    range: partial.range ?? null,
    allowlist: partial.allowlist,
    message: partial.message ?? "test",
  };
}

describe("BPM uncertainty UX model", () => {
  it("1. HIGH → AUTO_DETECTED with recommended BPM", () => {
    const model = buildBpmUxModel(
      envelope({
        decision: "AUTO_SUGGEST",
        confidenceClass: "HIGH",
        detectedBpm: 92,
        allowlist: [92],
        candidates: [
          {
            bpm: 92,
            rank: 1,
            score: 0.7,
            clusterId: "h0",
            role: "TOP",
          },
        ],
      }),
    );
    expect(model.phase).toBe("AUTO_DETECTED");
    expect(model.recommendedBpm).toBe(92);
    expect(model.requiresSelection).toBe(false);
    expect(model.canProceed).toBe(true);
    expect(model.defaultSelectionMode).toBe("AUTO");
  });

  it("2. MEDIUM → candidates displayed", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "MEDIUM",
        detectedBpm: 92,
        allowlist: [91, 92, 95],
        candidates: [
          { bpm: 92, rank: 1, score: 0.5, clusterId: "h0", role: "TOP" },
          { bpm: 95, rank: 2, score: 0.4, clusterId: "h1", role: "RUNNER" },
          { bpm: 91, rank: 3, score: 0.3, clusterId: "h0", role: "SUPPORTING" },
        ],
      }),
    );
    expect(model.phase).toBe("NEEDS_SELECTION");
    expect(model.options.map((o) => o.bpm)).toEqual([91, 92, 95]);
    expect(model.requiresSelection).toBe(true);
  });

  it("3. LOW → candidates displayed", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "LOW",
        reason: "INSUFFICIENT_MARGIN",
        detectedBpm: 89,
        allowlist: [89, 112],
        candidates: [
          { bpm: 89, rank: 1, score: 0.4, clusterId: "h0", role: "TOP" },
          { bpm: 112, rank: 2, score: 0.38, clusterId: "h1", role: "RUNNER" },
        ],
      }),
    );
    expect(model.phase).toBe("NEEDS_SELECTION");
    expect(model.confidenceClass).toBe("LOW");
    expect(model.options.length).toBe(2);
  });

  it("4. CONFLICT → hypotheses / discrete options, no continuum", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "ESTIMATOR_HARD_CONFLICT",
        detectedBpm: 92,
        allowlist: [92, 138],
        range: null,
        hypotheses: [
          {
            id: "h0",
            representativeBpm: 92,
            members: [92],
            range: { min: 92, max: 92 },
          },
          {
            id: "h1",
            representativeBpm: 138,
            members: [138],
            range: { min: 138, max: 138 },
          },
        ],
        candidates: [
          { bpm: 92, rank: 1, score: 0.5, clusterId: "h0", role: "TOP" },
          { bpm: 138, rank: 2, score: 0.4, clusterId: "h1", role: "RUNNER" },
        ],
      }),
    );
    expect(model.phase).toBe("CONFLICT");
    expect(model.range).toBeNull();
    expect(model.options.map((o) => o.bpm)).toEqual([92, 138]);
    expect(model.options.some((o) => o.hint?.includes("hipoteza"))).toBe(true);
  });

  it("5. allowlist is respected — options never invent values", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "MEDIUM",
        detectedBpm: 92,
        allowlist: [92, 95],
        candidates: [
          { bpm: 92, rank: 1, score: 0.5, clusterId: "h0", role: "TOP" },
          { bpm: 95, rank: 2, score: 0.4, clusterId: "h1", role: "RUNNER" },
          { bpm: 150, rank: 3, score: 0.1, clusterId: "h2", role: "SUPPORTING" },
        ],
      }),
    );
    expect(model.options.map((o) => o.bpm)).toEqual([92, 95]);
    expect(model.allowlist).not.toContain(150);
  });

  it("6. arbitrary BPM not accepted by client gate", () => {
    const env = envelope({
      confidenceClass: "MEDIUM",
      allowlist: [90, 95],
      detectedBpm: 90,
      candidates: [
        { bpm: 90, rank: 1, score: 0.4, clusterId: "h0", role: "TOP" },
        { bpm: 95, rank: 2, score: 0.3, clusterId: "h1", role: "RUNNER" },
      ],
    });
    expect(
      canProceedWithBpmSelection({ envelope: env, selectedBpm: 150 }),
    ).toBe(false);
    expect(
      canProceedWithBpmSelection({ envelope: env, selectedBpm: 90 }),
    ).toBe(true);
  });

  it("7. empty allowlist blocks READY", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "LOW",
        allowlist: [],
        detectedBpm: null,
      }),
    );
    expect(model.phase).toBe("UNAVAILABLE");
    expect(model.canProceed).toBe(false);
    expect(
      canProceedWithBpmSelection({
        envelope: envelope({ confidenceClass: "LOW", allowlist: [] }),
        selectedBpm: 120,
      }),
    ).toBe(false);
  });

  it("8. UNAVAILABLE blocks READY", () => {
    const model = buildBpmUxModel(
      envelope({
        decision: "UNAVAILABLE",
        confidenceClass: "UNAVAILABLE",
        allowlist: [],
      }),
    );
    expect(model.phase).toBe("UNAVAILABLE");
    expect(model.canProceed).toBe(false);
    expect(model.options).toEqual([]);
  });

  it("9. stale analyze → re-selection message", () => {
    const mapped = mapFinalizeBpmError(
      "BPM spoza wartości uznanych przez system dla tego pliku.",
    );
    expect(mapped.phase).toBe("STALE_ANALYSIS");
    expect(mapped.message).toMatch(/nieaktualny|ponownie/i);
  });

  it("10. finalize selection mode uses AUTO for HIGH match", () => {
    const env = envelope({
      decision: "AUTO_SUGGEST",
      confidenceClass: "HIGH",
      detectedBpm: 88,
      allowlist: [88, 108],
      candidates: [
        { bpm: 88, rank: 1, score: 0.7, clusterId: "h0", role: "TOP" },
        { bpm: 108, rank: 2, score: 0.4, clusterId: "h1", role: "RUNNER" },
      ],
    });
    expect(resolveBpmSelectionMode({ envelope: env, selectedBpm: 88 })).toBe(
      "AUTO",
    );
    expect(resolveBpmSelectionMode({ envelope: env, selectedBpm: 108 })).toBe(
      "CANDIDATE",
    );
  });

  it("11. range options stay within allowlist (no 1–300 escape)", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "MEDIUM",
        detectedBpm: 92,
        allowlist: [91, 92],
        range: { min: 91, max: 92 },
        candidates: [
          { bpm: 92, rank: 1, score: 0.4, clusterId: "h0", role: "TOP" },
        ],
      }),
    );
    expect(model.range).toEqual({ min: 91, max: 92 });
    for (const o of model.options) {
      expect(model.allowlist).toContain(o.bpm);
    }
    expect(
      canProceedWithBpmSelection({
        envelope: envelope({
          confidenceClass: "MEDIUM",
          allowlist: [91, 92],
          range: { min: 91, max: 92 },
        }),
        selectedBpm: 150,
      }),
    ).toBe(false);
  });

  it("12. accessibility semantics: CONFLICT options carry hypothesis hints", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        allowlist: [92, 138],
        hypotheses: [
          {
            id: "h0",
            representativeBpm: 92,
            members: [92],
            range: null,
          },
          {
            id: "h1",
            representativeBpm: 138,
            members: [138],
            range: null,
          },
        ],
      }),
    );
    expect(model.options.every((o) => o.label.includes("BPM"))).toBe(true);
    expect(model.options.every((o) => typeof o.bpm === "number")).toBe(true);
  });

  it("13. HIGH proceed path remains functional", () => {
    const env = envelope({
      decision: "AUTO_SUGGEST",
      confidenceClass: "HIGH",
      detectedBpm: 95,
      allowlist: [95],
    });
    expect(
      canProceedWithBpmSelection({ envelope: env, selectedBpm: 95 }),
    ).toBe(true);
    expect(resolveBpmSelectionMode({ envelope: env, selectedBpm: 95 })).toBe(
      "AUTO",
    );
  });
});
