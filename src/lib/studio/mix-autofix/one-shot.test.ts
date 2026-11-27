import { describe, expect, it } from "vitest";

import type { TrackMetrics } from "@/lib/studio/mix-analysis/metrics";
import {
  ONE_SHOT_TARGET_LUFS,
  oneShotDryDocument,
  oneShotGainDb,
  oneShotOps,
  oneShotToneGains,
  oneShotVocalChain,
  oneShotWetDocument,
} from "@/lib/studio/mix-autofix/one-shot";
import { createStudioFxInstance, emptyStudioFxChain, parseStudioFxChainForWrite } from "@/lib/studio/studio-fx-chain";

const track = (id: string, trackRole: string, extra: Record<string, unknown> = {}) =>
  ({ id, projectId: "p", name: id, trackType: trackRole === "beat" ? "BEAT" : "VOCAL", trackRole, sortOrder: 0, gainDb: 3, pan: 0, muted: false, solo: false, recordArmed: false, inputDeviceHint: null, outputRoute: "master", effectsChain: { ...emptyStudioFxChain(), effects: [createStudioFxInstance("compressor")] }, ...extra }) as never;
const doc = () =>
  ({
    project: { id: "p", tempoBpm: 100, masterGainDb: 2, masterPan: 0, masterFxChain: emptyStudioFxChain(), documentVersion: 1 },
    tracks: [track("beat", "beat"), track("lead", "lead_vocal"), track("ad1", "adlib"), track("ad2", "adlib", { pan: 0.7 }), track("ad3", "adlib")],
    clips: [],
    markers: [],
  }) as never;
const metric = (trackId: string, integratedLufs: number, extra: Partial<TrackMetrics> = {}): TrackMetrics => ({
  trackId, name: trackId, role: "lead_vocal", pan: 0, audible: true, hasAudio: true, integratedLufs, shortTermMaxLufs: integratedLufs + 3, samplePeakDbfs: -3, clipEvents: 0, noiseFloorDbfs: -80, toneDb: [0, 10, 9, 0, -4, -4, -8], ...extra,
});

type View = { project: { masterGainDb: number }; tracks: { gainDb: number; pan: number; effectsChain: { effects: { type: string }[] } }[] };
const view = (x: unknown) => x as View;

describe("one-shot auto mix", () => {
  it("starts from the raw sound: no effects, no fader moves, centred adlibs spread left and right", () => {
    const dry = view(oneShotDryDocument(doc()));
    expect(dry.project.masterGainDb).toBe(0);
    expect(dry.tracks.every((t) => t.gainDb === 0 && t.effectsChain.effects.length === 0)).toBe(true);
    expect(dry.tracks.map((t) => t.pan)).toEqual([0, 0, -0.5, 0.7, 0.5]);
  });

  it("matches the vocal tone within ±6 dB and leaves 80 Hz and 1.2 kHz alone", () => {
    expect(oneShotToneGains([0, 10, 9, 0, -4, -4, -8])).toEqual([0, -2.8, -3.1, 0, 2.3, -1.7, -1.5]);
    expect(oneShotToneGains([0, 30, 9, 0, -20, -4, -8])[1]).toBe(-6);
    expect(oneShotToneGains(null)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("builds chains the server accepts (lead and adlib, with and without a gate)", () => {
    for (const role of ["lead_vocal", "adlib"] as const) {
      for (const noise of [-50, -90, null]) {
        const chain = oneShotVocalChain({ role, toneDb: [0, 10, 9, 0, -4, -4, -8], noiseFloorDbfs: noise, tempoBpm: 100 });
        expect(() => parseStudioFxChainForWrite(chain, { role: "track" })).not.toThrow();
        expect(chain.effects.some((e) => e.type === "gate")).toBe(noise === -50);
        expect(chain.effects.length).toBeLessThanOrEqual(12);
      }
    }
    const adlib = oneShotVocalChain({ role: "adlib", toneDb: null, noiseFloorDbfs: null, tempoBpm: 100 });
    expect(adlib.effects.find((e) => e.type === "delay")!.params).toMatchObject({ timeMs: 600 });
  });

  it("puts every role at its loudness with one fader move and changes the beat only by level", () => {
    const original = doc();
    const dry = oneShotDryDocument(original);
    const wetDoc = oneShotWetDocument(dry, [metric("lead", -20), metric("ad1", -20), metric("ad2", -20), metric("ad3", -20)]);
    const wet = view(wetDoc);
    expect(wet.tracks[0]!.effectsChain.effects).toEqual([]);
    expect(wet.tracks[1]!.effectsChain.effects.map((e) => e.type)).toEqual(["highpass", "spectrum", "rider", "compressor", "deesser", "saturate", "delay", "reverb"]);
    expect(oneShotGainDb({ trackRole: "lead_vocal", gainDb: 0 }, metric("lead", -20))).toBe(ONE_SHOT_TARGET_LUFS.lead_vocal! + 20);
    expect(oneShotGainDb({ trackRole: "lead_vocal", gainDb: 0 }, metric("lead", -70))).toBe(24);
    expect(oneShotGainDb({ trackRole: "lead_vocal", gainDb: 0 }, { ...metric("lead", -20), hasAudio: false })).toBe(0);
    const ops = oneShotOps(original, wetDoc, [metric("beat", -14), metric("lead", -21), metric("ad1", -30), metric("ad2", -30), metric("ad3", -30)]);
    expect(ops[0]).toEqual({ op: "set_master_mix", masterGainDb: 0, masterPan: 0 });
    expect(ops.find((o) => o.op === "set_track_controls" && o.trackId === "beat")).toMatchObject({ gainDb: ONE_SHOT_TARGET_LUFS.beat! + 14 });
    expect(ops.filter((o) => o.op === "set_track_fx")).toHaveLength(5);
  });
});
