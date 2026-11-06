import { describe, expect, it } from "vitest";

import { renderTrack, type MixAnalysisInput, type MixAnalysisTrack } from "@/lib/studio/mix-analysis/render";
import { prepareMixInput } from "@/lib/studio/master/render-mix";
import { trackAutomationSchedule, type StudioEngineTrack } from "@/lib/studio/studio-audio-schedule";
import { automationSignature, createLaneEvaluator, evalAutomation, type StudioAutomationV1 } from "@/lib/studio/studio-automation";

const SR = 8000;
const gainAuto = (points: { t: number; v: number }[]): StudioAutomationV1 => ({ v: 1, lanes: [{ param: "gainDb", points }] });
const panAuto = (points: { t: number; v: number }[]): StudioAutomationV1 => ({ v: 1, lanes: [{ param: "pan", points }] });

function input(track: MixAnalysisTrack, lengthMs = 4000): MixAnalysisInput {
  const n = Math.round((lengthMs / 1000) * SR);
  return {
    sampleRate: SR,
    lengthMs,
    masterGainDb: 0,
    masterPan: 0,
    tracks: [track],
    clips: [{ trackId: track.id, sourceKey: "s", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: lengthMs, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 }],
    // Constant DC level 0.5, mono — the output level is the gain envelope itself.
    sources: { s: { channels: [new Float32Array(n).fill(0.5)] } },
  };
}
const baseTrack = (over: Partial<MixAnalysisTrack> = {}): MixAnalysisTrack => ({ id: "t", name: "t", role: "lead_vocal", gainDb: 0, pan: 0, muted: false, solo: false, ...over });
const at = (arr: Float32Array, ms: number) => arr[Math.round((ms / 1000) * SR)];
const dbToLin = (db: number) => Math.pow(10, db / 20);

describe("automation — lane evaluator", () => {
  it("matches evalAutomation everywhere, forwards, backwards and with jumps", () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ t: i * 200, v: Math.cos(i / 3) * 6 }));
    const ev = createLaneEvaluator(pts, 1);
    const times = [0, 5, 199, 200, 201, 1234, 9999, 9800, 100, 4000, 4001, 4200, 50, 12000];
    for (const t of times) expect(ev(t)).toBeCloseTo(evalAutomation(pts, t, 1), 9);
    for (let t = 0; t < 10500; t += 37) expect(ev(t)).toBeCloseTo(evalAutomation(pts, t, 1), 9);
    expect(createLaneEvaluator([], 7)(100)).toBe(7);
  });
  it("signature changes with the envelope, not with its absence", () => {
    expect(automationSignature(undefined)).toBe("");
    expect(automationSignature({ v: 1, lanes: [] })).toBe("");
    expect(automationSignature(gainAuto([{ t: 0, v: -3 }]))).not.toBe(automationSignature(gainAuto([{ t: 0, v: -4 }])));
  });
});

describe("automation — server renderer", () => {
  it("without automation the track is unchanged (static gain, static pan)", () => {
    const base = renderTrack(input(baseTrack({ gainDb: -6, pan: 0.5 })), baseTrack({ gainDb: -6, pan: 0.5 }), false);
    const withEmpty = renderTrack(input(baseTrack({ gainDb: -6, pan: 0.5, automation: { v: 1, lanes: [] } })), baseTrack({ gainDb: -6, pan: 0.5, automation: { v: 1, lanes: [] } }), false);
    expect(Array.from(withEmpty.left.slice(0, 2000))).toEqual(Array.from(base.left.slice(0, 2000)));
    expect(Array.from(withEmpty.right.slice(0, 2000))).toEqual(Array.from(base.right.slice(0, 2000)));
  });

  it("follows a gain envelope: -24 dB at 0 s, 0 dB at 2 s, held after", () => {
    const track = baseTrack({ automation: gainAuto([{ t: 0, v: -24 }, { t: 2000, v: 0 }]) });
    const out = renderTrack(input(track), track, false);
    // mono pan centre law: both channels carry level * cos(pi/4); compare ratios to the static render.
    const flat = renderTrack(input(baseTrack()), baseTrack(), false);
    const ratio = (ms: number) => at(out.left, ms) / at(flat.left, ms);
    expect(ratio(0)).toBeCloseTo(dbToLin(-24), 3);
    expect(ratio(1000)).toBeCloseTo(dbToLin(-12), 3);
    expect(ratio(2000)).toBeCloseTo(1, 3);
    expect(ratio(3500)).toBeCloseTo(1, 3);
  });

  it("follows a pan envelope: hard left to hard right", () => {
    const track = baseTrack({ automation: panAuto([{ t: 0, v: -1 }, { t: 2000, v: 1 }]) });
    const out = renderTrack(input(track), track, false);
    expect(at(out.left, 50)).toBeGreaterThan(at(out.right, 50) * 20);
    expect(at(out.right, 3000)).toBeGreaterThan(at(out.left, 3000) * 20);
    const mid = 1000;
    expect(at(out.left, mid)).toBeCloseTo(at(out.right, mid), 2);
  });

  it("the automated value replaces the static one on that parameter only", () => {
    const track = baseTrack({ gainDb: -6, pan: 0.5, automation: gainAuto([{ t: 0, v: -12 }]) });
    const out = renderTrack(input(track), track, false);
    const staticPanOnly = renderTrack(input(baseTrack({ gainDb: -12, pan: 0.5 })), baseTrack({ gainDb: -12, pan: 0.5 }), false);
    expect(at(out.left, 1500)).toBeCloseTo(at(staticPanOnly.left, 1500), 6);
    expect(at(out.right, 1500)).toBeCloseTo(at(staticPanOnly.right, 1500), 6);
  });

  it("raw / stem renders drop the automation", () => {
    const track = baseTrack({ automation: gainAuto([{ t: 0, v: -40 }]) });
    const raw = prepareMixInput(input(track), { raw: true });
    expect(raw.tracks[0].automation).toBeUndefined();
    const out = renderTrack(raw, raw.tracks[0], false);
    const flat = renderTrack(input(baseTrack()), baseTrack(), false);
    expect(at(out.left, 1000)).toBeCloseTo(at(flat.left, 1000), 6);
  });

  it("a muted track stays silent", () => {
    const track = baseTrack({ muted: true, automation: gainAuto([{ t: 0, v: 0 }]) });
    expect(renderTrack(input(track), track, false).audible).toBe(false);
  });
});

describe("automation — engine schedule", () => {
  const eng = (over: Partial<StudioEngineTrack> = {}): StudioEngineTrack => ({ id: "t", gainDb: 0, pan: 0, muted: false, solo: false, ...over });

  it("is null for a track without automation", () => {
    expect(trackAutomationSchedule(eng(), false, 0)).toEqual({ gain: null, pan: null });
  });

  it("gain events sit on the dB envelope (dense), ending on the last point", () => {
    const t = eng({ automation: gainAuto([{ t: 0, v: -24 }, { t: 2000, v: 0 }]) });
    const plan = trackAutomationSchedule(t, false, 0);
    expect(plan.pan).toBeNull();
    expect(plan.gain!.start).toBeCloseTo(dbToLin(-24), 6);
    const last = plan.gain!.events[plan.gain!.events.length - 1];
    expect(last).toEqual({ atMs: 2000, value: 1 });
    for (const e of plan.gain!.events) {
      expect(e.value).toBeCloseTo(dbToLin(evalAutomation(t.automation!.lanes[0].points, e.atMs, 0)), 6);
    }
    // dense enough that a linear-in-amplitude ramp between events stays close to the dB curve
    expect(plan.gain!.events.length).toBeGreaterThan(20);
  });

  it("starts from the playhead, not from zero", () => {
    const t = eng({ automation: gainAuto([{ t: 0, v: -24 }, { t: 2000, v: 0 }]) });
    const plan = trackAutomationSchedule(t, false, 1000);
    expect(plan.gain!.start).toBeCloseTo(dbToLin(-12), 6);
    expect(plan.gain!.events[plan.gain!.events.length - 1]).toEqual({ atMs: 1000, value: 1 });
    expect(trackAutomationSchedule(t, false, 5000).gain).toEqual({ start: 1, events: [] });
  });

  it("pan needs only the points (linear in both)", () => {
    const t = eng({ automation: panAuto([{ t: 0, v: -1 }, { t: 1000, v: 1 }, { t: 3000, v: 0 }]) });
    const plan = trackAutomationSchedule(t, false, 500);
    expect(plan.pan!.start).toBeCloseTo(0, 6);
    expect(plan.pan!.events).toEqual([
      { atMs: 500, value: 1 },
      { atMs: 2500, value: 0 },
    ]);
  });

  it("mute and solo keep winning over the envelope", () => {
    const auto = gainAuto([{ t: 0, v: 0 }, { t: 1000, v: -6 }]);
    expect(trackAutomationSchedule(eng({ muted: true, automation: auto }), false, 0).gain).toEqual({ start: 0, events: [] });
    expect(trackAutomationSchedule(eng({ solo: false, automation: auto }), true, 0).gain).toEqual({ start: 0, events: [] });
    expect(trackAutomationSchedule(eng({ solo: true, automation: auto }), true, 0).gain!.events.length).toBeGreaterThan(0);
  });

  it("caps the number of events on long envelopes", () => {
    const t = eng({ automation: gainAuto([{ t: 0, v: -30 }, { t: 3_000_000, v: 0 }]) });
    const plan = trackAutomationSchedule(t, false, 0, { maxEvents: 500 });
    expect(plan.gain!.events.length).toBeLessThanOrEqual(501);
  });
});
