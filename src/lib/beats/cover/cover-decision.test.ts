import { describe, expect, it } from "vitest";

import { isCoverAiModerationEnabled } from "@/config/beat-covers";
import {
  coverModerationSkipped,
  coverStatusForDecision,
  decideCoverModeration,
} from "@/lib/beats/cover/cover-decision";

describe("cover moderation decision", () => {
  it("clean image → approve", () => {
    expect(
      decideCoverModeration({ flagged: false, scores: { sexual: 0.01, violence: 0.02 } }),
    ).toEqual({ decision: "approve", maxScore: 0.02, topCategory: "violence" });
  });

  it("high score → auto-reject", () => {
    expect(
      decideCoverModeration({ flagged: true, scores: { sexual: 0.93, violence: 0.1 } }).decision,
    ).toBe("reject");
  });

  it("strict categories reject at a lower score", () => {
    expect(
      decideCoverModeration({ flagged: false, scores: { "sexual/minors": 0.35 } }).decision,
    ).toBe("reject");
    expect(
      decideCoverModeration({ flagged: false, scores: { "violence/graphic": 0.31 } }).decision,
    ).toBe("reject");
  });

  it("medium score or flagged → moderator review", () => {
    expect(decideCoverModeration({ flagged: false, scores: { violence: 0.5 } }).decision).toBe("review");
    expect(decideCoverModeration({ flagged: true, scores: { harassment: 0.05 } }).decision).toBe("review");
  });

  it("ignores non-finite scores", () => {
    expect(
      decideCoverModeration({ flagged: false, scores: { sexual: Number.NaN } }).decision,
    ).toBe("approve");
  });

  it("filter unavailable → never auto-approve", () => {
    const skipped = coverModerationSkipped("disabled");
    expect(skipped.decision).toBe("review");
    expect(skipped.provider).toBe("none");
    expect(coverStatusForDecision(skipped.decision as "review")).toBe("pending");
    expect(coverStatusForDecision("approve")).toBe("approved");
  });

  it("feature flag: on only with GEMINI_API_KEY, kill switch BEAT_COVER_AI_MODERATION=0", () => {
    expect(isCoverAiModerationEnabled({})).toBe(false);
    expect(isCoverAiModerationEnabled({ OPENAI_API_KEY: "k" })).toBe(false);
    expect(isCoverAiModerationEnabled({ GEMINI_API_KEY: "  " })).toBe(false);
    expect(isCoverAiModerationEnabled({ GEMINI_API_KEY: "k" })).toBe(true);
    expect(
      isCoverAiModerationEnabled({ GEMINI_API_KEY: "k", BEAT_COVER_AI_MODERATION: "0" }),
    ).toBe(false);
  });
});
