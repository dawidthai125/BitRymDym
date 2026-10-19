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
  const confidenceClass = partial.confidenceClass;
  return {
    decision: partial.decision ?? "MANUAL_REQUIRED",
    confidenceClass,
    reason: partial.reason ?? "TEST",
    detectedBpm: partial.detectedBpm ?? null,
    candidates: partial.candidates ?? [],
    hypotheses: partial.hypotheses ?? [],
    range: partial.range ?? null,
    allowlist: partial.allowlist,
    message: partial.message ?? "test",
    requiresExplicitSelection:
      partial.requiresExplicitSelection ?? confidenceClass !== "HIGH",
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
    expect(model.recommendedBpm).toBeNull();
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
    expect(model.recommendedBpm).toBeNull();
    expect(model.requiresSelection).toBe(true);
    expect(model.headline).toContain("nie może jednoznacznie określić BPM");
    expect(model.description).toMatch(/Ranking sygnałowy nie oznacza automatycznej decyzji/i);
    expect(model.options.map((o) => o.bpm)).toEqual([92, 138]);
    expect(model.options.every((o) => o.label.startsWith("Hipoteza "))).toBe(
      true,
    );
    expect(
      model.options.some((o) => o.hint?.toLowerCase().includes("główna")),
    ).toBe(false);
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

  it("12. accessibility semantics: CONFLICT options carry hypothesis labels", () => {
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
        candidates: [
          { bpm: 92, rank: 1, score: 0.5, clusterId: "h0", role: "TOP" },
          { bpm: 138, rank: 2, score: 0.4, clusterId: "h1", role: "RUNNER" },
        ],
      }),
    );
    expect(model.options.every((o) => o.label.includes("BPM"))).toBe(true);
    expect(model.options.every((o) => o.label.startsWith("Hipoteza "))).toBe(
      true,
    );
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

  it("A. RATIO_1_5 65 vs 100 — no array-order preference; clear top may be labeled", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "RATIO_1_5_AMBIGUITY",
        detectedBpm: 100,
        requiresExplicitSelection: true,
        allowlist: [65, 99, 100, 101],
        // Ascending BPM order: 65 first — must NOT become quality preference.
        hypotheses: [
          {
            id: "h0",
            representativeBpm: 65,
            members: [65],
            range: null,
          },
          {
            id: "h1",
            representativeBpm: 100,
            members: [99, 100, 101],
            range: { min: 99, max: 101 },
          },
        ],
        candidates: [
          { bpm: 100, rank: 1, score: 0.715, clusterId: "h1", role: "TOP" },
          { bpm: 65, rank: 2, score: 0.399, clusterId: "h0", role: "RUNNER" },
          {
            bpm: 99,
            rank: 3,
            score: 0,
            clusterId: "h1",
            role: "RATIO_1_5_ALT",
          },
          {
            bpm: 101,
            rank: 4,
            score: 0,
            clusterId: "h1",
            role: "SUPPORTING",
          },
        ],
      }),
    );
    expect(model.phase).toBe("CONFLICT");
    expect(model.recommendedBpm).toBeNull();
    expect(model.requiresSelection).toBe(true);
    expect(model.canProceed).toBe(false);
    expect(model.defaultSelectionMode).toBeNull();
    expect(model.description).toMatch(/Ranking sygnałowy nie oznacza automatycznej decyzji/i);
    expect(model.description).toContain("RATIO_1_5_AMBIGUITY");

    const opt65 = model.options.find((o) => o.bpm === 65);
    const opt100 = model.options.find((o) => o.bpm === 100);
    expect(opt65?.label).toBe("Hipoteza 65 BPM");
    expect(opt100?.label).toBe("Hipoteza 100 BPM");
    expect(opt65?.hint ?? "").not.toMatch(/główna|Najwyższy score/i);
    expect(opt100?.hint).toMatch(/Najwyższy score sygnałowy/i);
    // Presentation still follows hypothesis member order (65 before 100).
    expect(model.options[0]?.bpm).toBe(65);
    expect(
      canProceedWithBpmSelection({
        envelope: envelope({
          confidenceClass: "CONFLICT",
          allowlist: [65, 100],
          detectedBpm: 100,
        }),
        selectedBpm: null,
      }),
    ).toBe(false);
  });

  it("B. Hard conflict 99 vs 131 — explicit choice; no auto-resolution labels", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "ESTIMATOR_HARD_CONFLICT",
        detectedBpm: 131,
        allowlist: [99, 131],
        hypotheses: [
          {
            id: "h0",
            representativeBpm: 99,
            members: [99],
            range: null,
          },
          {
            id: "h1",
            representativeBpm: 131,
            members: [131],
            range: null,
          },
        ],
        candidates: [
          { bpm: 131, rank: 1, score: 0.745, clusterId: "h1", role: "TOP" },
          { bpm: 99, rank: 2, score: 0.659, clusterId: "h0", role: "RUNNER" },
        ],
      }),
    );
    expect(model.recommendedBpm).toBeNull();
    expect(model.requiresSelection).toBe(true);
    expect(model.options.map((o) => o.bpm)).toEqual([99, 131]);
    expect(
      model.options.every(
        (o) => !(o.hint ?? "").toLowerCase().includes("główna"),
      ),
    ).toBe(true);
    expect(
      model.options.find((o) => o.bpm === 131)?.hint,
    ).toMatch(/Najwyższy score sygnałowy/i);
  });

  it("C. Conflict 97 vs 130 — no auto recommendation; labels independent of BPM sort", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "ESTIMATOR_HARD_CONFLICT",
        detectedBpm: 97,
        allowlist: [97, 130],
        hypotheses: [
          {
            id: "h0",
            representativeBpm: 97,
            members: [97],
            range: null,
          },
          {
            id: "h1",
            representativeBpm: 130,
            members: [130],
            range: null,
          },
        ],
        candidates: [
          { bpm: 97, rank: 1, score: 0.693, clusterId: "h0", role: "TOP" },
          { bpm: 130, rank: 2, score: 0.591, clusterId: "h1", role: "RUNNER" },
        ],
      }),
    );
    expect(model.recommendedBpm).toBeNull();
    expect(model.requiresSelection).toBe(true);
    expect(model.options[0]?.bpm).toBe(97);
    expect(model.options[0]?.hint).toMatch(/Najwyższy score sygnałowy/i);
    expect(model.options[1]?.bpm).toBe(130);
    expect(model.options[1]?.hint).toBeUndefined();
  });

  it("D. Close scores — no preferential signal-leader hint", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "INSUFFICIENT_MARGIN",
        detectedBpm: 100,
        allowlist: [96, 100],
        hypotheses: [
          {
            id: "h0",
            representativeBpm: 96,
            members: [96],
            range: null,
          },
          {
            id: "h1",
            representativeBpm: 100,
            members: [100],
            range: null,
          },
        ],
        candidates: [
          { bpm: 100, rank: 1, score: 0.41, clusterId: "h1", role: "TOP" },
          { bpm: 96, rank: 2, score: 0.4, clusterId: "h0", role: "RUNNER" },
        ],
      }),
    );
    expect(model.recommendedBpm).toBeNull();
    expect(
      model.options.every(
        (o) => !(o.hint ?? "").includes("Najwyższy score sygnałowy"),
      ),
    ).toBe(true);
    expect(model.options.every((o) => o.label.startsWith("Hipoteza "))).toBe(
      true,
    );
  });

  it("E. Highest score under CONFLICT still requires explicit selection", () => {
    const env = envelope({
      confidenceClass: "CONFLICT",
      reason: "RATIO_1_5_AMBIGUITY",
      detectedBpm: 100,
      requiresExplicitSelection: true,
      allowlist: [65, 100],
      hypotheses: [
        { id: "h0", representativeBpm: 65, members: [65], range: null },
        { id: "h1", representativeBpm: 100, members: [100], range: null },
      ],
      candidates: [
        { bpm: 100, rank: 1, score: 0.72, clusterId: "h1", role: "TOP" },
        { bpm: 65, rank: 2, score: 0.4, clusterId: "h0", role: "RUNNER" },
      ],
    });
    const model = buildBpmUxModel(env);
    expect(model.recommendedBpm).toBeNull();
    expect(model.requiresSelection).toBe(true);
    expect(model.canProceed).toBe(false);
    expect(model.defaultSelectionMode).toBeNull();
    expect(
      canProceedWithBpmSelection({ envelope: env, selectedBpm: null }),
    ).toBe(false);
    expect(
      canProceedWithBpmSelection({ envelope: env, selectedBpm: 100 }),
    ).toBe(true);
    expect(
      resolveBpmSelectionMode({ envelope: env, selectedBpm: 100 }),
    ).toBe("CANDIDATE");
  });

  it("F. hypotheses[0] is not treated as quality winner solely by array order", () => {
    const model = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "RATIO_1_5_AMBIGUITY",
        detectedBpm: 100,
        allowlist: [65, 100],
        hypotheses: [
          { id: "h0", representativeBpm: 65, members: [65], range: null },
          { id: "h1", representativeBpm: 100, members: [100], range: null },
        ],
        candidates: [
          { bpm: 100, rank: 1, score: 0.715, clusterId: "h1", role: "TOP" },
          { bpm: 65, rank: 2, score: 0.399, clusterId: "h0", role: "RUNNER" },
        ],
      }),
    );
    expect(model.options[0]?.bpm).toBe(65);
    expect(model.options[0]?.hypothesisId).toBe("h0");
    expect(model.options[0]?.hint ?? "").not.toMatch(/Najwyższy score|główna/i);
    expect(model.options[1]?.bpm).toBe(100);
    expect(model.options[1]?.hint).toMatch(/Najwyższy score sygnałowy/i);
    // Deterministic presentation order preserved across rebuild.
    const again = buildBpmUxModel(
      envelope({
        confidenceClass: "CONFLICT",
        reason: "RATIO_1_5_AMBIGUITY",
        detectedBpm: 100,
        allowlist: [65, 100],
        hypotheses: [
          { id: "h0", representativeBpm: 65, members: [65], range: null },
          { id: "h1", representativeBpm: 100, members: [100], range: null },
        ],
        candidates: [
          { bpm: 100, rank: 1, score: 0.715, clusterId: "h1", role: "TOP" },
          { bpm: 65, rank: 2, score: 0.399, clusterId: "h0", role: "RUNNER" },
        ],
      }),
    );
    expect(again.options.map((o) => o.bpm)).toEqual(
      model.options.map((o) => o.bpm),
    );
    expect(again.options.map((o) => o.hint)).toEqual(
      model.options.map((o) => o.hint),
    );
  });
});
