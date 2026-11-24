import { describe, expect, it, vi } from "vitest";

import { LoopPlayer, type PlayEngine } from "./instrument-engine";

describe("LoopPlayer stop", () => {
  it("silences what is already scheduled, once", () => {
    const silenceLoop = vi.fn();
    const ctx = { currentTime: 0 };
    const engine = { ctx, ensure: () => ctx, now: () => 0, click: vi.fn(), schedule: vi.fn(), silenceLoop };
    const loop = new LoopPlayer(engine as unknown as PlayEngine);
    loop.setSession({ bpm: 90, bars: 1, key: null, swing: 0, layers: [{ id: "l", instrument: "synth-pad", gain: 1, notes: [{ t: 0, d: 4, n: 60, v: 1 }] }] });
    loop.stop();
    expect(silenceLoop).not.toHaveBeenCalled();
    loop.start(4);
    loop.stop();
    loop.stop();
    expect(silenceLoop).toHaveBeenCalledTimes(1);
    expect(loop.running).toBe(false);
  });
});
