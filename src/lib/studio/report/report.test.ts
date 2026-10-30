import { describe, expect, it } from "vitest";

import type { StudioTrackRole } from "@/config/studio";
import type { MixMetrics, TrackMetrics } from "@/lib/studio/mix-analysis/metrics";
import { buildMixVerdict } from "@/lib/studio/mix-analysis/verdict";
import { applyMixOpsToDocument, MIX_AUTOFIX_ALL, planMixAutofix } from "@/lib/studio/mix-autofix/plan";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";
import pl from "../../../../messages/pl.json";
import en from "../../../../messages/en.json";

import { buildChangeReport, buildMasterReport } from "./change-report";
import { checkPlatforms } from "./platforms";

const PID = "33333333-3333-4333-8333-333333333333";
const LEAD = "aaaaaaaa-0000-4000-8000-000000000001";
const AD = "aaaaaaaa-0000-4000-8000-000000000002";
const BEAT = "aaaaaaaa-0000-4000-8000-000000000005";
let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const track = (id: string, name: string, role: StudioTrackRole, sortOrder: number): StudioTrackDto =>
  ({ id, projectId: PID, name, trackType: "AUDIO", trackRole: role, sortOrder, gainDb: 0, pan: 0, muted: false, solo: false, recordArmed: false, inputDeviceHint: null, outputRoute: "master", effectsChain: emptyStudioFxChain() }) as StudioTrackDto;
const doc = (): StudioProjectDocument =>
  ({
    project: { id: PID, title: "t", status: "DRAFT", tempoBpm: 120, timelineLengthMs: 60000, beatId: null, updatedAt: "", createdAt: "", timeSignatureNum: 4, timeSignatureDen: 4, masterGainDb: 0, masterPan: 0, masterFxChain: emptyStudioFxChain(), documentVersion: 3, schemaVersion: 1 },
    tracks: [track(LEAD, "Wokal", "lead_vocal", 1), track(AD, "Adlib", "adlib", 2), track(BEAT, "Bit", "beat", 0)],
    clips: [],
  }) as unknown as StudioProjectDocument;
const tm = (id: string, role: StudioTrackRole, lufs: number, x: Partial<TrackMetrics> = {}): TrackMetrics => ({ trackId: id, name: id, role, pan: 0, audible: true, hasAudio: true, integratedLufs: lufs, shortTermMaxLufs: lufs + 4, samplePeakDbfs: lufs + 12, clipEvents: 0, noiseFloorDbfs: -70, ...x });
const metrics = (leadLufs = -20): MixMetrics => ({
  sampleRate: 32000, durationSeconds: 60,
  tracks: [tm(LEAD, "lead_vocal", leadLufs, { samplePeakDbfs: 0, clipEvents: 14 }), tm(AD, "adlib", -18, { noiseFloorDbfs: -40 }), tm(BEAT, "beat", -14)],
  master: { integratedLufs: -12, shortTermMaxLufs: -9, lraLu: 5, samplePeakDbfs: 0, truePeakDbtp: 0.8, clipEvents: 20, correlation: 0.6, widthDb: -10 },
  vocalStem: { integratedLufs: -20, shortTermMaxLufs: -16 }, beatStem: { integratedLufs: -14, shortTermMaxLufs: -10 },
  vocalVsBeatLu: -6.5, presenceDb: -2, maskingPercent: 30, sibilanceDb: 10,
});

describe("per-track change report", () => {
  it("lists what the auto-fix did, per track, in track order, with measured loudness", () => {
    seq = 0;
    const before = doc();
    const m = metrics();
    const plan = planMixAutofix({ doc: before, metrics: m, verdict: buildMixVerdict(m), fixes: MIX_AUTOFIX_ALL, createId: nextId });
    expect(plan.ops.length).toBeGreaterThan(0);
    const after = applyMixOpsToDocument(before, plan.ops);
    const r = buildChangeReport({ before, after, metricsBefore: m, metricsAfter: metrics(-17) });
    expect(r.changedTracks).toBeGreaterThan(0);
    const lead = r.tracks.find((t) => t.trackId === LEAD)!;
    const keys = lead.items.map((i) => i.key);
    expect(keys).toContain("fxAdded");
    expect(keys).toContain("loudnessMeasured");
    const meas = lead.items.find((i) => i.key === "loudnessMeasured")!;
    expect(meas.params).toEqual({ from: -20, to: -17, delta: 3 });
    // sortOrder: Bit(0) before Wokal(1) before Adlib(2)
    const order = r.tracks.map((t) => t.trackId);
    expect([...order].sort((a, b) => [BEAT, LEAD, AD].indexOf(a) - [BEAT, LEAD, AD].indexOf(b))).toEqual(order);
    expect(r.totalItems).toBe(r.tracks.reduce((n, t) => n + t.items.length, 0));
  });

  it("gain / pan / mute / fx param + bypass + removal diffs", () => {
    const before = doc();
    before.tracks[0]!.effectsChain = { schemaVersion: 1, effects: [
      { id: "e1", type: "compressor", enabled: true, params: { thresholdDb: -20, ratio: 3, attackMs: 5, releaseMs: 120, makeupDb: 0 } },
      { id: "e2", type: "reverb", enabled: true, params: { mix: 0.2, decaySeconds: 1.5 } },
    ] } as never;
    const after = structuredClone(before);
    after.tracks[0]!.gainDb = -2.5;
    after.tracks[0]!.pan = -0.4;
    after.tracks[0]!.muted = true;
    after.tracks[0]!.effectsChain = { schemaVersion: 1, effects: [{ ...before.tracks[0]!.effectsChain.effects[0]!, enabled: false, params: { thresholdDb: -24, ratio: 4, attackMs: 5, releaseMs: 120, makeupDb: 0 } }] } as never;
    const r = buildChangeReport({ before, after });
    const items = r.tracks[0]!.items;
    expect(items.map((i) => i.key)).toEqual(["gainDown", "panMove", "muted", "fxOff", "fxChanged", "fxRemoved"]);
    expect(items[0]!.params).toEqual({ from: 0, to: -2.5, delta: 2.5 });
    const ch = items[4]!.params as { changes: { from: number; to: number }[] };
    expect(ch.changes.map((c) => [c.from, c.to])).toEqual([[-20, -24], [3, 4]]);
  });

  it("no changes → empty report; no loudness line without a real change", () => {
    const d = doc();
    expect(buildChangeReport({ before: d, after: structuredClone(d), metricsBefore: metrics(), metricsAfter: metrics(-15) })).toEqual({ tracks: [], changedTracks: 0, totalItems: 0 });
  });

  it("master report: loudness, peaks, dynamics, own settings", () => {
    const items = buildMasterReport({ mix: { lufs: -18.2, truePeakDb: 0.4, lraLu: 7 }, master: { lufs: -9.1, truePeakDb: -1, lra: 5.2 }, target: "streaming", settings: { loudness: 0, bright: 1, bass: 0, width: 0, squash: 0 }, tpCeiling: -1 });
    expect(items).toEqual([
      { key: "target", params: { target: "streaming" } },
      { key: "loudnessUp", params: { from: -18.2, to: -9.1, delta: 9.1 } },
      { key: "peakTamed", params: { from: 0.4, to: -1 } },
      { key: "dynamics", params: { from: 7, to: 5.2 } },
      { key: "setting", params: { setting: "bright", value: 1 } },
    ]);
    expect(buildMasterReport({ mix: null, master: { lufs: -9, truePeakDb: -0.2 }, target: "club", settings: {}, tpCeiling: -0.3 }).map((i) => i.key)).toEqual(["target", "peakOver"]);
  });
});

describe("platform loudness check", () => {
  it("loud master: every platform turns it down; TP warning for loud masters", () => {
    const c = checkPlatforms(-9, -1)!;
    const g = Object.fromEntries(c.platforms.map((p) => [p.id, p.gainDb]));
    expect(g).toEqual({ spotify: -5, youtube: -5, apple: -7, tiktok: -5 });
    expect(c.tp).toEqual({ status: "warn", ceiling: -2 });
    expect(c.platforms.find((p) => p.id === "tiktok")!.published).toBe(false);
  });
  it("quiet master: YouTube/TikTok leave it, Spotify/Apple turn up only as far as peaks allow", () => {
    const c = checkPlatforms(-20, -5)!;
    const by = Object.fromEntries(c.platforms.map((p) => [p.id, p]));
    expect(by.youtube!.gainDb).toBe(0);
    expect(by.tiktok!.kind).toBe("same");
    expect(by.spotify!.gainDb).toBe(4); // Spotify's own example: −20 LUFS peaking −5 → lifted to −16
    expect(by.spotify!.peakLimited).toBe(true);
    expect(by.spotify!.playbackLufs).toBe(-16);
    expect(by.apple!.gainDb).toBe(4);
    expect(by.apple!.peakLimited).toBe(false);
    expect(c.tp.status).toBe("ok");
  });
  it("TP above −1 dBTP is over; non-finite input → null", () => {
    expect(checkPlatforms(-14, -0.3)!.tp.status).toBe("over");
    expect(checkPlatforms(-Infinity, -3)).toBeNull();
  });
});

describe("report i18n", () => {
  const keys = (o: unknown, pre = ""): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));
  it("PL and EN have the same report keys", () => {
    expect(keys((pl as { studio: { report: unknown } }).studio.report).sort()).toEqual(keys((en as { studio: { report: unknown } }).studio.report).sort());
  });
});
