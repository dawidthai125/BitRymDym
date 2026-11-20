import { describe, expect, it } from "vitest";

import type { PlaySession } from "./play-types";
import {
  cleanUp,
  detectKey,
  evenDynamics,
  humanize,
  nutLabel,
  parsePlaySession,
  quantize,
  quickFix,
  setSwing,
  snapToKey,
} from "./sampek-edit";

const session = (notes: [number, number, number, number][], instrument: PlaySession["layers"][number]["instrument"] = "piano", bars = 1): PlaySession => ({
  bpm: 90,
  bars,
  key: null,
  swing: 0,
  layers: [{ id: "a", instrument, gain: 1, notes: notes.map(([t, d, n, v]) => ({ t, d, n, v })) }],
});

// A-minor melody: A C E G A with slightly late timing.
const amMelody = session([
  [0.03, 0.5, 69, 0.8],
  [1.02, 0.5, 72, 0.6],
  [1.98, 0.5, 76, 0.9],
  [2.51, 0.5, 79, 0.4],
  [3.26, 0.5, 69, 0.7],
]);

describe("Sampek fixes", () => {
  it("quantizes to the grid with strength and reports in Polish", () => {
    const full = quantize(amMelody, { grid: "1/16", strength: 100 });
    expect(full.session.layers[0]!.notes.map((n) => n.t)).toEqual([0, 1, 2, 2.5, 3.25]);
    expect(full.changes[0]).toContain("Wyrównałem 5 nut do siatki 1/16 (siła 100%)");
    const half = quantize(amMelody, { grid: "1/4", strength: 50 });
    expect(half.session.layers[0]!.notes[0]!.t).toBeCloseTo(0.015, 4);
    // Original untouched.
    expect(amMelody.layers[0]!.notes[0]!.t).toBe(0.03);
  });

  it("wraps a note pulled onto the loop end to the start", () => {
    const s = session([[3.97, 0.25, 60, 0.8]]);
    expect(quantize(s, { grid: "1/4", strength: 100 }).session.layers[0]!.notes[0]!.t).toBe(0);
  });

  it("handles triplets", () => {
    const s = session([[0.34, 0.2, 60, 0.8]], "hiphop");
    expect(quantize(s, { grid: "1/8T", strength: 100 }).session.layers[0]!.notes[0]!.t).toBeCloseTo(1 / 3, 3);
  });

  it("detects the key, ignoring drums, and snaps stray notes", () => {
    expect(detectKey(amMelody)?.key).toMatch(/^(Am|C)$/);
    const withDrums: PlaySession = { ...amMelody, layers: [...amMelody.layers, { id: "d", instrument: "hiphop", gain: 1, notes: [{ t: 0, d: 0.1, n: 1, v: 1 }] }] };
    expect(detectKey(withDrums)?.key).toBe(detectKey(amMelody)?.key);
    const stray = session([[0, 1, 69, 0.8], [1, 1, 72, 0.8], [2, 1, 76, 0.8], [3, 1, 70, 0.8]]); // A# is out of A minor
    const fixed = snapToKey(stray, "Am");
    expect(fixed.session.layers[0]!.notes.map((n) => n.n)).toEqual([69, 72, 76, 69]);
    expect(fixed.session.key).toBe("Am");
    expect(fixed.changes.join(" ")).toContain("Poprawiłem 1 nutę");
    const drums = snapToKey(session([[0, 0.1, 3, 1]], "drums"), "Am");
    expect(drums.session.layers[0]!.notes[0]!.n).toBe(3);
  });

  it("evens dynamics and humanizes deterministically", () => {
    const even = evenDynamics(amMelody, 1);
    const vs = even.session.layers[0]!.notes.map((n) => n.v);
    expect(Math.max(...vs) - Math.min(...vs)).toBeLessThan(0.02);
    const h1 = humanize(amMelody, { seed: 7 });
    const h2 = humanize(amMelody, { seed: 7 });
    expect(h1.session).toEqual(h2.session);
    expect(h1.session.layers[0]!.notes.every((n) => n.t >= 0 && n.t < 4)).toBe(true);
  });

  it("cleans up: wraps overflow, merges double hits, lengthens mis-hits", () => {
    const messy = session([
      [0, 0.02, 60, 0.5],
      [0.01, 0.5, 60, 0.9],
      [4.5, 0.5, 64, 0.7],
      [3.5, 2, 67, 0.7],
    ]);
    const r = cleanUp(messy);
    const notes = r.session.layers[0]!.notes;
    expect(notes).toHaveLength(3);
    expect(notes[0]!.v).toBe(0.9);
    expect(notes.find((n) => n.n === 64)!.t).toBeCloseTo(0.5);
    expect(notes.find((n) => n.n === 67)!.d).toBeCloseTo(0.5);
    expect(r.changes.join(" ")).toMatch(/Przeniosłem 1 nutę.*podwójne uderzenie.*Skróciłem 1 nutę/);
    expect(cleanUp(messy, { overflow: "drop" }).session.layers[0]!.notes.some((n) => n.n === 64)).toBe(false);
  });

  it("sets swing and runs the quick fix", () => {
    expect(setSwing(amMelody, 0.3).session.swing).toBe(0.3);
    const q = quickFix(amMelody);
    expect(q.session.key).toBeTruthy();
    expect(q.changes.length).toBeGreaterThan(0);
  });

  it("validates untrusted sessions", () => {
    expect(parsePlaySession(amMelody)).not.toBeNull();
    expect(parsePlaySession({ ...amMelody, bars: 3 })).toBeNull();
    expect(parsePlaySession({ ...amMelody, layers: [{ id: "x", instrument: "kazoo", gain: 1, notes: [] }] })).toBeNull();
    expect(parsePlaySession({ ...amMelody, layers: [{ id: "x", instrument: "piano", gain: 1, notes: [{ t: 0, d: 1, n: 300, v: 1 }] }] })).toBeNull();
    expect(nutLabel(1)).toBe("nutę");
    expect(nutLabel(3)).toBe("nuty");
    expect(nutLabel(12)).toBe("nut");
  });
});
