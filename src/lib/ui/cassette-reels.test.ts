import { describe, expect, it } from "vitest";

import {
  DECK_REEL_GEOMETRY,
  HUB_DEG_PER_SECOND,
  approachSpeed,
  estimatePosition,
  packRadius,
  reelAngularSpeeds,
  reelRadii,
} from "@/lib/ui/cassette-reels";

const { hub, full } = DECK_REEL_GEOMETRY;

describe("reelRadii", () => {
  it("start: all tape on the supply reel", () => {
    expect(reelRadii(0)).toEqual({ supply: full, takeUp: hub });
  });

  it("end: all tape on the take-up reel", () => {
    expect(reelRadii(1)).toEqual({ supply: hub, takeUp: full });
  });

  it("midpoint: equal packs, area-conserving (not linear)", () => {
    const { supply, takeUp } = reelRadii(0.5);
    expect(supply).toBeCloseTo(takeUp, 10);
    expect(supply).toBeCloseTo(Math.sqrt((hub * hub + full * full) / 2), 10);
    expect(supply).toBeGreaterThan((hub + full) / 2);
  });

  it("conserves wound tape area at any progress", () => {
    for (const p of [0, 0.1, 0.37, 0.8, 1]) {
      const { supply, takeUp } = reelRadii(p);
      expect(supply ** 2 + takeUp ** 2).toBeCloseTo(hub ** 2 + full ** 2, 8);
    }
  });

  it("clamps out-of-range and NaN progress", () => {
    expect(reelRadii(-2)).toEqual(reelRadii(0));
    expect(reelRadii(5)).toEqual(reelRadii(1));
    expect(reelRadii(Number.NaN)).toEqual(reelRadii(0));
    expect(packRadius(2)).toBe(full);
  });
});

describe("reelAngularSpeeds", () => {
  it("bare hub turns at the reference speed", () => {
    expect(reelAngularSpeeds(1).supply).toBeCloseTo(HUB_DEG_PER_SECOND, 8);
    expect(reelAngularSpeeds(0).takeUp).toBeCloseTo(HUB_DEG_PER_SECOND, 8);
  });

  it("speed ratio is the inverse radius ratio (constant tape speed)", () => {
    for (const p of [0, 0.25, 0.5, 0.9]) {
      const w = reelAngularSpeeds(p);
      const r = reelRadii(p);
      expect(w.takeUp / w.supply).toBeCloseTo(r.supply / r.takeUp, 10);
      expect(w.supply * r.supply).toBeCloseTo(w.takeUp * r.takeUp, 8);
    }
  });

  it("the reel with less tape spins faster", () => {
    const early = reelAngularSpeeds(0.1);
    expect(early.takeUp).toBeGreaterThan(early.supply);
    const late = reelAngularSpeeds(0.9);
    expect(late.supply).toBeGreaterThan(late.takeUp);
  });

  it("scales with playback rate and stops for invalid rate", () => {
    expect(reelAngularSpeeds(0.3, 2).supply).toBeCloseTo(reelAngularSpeeds(0.3).supply * 2, 8);
    expect(reelAngularSpeeds(0.3, 0)).toEqual({ supply: 0, takeUp: 0 });
    expect(reelAngularSpeeds(0.3, Number.NaN)).toEqual({ supply: 0, takeUp: 0 });
  });
});

describe("estimatePosition / approachSpeed", () => {
  it("extrapolates between timeupdates, capped and clamped", () => {
    expect(estimatePosition(10, 0.2, 1, 120)).toBeCloseTo(10.2, 10);
    expect(estimatePosition(10, 5, 1, 120)).toBeCloseTo(10.6, 10);
    expect(estimatePosition(119.9, 0.5, 1, 120)).toBe(120);
  });

  it("eases toward the target and snaps when close", () => {
    const v = approachSpeed(1, 0, 1 / 60);
    expect(v).toBeLessThan(1);
    expect(v).toBeGreaterThan(0.9);
    expect(approachSpeed(0.001, 0, 1 / 60)).toBe(0);
    expect(approachSpeed(0.5, 1, 0)).toBe(0.5);
  });
});
