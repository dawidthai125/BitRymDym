import { describe, expect, it } from "vitest";

import { CREATOR_EXPERIENCE_AMOUNTS } from "@/config/creator-experience";
import {
  assertCreatorRankNotAccountLevelAxis,
  deriveCreatorRank,
  nextCreatorRankThreshold,
} from "@/lib/creator-progress/rank";
import type { AccountLevel } from "@/types/domain";

describe("Creator Rank derivation (W1)", () => {
  it("maps freeze thresholds including boundaries", () => {
    const cases: [number, string][] = [
      [0, "BEGINNER_RAPPER"],
      [199, "BEGINNER_RAPPER"],
      [200, "ROOKIE_RAPPER"],
      [799, "ROOKIE_RAPPER"],
      [800, "RISING_RAPPER"],
      [2499, "RISING_RAPPER"],
      [2500, "PRO_RAPPER"],
      [6999, "PRO_RAPPER"],
      [7000, "ELITE_RAPPER"],
      [19999, "ELITE_RAPPER"],
      [20000, "LEGEND_RAPPER"],
      [99999, "LEGEND_RAPPER"],
    ];
    for (const [total, rank] of cases) {
      expect(deriveCreatorRank(total)).toBe(rank);
    }
  });

  it("clamps invalid totals to Beginner", () => {
    expect(deriveCreatorRank(-10)).toBe("BEGINNER_RAPPER");
    expect(deriveCreatorRank(Number.NaN)).toBe("BEGINNER_RAPPER");
  });

  it("exposes next threshold until Legend", () => {
    expect(nextCreatorRankThreshold(0)).toEqual({
      rank: "ROOKIE_RAPPER",
      threshold: 200,
    });
    expect(nextCreatorRankThreshold(200)).toEqual({
      rank: "RISING_RAPPER",
      threshold: 800,
    });
    expect(nextCreatorRankThreshold(20_000)).toBeNull();
  });

  it("keeps Rank axis distinct from AccountLevel even when strings overlap", () => {
    const rank = deriveCreatorRank(2500);
    const accountLevel: AccountLevel = "PRO_RAPPER";
    expect(rank).toBe("PRO_RAPPER");
    expect(accountLevel).toBe("PRO_RAPPER");
    const guard = assertCreatorRankNotAccountLevelAxis(rank, accountLevel);
    expect(guard.axesDistinct).toBe(true);
    expect(guard.sameStringPossible).toBe(true);
  });
});

describe("Creator Experience amounts (W1 freeze)", () => {
  it("matches Design Freeze event amounts", () => {
    expect(CREATOR_EXPERIENCE_AMOUNTS.PROFILE_COMPLETED).toBe(25);
    expect(CREATOR_EXPERIENCE_AMOUNTS.BEAT_APPROVED).toBe(40);
    expect(CREATOR_EXPERIENCE_AMOUNTS.BEAT_FIRST_PUBLISHED).toBe(120);
    expect(CREATOR_EXPERIENCE_AMOUNTS.MIX_SESSION_FIRST_EXPORT).toBe(35);
    expect(CREATOR_EXPERIENCE_AMOUNTS.RENDER_SUCCEEDED).toBe(15);
    expect(CREATOR_EXPERIENCE_AMOUNTS.TAKE_READY).toBe(10);
  });
});
