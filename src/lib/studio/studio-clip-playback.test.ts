import { describe, expect, it } from "vitest";

import {
  bakedTimelineMs,
  clampClipPlayback,
  clipPlaybackIdentity,
  parseClipPlaybackWrite,
  renderClipPlaybackMono,
} from "./studio-clip-playback";

describe("studio clip playback", () => {
  it("leaves identity samples untouched", () => {
    const input = Float32Array.from([0, 0.2, -0.2, 0.5]);
    expect(renderClipPlaybackMono(input, { stretch: 1, pitchCents: 0 })).toBe(input);
  });

  it("makes a slower clip longer and keeps it finite", () => {
    const input = new Float32Array(4096);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * 8 * i) / input.length);
    const out = renderClipPlaybackMono(input, { stretch: 2, pitchCents: 0 });
    expect(out.length).toBe(input.length * 2);
    expect(out.some((s) => !Number.isFinite(s))).toBe(false);
    expect(Math.max(...out.map((s) => Math.abs(s)))).toBeLessThan(2);
  });

  it("keeps length when only pitch changes", () => {
    const input = new Float32Array(4096);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * 16 * i) / input.length);
    const out = renderClipPlaybackMono(input, { stretch: 1, pitchCents: 1200 });
    expect(out.length).toBe(input.length);
    expect(out.some((s) => !Number.isFinite(s))).toBe(false);
  });

  it("rejects a stretch outside 0.5..2", () => {
    expect(() => parseClipPlaybackWrite({ stretch: 4, pitchCents: 0 })).toThrow(/stretch/);
    expect(clampClipPlayback({ stretch: null, pitchCents: 50.2 }).pitchCents).toBe(50);
    expect(clipPlaybackIdentity({ stretch: 1, pitchCents: 0 })).toBe(true);
  });

  it("maps the source offset into the slowed bake", () => {
    expect(bakedTimelineMs({ sourceOffsetMs: 1000, localMs: 10, stretch: 2 })).toBe(2010);
  });
});
