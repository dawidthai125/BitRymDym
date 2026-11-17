import { describe, expect, it } from "vitest";

import { STUDIO_TAKE_LANE_LIMITS } from "@/config/studio-recording-features";
import {
  P0_COMPING_CROSSFADE_MS,
  P0_DENOISE_RANGE_DB,
  P0_GATE_RELEASE_MS,
  P0_GATE_THRESHOLD_DBFS,
  P0_HPF_HZ,
  P0_RIDE_MAX_DB,
  P0_TUNE_NATURAL_AMOUNT,
  P0_TUNE_NATURAL_RETUNE_MS,
} from "@/lib/studio/p0-hiphop-start";
import { STUDIO_FX_DEFAULTS } from "@/lib/studio/studio-fx-chain";
import { TUNE_STYLES } from "@/lib/studio/tune/tune";

describe("P0 hip-hop start params (Producent)", () => {
  it("wires FX defaults, natural tune, and comping crossfade", () => {
    expect(STUDIO_FX_DEFAULTS.highpass.frequencyHz).toBe(P0_HPF_HZ);
    expect(STUDIO_FX_DEFAULTS.gate).toEqual({
      thresholdDb: P0_GATE_THRESHOLD_DBFS,
      rangeDb: P0_DENOISE_RANGE_DB,
      releaseMs: P0_GATE_RELEASE_MS,
    });
    expect(STUDIO_FX_DEFAULTS.rider.maxBoostDb).toBe(P0_RIDE_MAX_DB);
    expect(STUDIO_FX_DEFAULTS.rider.maxCutDb).toBe(P0_RIDE_MAX_DB);
    expect(STUDIO_FX_DEFAULTS.tune.retuneMs).toBe(P0_TUNE_NATURAL_RETUNE_MS);
    expect(TUNE_STYLES.natural).toEqual({
      retuneMs: P0_TUNE_NATURAL_RETUNE_MS,
      amount: P0_TUNE_NATURAL_AMOUNT,
    });
    expect(STUDIO_TAKE_LANE_LIMITS.crossfadeMs).toBe(P0_COMPING_CROSSFADE_MS);
  });
});
