/**
 * "Zrób utwór" in one pass, the way AI mix services do it: every track starts from its raw sound,
 * each vocal gets one fixed chain for its role (tone matched to a rap vocal), and then one level
 * step puts every track at the loudness of its role. Two measurements, one change, no fix loop:
 * the old loop (measure → fix → measure → fix…) kept rebuilding the chains and could end worse
 * than the raw recording.
 *
 * Calibrated against a reference AI mix of a real BitRymDym song (mix-auto/ in the agent folder):
 * vocal tone within ~1 dB per band, vocal-to-beat level within ~1 dB.
 */
import type { StudioTrackRole } from "@/config/studio";
import type { TrackMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import {
  createStudioFxInstance,
  emptyStudioFxChain,
  STUDIO_SPECTRUM_HZ,
  type StudioFxChainV1,
  type StudioFxInstance,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

/**
 * Loudness (LUFS of the track alone, after its chain) each role is set to. The mix lands near
 * -21 LUFS with peaks around -3 dBFS: headroom for the master, like the reference mix (-20 LUFS).
 */
export const ONE_SHOT_TARGET_LUFS: Partial<Record<StudioTrackRole, number>> = {
  beat: -22,
  instrument: -28,
  lead_vocal: -26,
  double: -29.5,
  backing: -30,
  adlib: -32.5,
};

/**
 * Tone a finished rap vocal has: energy at STUDIO_SPECTRUM_HZ relative to the 1200 Hz band, as
 * measured by vocalTone(). The 80 Hz band is left to the high-pass. The top two bands sit 2 dB
 * under the reference because the echo and reverb after the match brighten the voice again.
 */
export const ONE_SHOT_VOCAL_TONE_DB: readonly (number | null)[] = [null, 7.2, 5.9, 0, -1.7, -5.7, -9.5];
export const ONE_SHOT_TONE_CAP_DB = 6;

const VOCAL_ROLES: readonly StudioTrackRole[] = ["lead_vocal", "double", "backing", "adlib"];
const SIDE_ROLES: readonly StudioTrackRole[] = ["double", "backing", "adlib"];

type Doc = StudioProjectDocument;
type Track = Doc["tracks"][number];

export function isOneShotVocal(role: StudioTrackRole): boolean {
  return VOCAL_ROLES.includes(role);
}

/**
 * The starting point: no effects and no fader moves anywhere, so the result never depends on what
 * an earlier run or the user left behind. Adlibs placed in the middle go left and right in turn.
 */
export function oneShotDryDocument(doc: Doc): Doc {
  const empty = emptyStudioFxChain();
  let adlib = 0;
  return {
    ...doc,
    project: { ...doc.project, masterGainDb: 0, masterPan: 0, masterFxChain: empty },
    tracks: doc.tracks.map((t) => {
      let pan = t.pan;
      if (t.trackRole === "adlib" && Math.abs(t.pan) < 0.05) pan = adlib++ % 2 === 0 ? -0.5 : 0.5;
      return { ...t, gainDb: 0, pan, effectsChain: empty, automation: undefined };
    }),
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function fx<T extends StudioFxType>(type: T, params: Record<string, number>, createId: () => string): StudioFxInstance {
  const e = createStudioFxInstance(type, createId) as StudioFxInstance & { params: Record<string, unknown> };
  return { ...e, params: { ...e.params, ...params } } as StudioFxInstance;
}

/** Spectrum gains (dB) that bring the measured tone to ONE_SHOT_VOCAL_TONE_DB; 0 where unknown. */
export function oneShotToneGains(toneDb: readonly number[] | null | undefined): number[] {
  return STUDIO_SPECTRUM_HZ.map((_, i) => {
    const target = ONE_SHOT_VOCAL_TONE_DB[i];
    const got = toneDb?.[i];
    if (target == null || got == null || !Number.isFinite(got)) return 0;
    return round1(Math.max(-ONE_SHOT_TONE_CAP_DB, Math.min(ONE_SHOT_TONE_CAP_DB, target - got)));
  });
}

/** The fixed chain for one vocal track (10 effects at most, under the 12 a chain may hold). */
export function oneShotVocalChain(input: {
  role: StudioTrackRole;
  toneDb: readonly number[] | null | undefined;
  noiseFloorDbfs: number | null;
  tempoBpm: number;
  createId?: () => string;
}): StudioFxChainV1 {
  const id = input.createId ?? (() => crypto.randomUUID());
  const side = SIDE_ROLES.includes(input.role);
  const beatMs = 60000 / Math.min(200, Math.max(50, input.tempoBpm || 90));
  const g = oneShotToneGains(input.toneDb);
  const effects: StudioFxInstance[] = [fx("highpass", { frequencyHz: 110, q: 0.71 }, id)];
  // A gate only for a recording with audible room noise between the words.
  if (input.noiseFloorDbfs != null && input.noiseFloorDbfs > -75) {
    effects.push(fx("gate", { thresholdDb: round1(Math.min(-35, input.noiseFloorDbfs + 8)), rangeDb: 12, attackMs: 2, holdMs: 60, releaseMs: 120 }, id));
  }
  if (g.some((v) => v !== 0)) {
    effects.push(fx("spectrum", { b0: 0, b1: g[1]!, b2: g[2]!, b3: 0, b4: g[4]!, b5: g[5]!, b6: g[6]! }, id));
  }
  effects.push(
    fx("rider", { amount: 0.8, maxBoostDb: 5, maxCutDb: 5 }, id),
    fx("compressor", { thresholdDb: -28, ratio: 4, attackMs: 8, releaseMs: 120, makeupDb: 0 }, id),
    fx("deesser", { frequencyHz: 6500, thresholdDb: -30, ratio: 4 }, id),
    fx("saturate", { drive: 0.1, mix: 0.5 }, id),
    fx("delay", side ? { mix: 0.15, timeMs: Math.round(beatMs), feedback: 0.12 } : { mix: 0.07, timeMs: Math.round(beatMs / 2), feedback: 0.08 }, id),
    fx("reverb", side ? { mix: 0.08, decaySeconds: 1.6 } : { mix: 0.05, decaySeconds: 0.9 }, id),
  );
  return { ...emptyStudioFxChain(), effects };
}

/** Step 2: the dry measurement decides each vocal chain. Other tracks stay without effects. */
export function oneShotWetDocument(dry: Doc, dryTracks: readonly TrackMetrics[], createId?: () => string): Doc {
  return {
    ...dry,
    tracks: dry.tracks.map((t) => {
      if (!isOneShotVocal(t.trackRole)) return t;
      const m = dryTracks.find((x) => x.trackId === t.id);
      if (!m?.hasAudio) return t;
      return {
        ...t,
        effectsChain: oneShotVocalChain({
          role: t.trackRole,
          toneDb: m.toneDb,
          noiseFloorDbfs: m.noiseFloorDbfs,
          tempoBpm: dry.project.tempoBpm,
          createId,
        }),
      };
    }),
  };
}

/** Step 3: one fader move per track to its role loudness, measured with the chains on. */
export function oneShotGainDb(track: Pick<Track, "trackRole" | "gainDb">, measured: TrackMetrics | undefined): number {
  const target = ONE_SHOT_TARGET_LUFS[track.trackRole];
  if (target == null || !measured?.hasAudio || !Number.isFinite(measured.integratedLufs)) return track.gainDb;
  return round1(Math.max(-24, Math.min(24, track.gainDb + target - measured.integratedLufs)));
}

/** Everything the run changes, as one set of ops (one undo step). */
export function oneShotOps(original: Doc, wet: Doc, wetTracks: readonly TrackMetrics[]): MixWorkingOp[] {
  const ops: MixWorkingOp[] = [
    { op: "set_master_mix", masterGainDb: 0, masterPan: 0 },
    { op: "set_master_fx", effectsChain: emptyStudioFxChain() },
  ];
  for (const t of wet.tracks) {
    const before = original.tracks.find((x) => x.id === t.id);
    if (!before) continue;
    ops.push({ op: "set_track_fx", trackId: t.id, effectsChain: t.effectsChain });
    const gainDb = oneShotGainDb(t, wetTracks.find((x) => x.trackId === t.id));
    if (gainDb !== before.gainDb || t.pan !== before.pan) ops.push({ op: "set_track_controls", trackId: t.id, gainDb, pan: t.pan });
  }
  return ops;
}
