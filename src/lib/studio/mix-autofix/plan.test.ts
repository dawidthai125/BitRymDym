import { describe, expect, it } from "vitest";

import type { MixMetrics, TrackMetrics } from "@/lib/studio/mix-analysis/metrics";
import { buildMixVerdict } from "@/lib/studio/mix-analysis/verdict";
import {
  applyMixOpsToDocument,
  autofixBpm,
  inverseMixAutofixOps,
  MIX_AUTOFIX_ALL,
  MIX_CARD_FIXES,
  planMixAutofix,
  upsertFx,
} from "@/lib/studio/mix-autofix/plan";
import { validateMixWorkingOps } from "@/lib/studio/mix-working/mix-working-ops";
import { emptyStudioFxChain, parseStudioFxChainForWrite, type StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";
import type { StudioTrackRole } from "@/config/studio";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pl from "../../../../messages/pl.json";
import en from "../../../../messages/en.json";

const PID = "33333333-3333-4333-8333-333333333333";
let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function track(id: string, name: string, role: StudioTrackRole, extra: Partial<StudioTrackDto> = {}): StudioTrackDto {
  return {
    id,
    projectId: PID,
    name,
    trackType: "AUDIO",
    trackRole: role,
    sortOrder: 0,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    recordArmed: false,
    inputDeviceHint: null,
    outputRoute: "master",
    effectsChain: emptyStudioFxChain(),
    ...extra,
  } as StudioTrackDto;
}

const LEAD = "aaaaaaaa-0000-4000-8000-000000000001";
const AD1 = "aaaaaaaa-0000-4000-8000-000000000002";
const AD2 = "aaaaaaaa-0000-4000-8000-000000000003";
const DBL = "aaaaaaaa-0000-4000-8000-000000000004";
const BEAT = "aaaaaaaa-0000-4000-8000-000000000005";

function doc(tempoBpm = 120, tracks?: StudioTrackDto[]): StudioProjectDocument {
  return {
    project: {
      id: PID,
      title: "t",
      status: "DRAFT",
      tempoBpm,
      timelineLengthMs: 60000,
      beatId: null,
      updatedAt: "",
      createdAt: "",
      timeSignatureNum: 4,
      timeSignatureDen: 4,
      masterGainDb: 0,
      masterPan: 0,
      masterFxChain: emptyStudioFxChain(),
      documentVersion: 3,
      schemaVersion: 1,
    },
    tracks: tracks ?? [
      track(LEAD, "Wokal", "lead_vocal", { pan: 0.3 }),
      track(AD1, "Adlib 1", "adlib"),
      track(AD2, "Adlib 2", "adlib"),
      track(DBL, "Dubel", "double"),
      track(BEAT, "Bit", "beat"),
    ],
    clips: [],
  } as StudioProjectDocument;
}

function tm(id: string, role: StudioTrackRole, lufs: number, extra: Partial<TrackMetrics> = {}): TrackMetrics {
  return {
    trackId: id,
    name: id,
    role,
    pan: 0,
    audible: true,
    hasAudio: true,
    integratedLufs: lufs,
    shortTermMaxLufs: lufs + 4,
    samplePeakDbfs: lufs + 12,
    clipEvents: 0,
    noiseFloorDbfs: role === "beat" ? null : -70,
    ...extra,
  };
}

/** A "bad" mix: buried vocal, clipping lead, harsh s, noisy adlib, hot master. */
function badMetrics(): MixMetrics {
  return {
    sampleRate: 32000,
    durationSeconds: 60,
    tracks: [
      tm(LEAD, "lead_vocal", -20, { samplePeakDbfs: 0, clipEvents: 14 }),
      tm(AD1, "adlib", -18, { noiseFloorDbfs: -40 }),
      tm(AD2, "adlib", -30, { noiseFloorDbfs: -52 }),
      tm(DBL, "double", -22),
      tm(BEAT, "beat", -14),
    ],
    master: {
      integratedLufs: -12,
      shortTermMaxLufs: -9,
      lraLu: 5,
      samplePeakDbfs: 0,
      truePeakDbtp: 0.8,
      clipEvents: 20,
      correlation: 0.6,
      widthDb: -10,
    },
    vocalStem: { integratedLufs: -20, shortTermMaxLufs: -16 },
    beatStem: { integratedLufs: -14, shortTermMaxLufs: -10 },
    vocalVsBeatLu: -6.5,
    presenceDb: -2,
    maskingPercent: 30,
    sibilanceDb: 10,
  };
}

function plan(fixes = MIX_AUTOFIX_ALL, d = doc(), m = badMetrics()) {
  seq = 0;
  return planMixAutofix({ doc: d, metrics: m, verdict: buildMixVerdict(m), fixes, createId: nextId });
}

function chainOf(p: ReturnType<typeof plan>, trackId: string): StudioFxChainV1 | undefined {
  const op = p.ops.find((o) => o.op === "set_track_fx" && o.trackId === trackId);
  return op && op.op === "set_track_fx" ? op.effectsChain : undefined;
}

function controls(p: ReturnType<typeof plan>, trackId: string) {
  const op = p.ops.find((o) => o.op === "set_track_controls" && o.trackId === trackId);
  return op && op.op === "set_track_controls" ? op : undefined;
}

describe("Stage 2 autofix — card mapping", () => {
  it("each card maps to its fixes; stereo has none", () => {
    expect(MIX_CARD_FIXES.sibilance).toEqual(["deesser"]);
    expect(MIX_CARD_FIXES.balance).toEqual(["balance", "compression"]);
    expect(MIX_CARD_FIXES.stereo).toEqual([]);
    expect(MIX_AUTOFIX_ALL).toContain("space");
  });
});

describe("Stage 2 autofix — parameters from metrics", () => {
  it("gain staging: clipping lead trimmed to −6 dBFS peak, hot master pulled to −6 dBTP", () => {
    const p = plan(["gain"]);
    expect(controls(p, LEAD)?.gainDb).toBe(-6);
    const master = p.ops.find((o) => o.op === "set_master_mix");
    expect(master && master.op === "set_master_mix" ? master.masterGainDb : null).toBe(-6.8);
    expect(p.notes.map((n) => n.key)).toEqual(["gainClipTrack", "gainMasterDown"]);
  });

  it("balance: buried vocal (−6.5 LU) → +4 dB vocal / −4 dB beat to hit +1.5 LU; side vocals under the lead", () => {
    const p = plan(["balance"]);
    expect(controls(p, LEAD)?.gainDb).toBe(4);
    expect(controls(p, BEAT)?.gainDb).toBe(-4);
    // lead after = −16 LUFS → adlib target −22 (AD1 −18 → −4 dB; AD2 −30 → +8), double −24 (−22 → −2)
    expect(controls(p, AD1)?.gainDb).toBe(-4);
    expect(controls(p, AD2)?.gainDb).toBe(8);
    expect(controls(p, DBL)?.gainDb).toBe(-2);
  });

  it("balance in range → no change", () => {
    const m = badMetrics();
    m.vocalVsBeatLu = 1.8;
    m.tracks = [tm(LEAD, "lead_vocal", -16), tm(BEAT, "beat", -18)];
    const p = plan(["balance"], doc(120, [track(LEAD, "Wokal", "lead_vocal"), track(BEAT, "Bit", "beat")]), m);
    expect(p.ops).toEqual([]);
    expect(p.unchanged).toEqual(["balance"]);
  });

  it("EQ: beat bell −3.5 dB @2.5 kHz when masking is red; vocal HPF 90/120 Hz + presence", () => {
    const p = plan(["eq"]);
    const beat = chainOf(p, BEAT)!.effects[0]!;
    expect(beat.type).toBe("eq");
    expect(beat.type === "eq" && beat.params.mid).toEqual({ frequencyHz: 2500, gainDb: -3.5, q: 0.9 });
    const lead = chainOf(p, LEAD)!;
    expect(lead.effects.map((e) => e.type)).toEqual(["highpass", "eq"]);
    expect(lead.effects[0]!.params).toEqual({ frequencyHz: 90, q: 0.707 });
    const ad = chainOf(p, AD1)!;
    expect(ad.effects[0]!.params).toMatchObject({ frequencyHz: 120 });
    const eq = lead.effects[1]!;
    expect(eq.type === "eq" && eq.params.mid).toEqual({ frequencyHz: 3500, gainDb: 2, q: 1 });
    expect(eq.type === "eq" && eq.params.low.gainDb).toBe(-2);
  });

  it("EQ yellow → gentler −2 dB beat cut", () => {
    const m = badMetrics();
    m.presenceDb = 1;
    m.maskingPercent = 15;
    const p = plan(["eq"], doc(), m);
    const e = chainOf(p, BEAT)!.effects[0]!;
    expect(e.type === "eq" && e.params.mid.gainDb).toBe(-2);
  });

  it("de-esser: red sibilance → ratio 6, threshold = vocal LUFS − 9, 6.5 kHz", () => {
    const p = plan(["deesser"]);
    const d = chainOf(p, LEAD)!.effects.find((e) => e.type === "deesser")!;
    expect(d.params).toEqual({ frequencyHz: 6500, thresholdDb: -29, ratio: 6 });
    const m = badMetrics();
    m.sibilanceDb = 6;
    const y = plan(["deesser"], doc(), m);
    expect(chainOf(y, LEAD)!.effects[0]!.params).toEqual({ frequencyHz: 6500, thresholdDb: -26, ratio: 4 });
  });

  it("compression: lead 3:1, side 2.5:1, threshold from LUFS (+2, clamped)", () => {
    const p = plan(["compression"]);
    expect(chainOf(p, LEAD)!.effects[0]!.params).toEqual({
      thresholdDb: -18,
      ratio: 3,
      attackMs: 10,
      releaseMs: 120,
      makeupDb: 2,
    });
    expect(chainOf(p, AD1)!.effects[0]!.params).toMatchObject({ ratio: 2.5, thresholdDb: -16 });
    expect(chainOf(p, BEAT)).toBeUndefined();
  });

  it("denoise: gate only on noisy vocals (floor + 6), range 20 dB when loud noise, plus HPF", () => {
    const p = plan(["denoise"]);
    expect(chainOf(p, LEAD)).toBeUndefined();
    const ad1 = chainOf(p, AD1)!;
    expect(ad1.effects.map((e) => e.type)).toEqual(["highpass", "gate"]);
    expect(ad1.effects[1]!.params).toEqual({ thresholdDb: -34, rangeDb: 20, releaseMs: 150 });
    expect(chainOf(p, AD2)!.effects[1]!.params).toMatchObject({ thresholdDb: -46, rangeDb: 12 });
  });

  it("panorama: lead centred, adlibs alternate L/R 40 %, doubles 70 %", () => {
    const p = plan(["panorama"]);
    expect(controls(p, LEAD)?.pan).toBe(0);
    expect(controls(p, AD1)?.pan).toBe(-0.4);
    expect(controls(p, AD2)?.pan).toBe(0.4);
    expect(controls(p, DBL)?.pan).toBe(-0.7);
    expect(controls(p, BEAT)).toBeUndefined();
  });

  it("space: delay synced to BPM (1/8 lead, 1/4 adlibs), deeper reverb on adlibs", () => {
    const p = plan(["space"], doc(120));
    const lead = chainOf(p, LEAD)!;
    expect(lead.effects.map((e) => e.type)).toEqual(["delay", "reverb"]);
    expect(lead.effects[0]!.params).toEqual({ mix: 0.12, timeMs: 250, feedback: 0.2 });
    expect(lead.effects[1]!.params).toEqual({ mix: 0.12, decaySeconds: 1 });
    const ad = chainOf(p, AD1)!;
    expect(ad.effects[0]!.params).toEqual({ mix: 0.22, timeMs: 500, feedback: 0.3 });
    expect(ad.effects[1]!.params).toEqual({ mix: 0.25, decaySeconds: 1.3 });
    expect(autofixBpm(doc(0))).toBe(90);
    const slow = plan(["space"], doc(60));
    expect(chainOf(slow, LEAD)!.effects[0]!.params).toMatchObject({ timeMs: 500 });
  });

  it("„Popraw wszystko”: canonical FX order, valid ops, idempotent second run", () => {
    const p = plan();
    expect(chainOf(p, LEAD)!.effects.map((e) => e.type)).toEqual([
      "highpass",
      "eq",
      "compressor",
      "deesser",
      "delay",
      "reverb",
    ]);
    expect(chainOf(p, AD1)!.effects.map((e) => e.type)).toEqual([
      "highpass",
      "gate",
      "eq",
      "compressor",
      "deesser",
      "delay",
      "reverb",
    ]);
    const d = doc();
    expect(() => validateMixWorkingOps({ document: d, ops: p.ops })).not.toThrow();
    for (const op of p.ops) {
      if (op.op === "set_track_fx") parseStudioFxChainForWrite(op.effectsChain, { role: "track" });
    }
    // Same metrics on the fixed doc → FX params identical, no FX ops.
    const after = applyMixOpsToDocument(d, p.ops);
    const again = plan(["eq", "deesser", "denoise", "space"], after);
    expect(again.ops.filter((o) => o.op === "set_track_fx")).toEqual([]);
  });

  it("respects the 8-effect limit and tells the user", () => {
    const full: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: Array.from({ length: 8 }, (_, i) => ({
        id: `00000000-0000-4000-9000-00000000000${i}`,
        type: "limiter" as const,
        enabled: false,
        params: { thresholdDb: -1, ceilingDb: -0.3 },
      })),
    };
    const d = doc(120, [track(LEAD, "Wokal", "lead_vocal", { effectsChain: full }), track(BEAT, "Bit", "beat")]);
    const m = badMetrics();
    m.tracks = [m.tracks[0]!, m.tracks[4]!];
    const p = plan(["deesser"], d, m);
    expect(chainOf(p, LEAD)).toBeUndefined();
    expect(p.notes[0]?.key).toBe("chainFull");
  });

  it("undo: inverse ops restore the original document mix plane", () => {
    const d = doc();
    const p = plan(MIX_AUTOFIX_ALL, d);
    const after = applyMixOpsToDocument(d, p.ops);
    const back = applyMixOpsToDocument(after, inverseMixAutofixOps(d, p.ops));
    expect(back.tracks).toEqual(d.tracks);
    expect(back.project).toEqual(d.project);
  });

  it("notes are first-person keys with track names", () => {
    const p = plan();
    expect(p.notes.length).toBeGreaterThan(10);
    expect(p.notes.find((n) => n.key === "spaceSide")?.params).toMatchObject({ track: "Adlib 1", note: "1/4", ms: 500 });
  });
});

describe("Stage 2 autofix — i18n", () => {
  it("every BITEK note key exists in PL and EN (first person, with the same placeholders)", () => {
    const src = readFileSync(join(__dirname, "plan.ts"), "utf8");
    const keys = [...new Set([...src.matchAll(/note\(\s*ctx,\s*(?:[^,]*\?\s*)?"(\w+)"(?:\s*:\s*"(\w+)")?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean))];
    const plNotes = pl.studio.mixStep.autofix.notes as Record<string, string>;
    const enNotes = en.studio.mixStep.autofix.notes as Record<string, string>;
    const slots = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
    expect(keys.length).toBeGreaterThan(15);
    for (const k of keys) {
      expect(plNotes[k!], k).toBeTruthy();
      expect(slots(enNotes[k!]!), k).toBe(slots(plNotes[k!]!));
    }
    for (const text of Object.values(plNotes)) expect(text).toMatch(/(łem|łam|łem też|Dodałem|Ustawiłem)/);
  });
});

describe("upsertFx canonical order", () => {
  it("inserts highpass before compressor and updates in place", () => {
    let n = 0;
    const id = () => `00000000-0000-4000-8000-00000000000${n++}`;
    const comp = upsertFx(emptyStudioFxChain(), "compressor", (p) => p, id)!;
    const both = upsertFx(comp, "highpass", (p) => ({ ...p, frequencyHz: 100 }), id)!;
    expect(both.effects.map((e) => e.type)).toEqual(["highpass", "compressor"]);
    const again = upsertFx(both, "highpass", (p) => ({ ...p, frequencyHz: 120 }), id)!;
    expect(again.effects).toHaveLength(2);
    expect((again.effects[0]!.params as { frequencyHz: number }).frequencyHz).toBe(120);
  });
});
