import { describe, expect, it } from "vitest";

import { PLAN_POLICY } from "@/config/plan-policy";
import { parseStudioFxChainForWrite, type StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import { buildStudioOfflineFxChain } from "@/lib/studio/studio-offline-fx";

import { detectPitchTrack, midiLabel, segmentNotes, snapMidiToScale } from "./note-detect";
import { renderTrackSlice, type DecodedTrackClip } from "./note-editor-client";
import { mergeNoteEdits, noteEditFor } from "./note-edits";
import { clampTuneChainForTier, findLockedTuneEffect, lockedTuneReason, toTuneCoreParams } from "./tune";
import { TuneCore } from "./tune-core";
import { buildTuneWorkletSource } from "./tune-worklet";

const SR = 44100;
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function voice(f0: number, secs: number): Float32Array {
  const n = Math.round(SR * secs);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    ph += (2 * Math.PI * f0) / SR;
    let v = 0;
    for (let h = 1; h <= 12; h += 1) v += (Math.sin(h * ph) / h) * Math.exp(-((h * f0 - 700) ** 2) / (2 * 600 ** 2));
    x[i] = 0.3 * v;
  }
  return x;
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Fundamental via normalised autocorrelation (first strong peak) + parabola. */
function pitchHz(x: Float32Array, atSec: number): number {
  const a = Math.round(atSec * SR);
  const b = a + 2048;
  const corr = (lag: number) => {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = a; i < b; i += 1) {
      s += x[i]! * x[i + lag]!;
      e1 += x[i]! * x[i]!;
      e2 += x[i + lag]! * x[i + lag]!;
    }
    return s / Math.sqrt(e1 * e2 + 1e-12);
  };
  const cs = Array.from({ length: 700 }, (_, lag) => (lag < 30 ? 0 : corr(lag)));
  let bi = 0;
  for (let lag = 31; lag < 699; lag += 1) {
    if (cs[lag]! > 0.9 && cs[lag]! >= cs[lag - 1]! && cs[lag]! >= cs[lag + 1]!) {
      bi = lag;
      break;
    }
  }
  const y0 = cs[bi - 1]!;
  const y1 = cs[bi]!;
  const y2 = cs[bi + 1]!;
  return SR / (bi + (y0 - y2) / (2 * (y0 - 2 * y1 + y2)));
}
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

const NOTE = { startMs: 500, endMs: 1500, targetMidi: 59, amount: 1, retuneMs: 0 };
/** Auto-tune off (amount 0, chromatic) → only the manual note moves pitch. */
function chainWith(notes: unknown[]): StudioFxChainV1 {
  return parseStudioFxChainForWrite(
    {
      schemaVersion: 1,
      effects: [{ type: "tune", enabled: true, params: { keyRoot: 9, scale: 2, retuneMs: 0, amount: 0 }, notes }],
    },
    { role: "track" },
  );
}

describe("BRD Tune manual notes — DSP (same TuneCore as E3 render)", () => {
  const a3 = voice(midiHz(57), 2);

  it("E3 whole-buffer path moves only the edited note (A3 → B3)", () => {
    const chain = buildStudioOfflineFxChain(chainWith([NOTE]), "track", SR)!;
    const l = a3.slice();
    const r = a3.slice();
    chain.processBuffer(l, r);
    expect(Math.abs(cents(pitchHz(l, 1.0), midiHz(59)))).toBeLessThan(15);
    expect(Math.abs(cents(pitchHz(l, 0.2), midiHz(57)))).toBeLessThan(15);
    expect(Math.abs(cents(pitchHz(l, 1.75), midiHz(57)))).toBeLessThan(15);
  });

  it("cents precision: target 57.30 → +30 c", () => {
    const chain = buildStudioOfflineFxChain(chainWith([{ ...NOTE, targetMidi: 57.3 }]), "track", SR)!;
    const l = a3.slice();
    const r = a3.slice();
    chain.processBuffer(l, r);
    expect(Math.abs(cents(pitchHz(l, 1.0), midiHz(57)) - 30)).toBeLessThan(8);
  });

  it("per-note strength 0 leaves the note untouched", () => {
    const chain = buildStudioOfflineFxChain(chainWith([{ ...NOTE, amount: 0 }]), "track", SR)!;
    const l = a3.slice();
    const r = a3.slice();
    chain.processBuffer(l, r);
    expect(Math.abs(cents(pitchHz(l, 1.0), midiHz(57)))).toBeLessThan(8);
  });

  it("live stream without a timeline anchor ignores notes (no misplaced edits)", () => {
    const core = new TuneCore(SR, 2, toTuneCoreParams({ keyRoot: 9, scale: 2, retuneMs: 0, amount: 0 }, [NOTE]));
    const out = new Float32Array(a3.length);
    for (let i = 0; i < a3.length; i += 1) {
      core.step(a3[i]!, a3[i]!);
      out[i] = core.outL;
    }
    expect(Math.abs(cents(pitchHz(out, 1.04), midiHz(57)))).toBeLessThan(8);
  });

  it("note preview slice (anchored at its start) matches the timeline note", () => {
    const decoded: DecodedTrackClip[] = [
      {
        clip: { id: "c", sourceKind: "TAKE", sourceTakeId: "t", sourceBeatId: null, sourceArtifactId: null, sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 2000 },
        sampleRate: SR,
        channels: [a3],
      },
    ];
    const params = { keyRoot: 9, scale: 2, retuneMs: 0, amount: 0 };
    const slice = renderTrackSlice(decoded, 300, 1700, { params, notes: [NOTE] });
    expect(Math.abs(cents(pitchHz(slice.left, 0.7), midiHz(59)))).toBeLessThan(15); // timeline 1.0 s
    expect(Math.abs(cents(pitchHz(slice.left, 0.02), midiHz(57)))).toBeLessThan(15); // timeline 0.32 s
    const dry = renderTrackSlice(decoded, 300, 1700, null);
    expect(Math.abs(cents(pitchHz(dry.left, 0.7), midiHz(57)))).toBeLessThan(8);
  });

  it("worklet source still embeds a self-contained TuneCore", () => {
    const src = buildTuneWorkletSource();
    expect(src).toContain("setTimeOrigin");
    expect(() => new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", src)).not.toThrow();
  });
});

describe("BRD Tune manual notes — schema", () => {
  it("parses, rounds and sorts notes; keeps them through the chain", () => {
    const chain = chainWith([{ ...NOTE, startMs: 2000, endMs: 2500 }, { ...NOTE, targetMidi: 59.123 }]);
    const e = chain.effects[0]!;
    expect(e.type === "tune" && e.notes?.map((n) => [n.startMs, n.targetMidi])).toEqual([
      [500, 59.12],
      [2000, 59],
    ]);
  });
  it("defaults amount/retune and drops an empty list", () => {
    const e = chainWith([{ startMs: 0, endMs: 100, targetMidi: 60 }]).effects[0]!;
    expect(e.type === "tune" && e.notes?.[0]).toMatchObject({ amount: 1, retuneMs: 0 });
    expect("notes" in chainWith([]).effects[0]!).toBe(false);
  });
  it.each([
    ["overlap", [NOTE, { ...NOTE, startMs: 1000, endMs: 1800 }]],
    ["out of range", [{ ...NOTE, targetMidi: 200 }]],
    ["unknown key", [{ ...NOTE, foo: 1 }]],
    ["too short", [{ ...NOTE, endMs: 505 }]],
    ["too many", Array.from({ length: 513 }, (_, i) => ({ ...NOTE, startMs: i * 20, endMs: i * 20 + 15 }))],
  ])("rejects %s", (_label, notes) => {
    expect(() => chainWith(notes as unknown[])).toThrow();
  });
  it("rejects notes on non-tune effects", () => {
    expect(() =>
      parseStudioFxChainForWrite({ schemaVersion: 1, effects: [{ type: "gate", enabled: true, notes: [NOTE] }] }, { role: "track" }),
    ).toThrow();
  });
});

describe("BRD Tune manual notes — plan gate (Gold only)", () => {
  const chain = chainWith([NOTE]);
  it("policy: only GOLD has manualNotes", () => {
    expect(PLAN_POLICY.GOLD.tools.pitchCorrection.manualNotes).toBe(true);
    for (const tier of ["FREE", "BRONZE", "SILVER"] as const) expect(PLAN_POLICY[tier].tools.pitchCorrection.manualNotes).toBe(false);
  });
  it("Gold may store notes, Silver/Bronze/Free may not (reason: notes)", () => {
    expect(findLockedTuneEffect("GOLD", chain)).toBeNull();
    for (const tier of ["FREE", "BRONZE", "SILVER"] as const) {
      expect(lockedTuneReason(tier, findLockedTuneEffect(tier, chain)!)).toBe("notes");
    }
  });
  it("clamp strips notes but keeps a Silver user's hard style", () => {
    const hard = parseStudioFxChainForWrite(
      { schemaVersion: 1, effects: [{ type: "tune", enabled: true, params: { keyRoot: 9, scale: 1, retuneMs: 0, amount: 1 }, notes: [NOTE] }] },
      { role: "track" },
    );
    const silver = clampTuneChainForTier("SILVER", hard).effects[0]!;
    expect("notes" in silver).toBe(false);
    expect(silver.type === "tune" && silver.params.retuneMs).toBe(0);
    expect(clampTuneChainForTier("GOLD", hard)).toBe(hard);
  });
});

describe("BRD Tune note detection + drafts", () => {
  it("finds two sung notes separated by a breath", () => {
    const x = concat(voice(midiHz(57), 0.5), new Float32Array(Math.round(SR * 0.2)), voice(midiHz(60), 0.5));
    const notes = segmentNotes(detectPitchTrack(x, SR));
    expect(notes).toHaveLength(2);
    expect(Math.abs(notes[0]!.midi - 57)).toBeLessThan(0.15);
    expect(Math.abs(notes[1]!.midi - 60)).toBeLessThan(0.15);
    expect(notes[0]!.startMs).toBeLessThan(60);
    expect(Math.abs(notes[1]!.startMs - 700)).toBeLessThan(60);
  });
  it("snaps to key and labels notes", () => {
    expect(snapMidiToScale(56.4, 9, 1)).toBe(57); // G# not in A minor → A
    expect(snapMidiToScale(60.9, 0, 0)).toBe(60); // C# not in C major → C (closer than D)
    expect(midiLabel(57)).toBe("A3");
    expect(midiLabel(60.25)).toBe("C4 +25c");
  });
  it("stores only changed notes and restores saved edits", () => {
    const detected = [
      { startMs: 0, endMs: 400, midi: 57.1, curve: [] },
      { startMs: 500, endMs: 900, midi: 60, curve: [] },
    ];
    const drafts = new Map([
      [0, noteEditFor(detected[0]!, undefined)],
      [1, { targetMidi: 62, amount: 0.8, retuneMs: 20 }],
    ]);
    const out = mergeNoteEdits(detected, drafts);
    expect(out).toEqual([{ startMs: 500, endMs: 900, targetMidi: 62, amount: 0.8, retuneMs: 20 }]);
    expect(noteEditFor(detected[1]!, out)).toMatchObject({ targetMidi: 62, touched: true });
  });
});
