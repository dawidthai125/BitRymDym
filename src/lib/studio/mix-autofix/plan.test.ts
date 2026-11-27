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
  denoiseGate,
} from "@/lib/studio/mix-autofix/plan";
import { validateMixWorkingOps } from "@/lib/studio/mix-working/mix-working-ops";
import {
  emptyStudioFxChain,
  parseStudioFxChainForWrite,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  type StudioFxChainV1,
} from "@/lib/studio/studio-fx-chain";
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

  it("gain staging: a very hot master is not cut into a very quiet mix (−24 LUFS floor)", () => {
    const m = badMetrics();
    m.master.truePeakDbtp = 8;
    m.master.integratedLufs = -20;
    const p = plan(["gain"], doc(), m);
    const master = p.ops.find((o) => o.op === "set_master_mix");
    const db = master && master.op === "set_master_mix" ? master.masterGainDb : 0;
    expect(db).toBeGreaterThanOrEqual(-4);
  });

  it("gain staging: a small over (+0.5 dBTP) is cut in full", () => {
    const m = badMetrics();
    m.master.truePeakDbtp = 0.5;
    m.master.integratedLufs = -23;
    const p = plan(["gain"], doc(), m);
    const master = p.ops.find((o) => o.op === "set_master_mix");
    expect(master && master.op === "set_master_mix" ? master.masterGainDb : null).toBe(-6.5);
  });

  it("balance: a buried vocal comes up first, the beat stays; side vocals under the lead", () => {
    const m = badMetrics();
    m.tracks[0] = tm(LEAD, "lead_vocal", -20, { samplePeakDbfs: -11 });
    const p = plan(["balance"], doc(), m);
    expect(controls(p, LEAD)?.gainDb).toBe(8);
    expect(controls(p, BEAT)).toBeUndefined();
    expect(p.notes[0]).toMatchObject({ key: "balanceVocalOnlyUp", params: { up: "8" } });
    // lead after = −12 LUFS → adlib target −18 (AD1 −18 stays; AD2 −30 → +9 step limit), double −20 (−22 → +2)
    expect(controls(p, AD1)?.gainDb).toBeUndefined();
    expect(controls(p, AD2)?.gainDb).toBe(9);
    expect(controls(p, DBL)?.gainDb).toBe(2);
  });

  it("balance: the beat gives way only for what the vocal's peaks do not allow", () => {
    const m = badMetrics();
    m.tracks = [tm(LEAD, "lead_vocal", -20, { samplePeakDbfs: -7 }), tm(BEAT, "beat", -14)];
    const p = plan(["balance"], doc(120, [track(LEAD, "Wokal", "lead_vocal"), track(BEAT, "Bit", "beat")]), m);
    expect(controls(p, LEAD)?.gainDb).toBe(5);
    expect(controls(p, BEAT)?.gainDb).toBe(-3);
    expect(p.notes[0]).toMatchObject({ key: "balanceVocalUp", params: { up: "5", down: "3" } });
  });

  it("„Zrób utwór”: quiet vocal + beat peaking at 0 dBFS never costs the beat more than 6 dB", () => {
    const quiet = (gains: { vox: number; beat: number }, d: number, peak: number) => {
      const m = badMetrics();
      m.vocalVsBeatLu = d;
      m.tracks = [tm(LEAD, "lead_vocal", -24, { samplePeakDbfs: peak }), tm(BEAT, "beat", -11, { samplePeakDbfs: -6 + gains.beat + 6, clipEvents: gains.beat === 0 ? 3 : 0 })];
      const tracks = [track(LEAD, "Wokal", "lead_vocal", { gainDb: gains.vox }), track(BEAT, "Bit", "beat", { gainDb: gains.beat })];
      return plan(MIX_AUTOFIX_ALL, doc(120, tracks), m);
    };
    const first = quiet({ vox: 0, beat: 0 }, -13, -14);
    // The −6 dB peak trim already helps the balance: 13 + 1.5 − 6 = 8.5 left, all from the vocal.
    expect(controls(first, BEAT)?.gainDb).toBe(-6);
    expect(controls(first, LEAD)?.gainDb).toBe(8.5);
    // Next round with the vocal still buried: the beat stays at the floor.
    const second = quiet({ vox: 8.5, beat: -6 }, -8, -3);
    expect(controls(second, BEAT)).toBeUndefined();
    expect(controls(second, LEAD)?.gainDb).toBe(9.5);
    expect(second.notes.map((n) => n.key)).toContain("balanceVocalTooQuiet");
  });

  it("balance: too loud a vocal goes down; the beat rises only within its peaks", () => {
    const m = badMetrics();
    m.vocalVsBeatLu = 7.5;
    m.tracks = [tm(LEAD, "lead_vocal", -10), tm(BEAT, "beat", -18, { samplePeakDbfs: -7 })];
    const tracks = [track(LEAD, "Wokal", "lead_vocal"), track(BEAT, "Bit", "beat")];
    const p = plan(["balance"], doc(120, tracks), m);
    expect(controls(p, LEAD)?.gainDb).toBe(-5);
    expect(controls(p, BEAT)?.gainDb).toBe(1);
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
    // 200–350 Hz dip on the beat and on every vocal.
    expect(chainOf(p, BEAT)!.effects[1]).toMatchObject({ type: "spectrum", params: { b1: -2 } });
    expect(beat.type).toBe("eq");
    expect(beat.type === "eq" && beat.params.mid).toEqual({ frequencyHz: 2500, gainDb: -3.5, q: 0.9 });
    const lead = chainOf(p, LEAD)!;
    expect(lead.effects.map((e) => e.type)).toEqual(["highpass", "eq", "spectrum"]);
    expect(lead.effects[2]!.params).toMatchObject({ b1: -3.5, b0: 0, b2: 0 });
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
    expect(d.params).toEqual({ frequencyHz: 6500, thresholdDb: -31, ratio: 6 });
    const m = badMetrics();
    m.sibilanceDb = 6;
    const y = plan(["deesser"], doc(), m);
    expect(chainOf(y, LEAD)!.effects[0]!.params).toEqual({ frequencyHz: 6500, thresholdDb: -29, ratio: 4 });
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

  it("denoise: gate only on noisy vocals (floor + 6), Producent range 8 dB + HPF 80 Hz", () => {
    const p = plan(["denoise"]);
    expect(chainOf(p, LEAD)).toBeUndefined();
    const ad1 = chainOf(p, AD1)!;
    expect(ad1.effects.map((e) => e.type)).toEqual(["highpass", "gate"]);
    expect(ad1.effects[0]!.params).toEqual({ frequencyHz: 80, q: 0.707 });
    expect(ad1.effects[1]!.params).toEqual({
      thresholdDb: -34,
      rangeDb: 8,
      attackMs: 2,
      holdMs: 40,
      releaseMs: 100,
    });
    expect(chainOf(p, AD2)!.effects[1]!.params).toMatchObject({
      thresholdDb: -46,
      rangeDb: 8,
      attackMs: 2,
      holdMs: 40,
      releaseMs: 100,
    });
  });

  it("denoise: a clean-enough take gets a deeper gate over the noise peaks, never close to the voice", () => {
    // Voice 31 dB over the noise: threshold = floor + 20 (above the noise peaks), cut 18 dB.
    expect(denoiseGate(-56, -25)).toEqual({ thresholdDb: -36, rangeDb: 18 });
    // The ceiling is 10 dB under the voice.
    expect(denoiseGate(-50, -25)).toEqual({ thresholdDb: -35, rangeDb: 18 });
    // Little room between voice and noise: the gentle gate stays.
    expect(denoiseGate(-40, -22)).toEqual({ thresholdDb: -34, rangeDb: 8 });
  });

  it("denoise: a later pass leaves the gate it set alone (it would measure the noise behind it)", () => {
    const d = doc();
    const first = applyMixOpsToDocument(d, plan(["denoise"], d).ops);
    const before = first.tracks.find((t) => t.id === AD1)!.effectsChain.effects.find((e) => e.type === "gate")!;
    const m = badMetrics();
    const t = m.tracks.find((x) => x.trackId === AD1)!;
    t.noiseFloorDbfs = (t.noiseFloorDbfs as number) - 8;
    const second = applyMixOpsToDocument(first, plan(["denoise"], first, m).ops);
    const after = second.tracks.find((x) => x.id === AD1)!.effectsChain.effects.find((e) => e.type === "gate")!;
    expect(after.type === "gate" && before.type === "gate" && after.params.thresholdDb).toBe(before.type === "gate" ? before.params.thresholdDb : 0);
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
    expect(lead.effects[0]!.params).toEqual({ mix: 0.04, timeMs: 250, feedback: 0.2 });
    expect(lead.effects[1]!.params).toEqual({ mix: 0.04, decaySeconds: 0.6 });
    const ad = chainOf(p, AD1)!;
    expect(ad.effects[0]!.params).toEqual({ mix: 0.16, timeMs: 500, feedback: 0.3 });
    expect(ad.effects[1]!.params).toEqual({ mix: 0.18, decaySeconds: 0.8 });
    expect(autofixBpm(doc(0))).toBe(90);
    const slow = plan(["space"], doc(60));
    expect(chainOf(slow, LEAD)!.effects[0]!.params).toMatchObject({ timeMs: 500 });
  });

  it("„Popraw wszystko”: canonical FX order, valid ops, idempotent second run", () => {
    const p = plan();
    expect(chainOf(p, LEAD)!.effects.map((e) => e.type)).toEqual([
      "highpass",
      "eq",
      "spectrum",
      "compressor",
      "deesser",
      "delay",
      "reverb",
    ]);
    expect(chainOf(p, AD1)!.effects.map((e) => e.type)).toEqual([
      "highpass",
      "gate",
      "eq",
      "spectrum",
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
    // The fixed doc measured again (levels moved with the faders) → FX params identical, no FX ops.
    const after = applyMixOpsToDocument(d, p.ops);
    const m = badMetrics();
    for (const t of m.tracks) {
      const by = after.tracks.find((x) => x.id === t.trackId)!.gainDb - d.tracks.find((x) => x.id === t.trackId)!.gainDb;
      t.integratedLufs += by;
      if (t.noiseFloorDbfs !== null) t.noiseFloorDbfs += by;
    }
    const again = plan(["eq", "deesser", "denoise", "space"], after, m);
    expect(again.ops.filter((o) => o.op === "set_track_fx")).toEqual([]);
  });

  it("respects the chain effect limit and tells the user", () => {
    // Product cap is STUDIO_FX_CHAIN_MAX_EFFECTS (12 since the 2026-11-08 plan change; it was 8 before).
    const full: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: Array.from({ length: STUDIO_FX_CHAIN_MAX_EFFECTS }, (_, i) => ({
        id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
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

  it("tune: inserts BRD Tune natural on lead", () => {
    const p = plan(["tune"]);
    const lead = chainOf(p, LEAD)!;
    expect(lead.effects.map((e) => e.type)).toContain("tune");
    const tune = lead.effects.find((e) => e.type === "tune")!;
    expect(tune.params).toMatchObject({ retuneMs: 60, amount: 0.85 });
    expect(p.notes.map((n) => n.key)).toContain("tune");
  });
});

describe("plan limits are told honestly (M20) and light pitch uses the beat key (M49)", () => {
  const full = (): StudioFxChainV1 => {
    let chain = emptyStudioFxChain();
    for (const type of ["highpass", "eq", "compressor", "deesser"] as const) chain = upsertFx(chain, type, (p) => p, nextId)!;
    return chain;
  };
  const plan = (chain: StudioFxChainV1, fixes: Parameters<typeof planMixAutofix>[0]["fixes"]) => {
    const metrics = badMetrics();
    return planMixAutofix({ doc: doc(120, [track(LEAD, "Wokal", "lead_vocal", { effectsChain: chain }), track(BEAT, "Bit", "beat")]), metrics, verdict: buildMixVerdict(metrics), fixes, createId: nextId, maxEffects: 4, allowSidechain: false });
  };

  it("does not announce reverb / echo the plan dropped, and says the plan is full", () => {
    const out = plan(full(), ["space"]);
    expect(out.ops).toHaveLength(0);
    expect(out.limited).toBe(true);
    expect(out.notes.map((n) => n.key)).toEqual(["planLimit"]);
  });

  it("keeps notes for effects that did fit", () => {
    const out = plan(emptyStudioFxChain(), MIX_AUTOFIX_ALL);
    const lead = out.ops.find((o) => o.op === "set_track_fx" && o.trackId === LEAD);
    if (lead?.op !== "set_track_fx") throw new Error("no chain");
    const types = lead.effectsChain.effects.map((e) => e.type);
    expect(types).toHaveLength(4);
    const keys = out.notes.map((n) => n.key);
    expect(keys.includes("spaceLead")).toBe(types.includes("delay") && types.includes("reverb"));
    expect(keys.includes("compLead")).toBe(types.includes("compressor"));
    expect(keys).toContain("planLimit");
  });

  it("a new light tune takes the beat key; an existing one keeps the user's key", () => {
    const metrics = badMetrics();
    const run = (chain: StudioFxChainV1) => {
      const out = planMixAutofix({ doc: doc(120, [track(LEAD, "Wokal", "lead_vocal", { effectsChain: chain })]), metrics, verdict: buildMixVerdict(metrics), fixes: ["tune"], createId: nextId, beatKey: { keyRoot: 9, scale: 1 } });
      const op = out.ops.find((o) => o.op === "set_track_fx");
      if (op?.op !== "set_track_fx") throw new Error("no chain");
      const tune = op.effectsChain.effects.find((e) => e.type === "tune");
      if (tune?.type !== "tune") throw new Error("no tune");
      return tune.params;
    };
    expect(run(emptyStudioFxChain())).toMatchObject({ keyRoot: 9, scale: 1 });
    const own = upsertFx(emptyStudioFxChain(), "tune", (p) => ({ ...p, keyRoot: 4, scale: 0, retuneMs: 300 }), nextId)!;
    expect(run(own)).toMatchObject({ keyRoot: 4, scale: 0 });
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

describe("level moves that the effects do not see (effects run before the fader)", () => {
  const INST = "00000000-0000-4000-8000-00000000000f";
  const quiet = (extra: Partial<TrackMetrics> = {}, inst = false): MixMetrics => {
    const m = badMetrics();
    m.tracks = [
      tm(LEAD, "lead_vocal", -30, { samplePeakDbfs: -14, ...extra }),
      tm(BEAT, "beat", -14, { samplePeakDbfs: -6 }),
      ...(inst ? [tm(INST, "instrument", -20, { samplePeakDbfs: -12 })] : []),
    ];
    m.master = { ...m.master, truePeakDbtp: -6, integratedLufs: -16 };
    m.vocalVsBeatLu = -16;
    return m;
  };

  it("the compressor threshold follows the signal at the effects, not the fader", () => {
    const at = (gainDb: number) => {
      const d = doc(120, [track(LEAD, "Wokal", "lead_vocal", { gainDb }), track(BEAT, "Bit", "beat")]);
      const comp = chainOf(plan(["compression"], d, quiet({ integratedLufs: -30 + gainDb })), LEAD)!.effects.find((e) => e.type === "compressor")!;
      return (comp.params as { thresholdDb: number }).thresholdDb;
    };
    expect(at(10)).toBe(at(0));
    expect(at(-6)).toBe(at(0));
  });

  it("an instrument already under the floor is not lowered with the beat", () => {
    const d = doc(120, [track(LEAD, "Wokal", "lead_vocal"), track(BEAT, "Bit", "beat"), track(INST, "Keys", "instrument", { gainDb: -8 })]);
    const p = plan(["balance"], d, quiet({ samplePeakDbfs: -4 }, true));
    expect(controls(p, BEAT)!.gainDb).toBe(-6);
    expect(controls(p, INST)).toBeUndefined();
  });

  it("a drawn volume curve: the fader is left alone and the user hears about it", () => {
    const drawn = { v: 1 as const, lanes: [{ param: "gainDb" as const, points: [{ t: 0, v: -6 }, { t: 4000, v: 0 }] }] };
    const d = doc(120, [track(LEAD, "Wokal", "lead_vocal", { automation: drawn }), track(BEAT, "Bit", "beat")]);
    const p = plan(["gain", "balance"], d, quiet({ samplePeakDbfs: 0, clipEvents: 4 }));
    expect(controls(p, LEAD)).toBeUndefined();
    expect(controls(p, BEAT)!.gainDb).toBe(-6);
    expect(p.notes.map((n) => n.key)).toContain("balanceVocalDrawn");
    const beatDrawn = doc(120, [track(LEAD, "Wokal", "lead_vocal"), track(BEAT, "Bit", "beat", { automation: drawn })]);
    const q = plan(["balance"], beatDrawn, quiet());
    expect(controls(q, BEAT)).toBeUndefined();
    expect(controls(q, LEAD)!.gainDb).toBe(12);
  });

  it("a drawn pan curve is not overwritten by the panorama fix", () => {
    const drawn = { v: 1 as const, lanes: [{ param: "pan" as const, points: [{ t: 0, v: -0.2 }, { t: 6000, v: 0.2 }] }] };
    const d = doc(120, [track(LEAD, "Wokal", "lead_vocal", { pan: 0.4, automation: drawn }), track(BEAT, "Bit", "beat")]);
    expect(controls(plan(["panorama"], d, quiet()), LEAD)).toBeUndefined();
  });
});
