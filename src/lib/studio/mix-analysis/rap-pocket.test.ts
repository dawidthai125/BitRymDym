import { describe, expect, it } from "vitest";

import { applyRapPocket, duckBeatMids, pocketSpans } from "@/lib/studio/mix-analysis/rap-pocket";
import { STUDIO_FX_DEFAULTS } from "@/lib/studio/studio-fx-chain";

const SR = 44100;

function rms(buf: Float32Array, a: number, b: number): number {
  let s = 0;
  const n = Math.max(1, b - a);
  for (let i = a; i < b; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / n);
}

describe("rap pocket", () => {
  it("splits verse and hook at the markers", () => {
    expect(pocketSpans([{ kind: "verse", positionMs: 0 }, { kind: "hook", positionMs: 1000 }], 2000)).toEqual([
      { kind: "verse", startMs: 0, endMs: 1000 },
      { kind: "hook", startMs: 1000, endMs: 2000 },
    ]);
  });

  it("ducks a 1 kHz beat under a loud vocal and leaves 60 Hz", () => {
    const n = SR;
    const beatL = new Float32Array(n);
    const beatR = new Float32Array(n);
    const keyL = new Float32Array(n);
    const keyR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      beatL[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.5 + Math.sin((2 * Math.PI * 60 * i) / SR) * 0.5;
      beatR[i] = beatL[i]!;
      if (i > SR / 2) keyL[i] = keyR[i] = 0.8;
    }
    const before = beatL.slice();
    duckBeatMids({ left: beatL, right: beatR }, { left: keyL, right: keyR }, SR, 1);
    const quiet = rms(beatL, (SR * 3) / 4, SR);
    const loud = rms(before, (SR * 3) / 4, SR);
    const bass = rms(beatL, SR / 10, SR / 5);
    expect(quiet).toBeLessThan(loud * 0.85);
    expect(bass).toBeGreaterThan(0.05);
  });

  it("puts the hook closer than the verse and adds energy only on the hook", () => {
    const n = SR * 2;
    const vocal = new Float32Array(n);
    const beat = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      vocal[i] = 0.2;
      beat[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.4;
    }
    const chain = {
      schemaVersion: 1,
      effects: [{ id: "00000000-0000-4000-8000-000000000001", type: "pocket", enabled: true, params: STUDIO_FX_DEFAULTS.pocket }],
    };
    applyRapPocket(
      [
        { role: "lead_vocal", effectsChain: chain, left: vocal, right: vocal.slice() },
        { role: "beat", left: beat, right: beat.slice() },
      ],
      SR,
      2000,
      [{ kind: "verse", positionMs: 0 }, { kind: "hook", positionMs: 1000 }],
    );
    const verse = rms(vocal, SR / 10, SR / 2);
    const hook = rms(vocal, SR + SR / 10, n - SR / 10);
    expect(hook).toBeGreaterThan(verse);
    const beatEarly = rms(beat, SR / 10, SR / 2);
    const beatLate = rms(beat, SR + SR / 10, n - SR / 10);
    expect(beatLate).toBeLessThan(beatEarly);
  });
});
