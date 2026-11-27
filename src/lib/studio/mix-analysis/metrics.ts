/**
 * Stage 1 — Mix metrics (browser-only, worker-friendly, no DOM).
 * Role-aware: vocal stem = lead_vocal (fallback: any vocal role),
 * beat stem = beat + instrument.
 */

import type { StudioTrackRole } from "@/config/studio";
import { STUDIO_SPECTRUM_HZ } from "@/lib/studio/studio-fx-chain";
import { percentile, powerToDb, stftBandPowers } from "@/lib/studio/mix-analysis/dsp";
import { measureLoudness } from "@/lib/studio/mix-analysis/loudness";
import { duckBeatMids, isPocketBeat, isPocketLead, pocketLeadStage } from "@/lib/studio/mix-analysis/rap-pocket";
import { isSidechainKey, mixHasTrackSidechain, SidechainBus, trackSidechain } from "@/lib/studio/mix-analysis/track-sidechain";
import {
  analysisFxChain,
  applyFxInPlace,
  renderTrack,
  stereoPan,
  type MixAnalysisInput,
  type RenderedTrack,
} from "@/lib/studio/mix-analysis/render";

export type TrackMetrics = {
  trackId: string;
  name: string;
  role: StudioTrackRole;
  pan: number;
  audible: boolean;
  hasAudio: boolean;
  integratedLufs: number;
  shortTermMaxLufs: number;
  samplePeakDbfs: number;
  clipEvents: number;
  /** 10th percentile of 50 ms RMS inside clip regions (dBFS); null if too short. */
  noiseFloorDbfs: number | null;
  /**
   * Vocal tone: energy at the 7 spectrum centres (STUDIO_SPECTRUM_HZ, ±½ octave) while the voice
   * sounds, dB relative to the 1200 Hz band. Vocal roles only; null when too short or silent.
   */
  toneDb?: number[] | null;
};

export type MixMetrics = {
  sampleRate: number;
  durationSeconds: number;
  tracks: TrackMetrics[];
  master: {
    integratedLufs: number;
    shortTermMaxLufs: number;
    lraLu: number;
    samplePeakDbfs: number;
    truePeakDbtp: number;
    clipEvents: number;
    correlation: number | null;
    /** Side/mid energy ratio in dB (−∞ = mono). */
    widthDb: number | null;
  };
  vocalStem: { integratedLufs: number; shortTermMaxLufs: number } | null;
  beatStem: { integratedLufs: number; shortTermMaxLufs: number } | null;
  /** Vocal − beat integrated loudness (LU). */
  vocalVsBeatLu: number | null;
  /** Vocal − beat energy in 1–4 kHz during vocal activity (dB). */
  presenceDb: number | null;
  /** % of vocal-active frames where the beat is louder than the vocal in at least half of the vocal's own bands (8 bands 200 Hz–5 kHz). */
  maskingPercent: number | null;
  /** p99 of 5–9 kHz vocal level − median full-band vocal level (dB). */
  sibilanceDb: number | null;
};

export const VOCAL_ROLES: readonly StudioTrackRole[] = ["lead_vocal", "adlib", "double", "backing"];
const BEAT_ROLES: readonly StudioTrackRole[] = ["beat", "instrument"];
export const CLIP_THRESHOLD = 0.999;

/** Runs of ≥3 consecutive samples at/above full scale. */
export function countClipEvents(...channels: Float32Array[]): number {
  let events = 0;
  for (const ch of channels) {
    let run = 0;
    for (let i = 0; i < ch.length; i++) {
      if (Math.abs(ch[i]) >= CLIP_THRESHOLD) {
        run++;
        if (run === 3) events++;
      } else run = 0;
    }
  }
  return events;
}

function noiseFloor(r: RenderedTrack, sampleRate: number): number | null {
  const win = Math.round(sampleRate * 0.05);
  const levels: number[] = [];
  for (const [s, e] of r.activeRanges) {
    for (let i = s; i + win <= e; i += win) {
      let acc = 0;
      for (let k = i; k < i + win; k++) {
        const m = 0.5 * (r.left[k] + r.right[k]);
        acc += m * m;
      }
      levels.push(powerToDb(acc / win));
    }
  }
  if (levels.length < 40) return null; // < 2 s of clip audio
  return percentile(levels, 10);
}

/** Room noise is judged without reverb and echo: their tail is not noise and a gate would not remove it. */
function dryForNoise(input: MixAnalysisInput, r: RenderedTrack, anySolo: boolean): RenderedTrack {
  const chain = r.track.effectsChain as { effects?: { type?: string; enabled?: boolean }[] } | null | undefined;
  const effects = chain?.effects;
  if (!Array.isArray(effects) || !effects.some((e) => e.enabled !== false && (e.type === "reverb" || e.type === "delay"))) return r;
  return renderTrack(
    input,
    { ...r.track, effectsChain: { ...chain, effects: effects.filter((e) => e.type !== "reverb" && e.type !== "delay") } },
    anySolo,
  );
}

const TONE_BANDS = STUDIO_SPECTRUM_HZ.map((hz) => ({ loHz: hz / Math.SQRT2, hiHz: hz * Math.SQRT2 }));
const TONE_REF_INDEX = STUDIO_SPECTRUM_HZ.indexOf(1200);

/** See TrackMetrics.toneDb. Frames within 30 dB of the loud (p95) frames count as the voice. */
export function vocalTone(left: Float32Array, right: Float32Array, sampleRate: number): number[] | null {
  const mono = new Float32Array(left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (left[i]! + right[i]!);
  const nyq = sampleRate / 2;
  const bands = TONE_BANDS.map((b) => ({ loHz: Math.min(b.loHz, nyq * 0.9), hiHz: Math.min(b.hiHz, nyq * 0.99) }));
  const st = stftBandPowers(mono, sampleRate, bands, 4096);
  const level = Array.from(st.full, (p) => powerToDb(p));
  if (level.length < 16) return null;
  const loud = percentile(level, 95);
  const sum = new Float64Array(bands.length);
  let n = 0;
  for (let f = 0; f < level.length; f++) {
    if (level[f]! < -60 || level[f]! < loud - 30) continue;
    n++;
    for (let b = 0; b < bands.length; b++) sum[b] += st.bands[b]![f]!;
  }
  if (n < 16) return null;
  const db = Array.from(sum, (v) => powerToDb(v / n, -200));
  const ref = db[TONE_REF_INDEX]!;
  return db.map((v) => Math.round((v - ref) * 10) / 10);
}

const MASK_BANDS = (() => {
  const out: { loHz: number; hiHz: number }[] = [];
  const lo = 200;
  const hi = 5000;
  for (let i = 0; i < 8; i++) {
    out.push({
      loHz: lo * Math.pow(hi / lo, i / 8),
      hiHz: lo * Math.pow(hi / lo, (i + 1) / 8),
    });
  }
  return out;
})();
const PRESENCE = { loHz: 1000, hiHz: 4000 };
const SIB = { loHz: 5000, hiHz: 9000 };

export function spectralVocalMetrics(
  vocal: Float32Array,
  beat: Float32Array | null,
  sampleRate: number,
): { presenceDb: number | null; maskingPercent: number | null; sibilanceDb: number | null } {
  const v = stftBandPowers(vocal, sampleRate, [PRESENCE, SIB, ...MASK_BANDS]);
  const b = beat ? stftBandPowers(beat, sampleRate, [PRESENCE, ...MASK_BANDS]) : null;
  const frames = v.full.length;
  const vocalDb = Array.from(v.full, (p) => powerToDb(p));
  const loud = percentile(vocalDb, 95);
  const active: number[] = [];
  for (let f = 0; f < frames; f++) {
    if (vocalDb[f] > -50 && vocalDb[f] > loud - 30) active.push(f);
  }
  if (active.length < 8) return { presenceDb: null, maskingPercent: null, sibilanceDb: null };
  const sibLevels = active.map((f) => powerToDb(v.bands[1][f]));
  const fullLevels = active.map((f) => vocalDb[f]);
  const sibilanceDb = percentile(sibLevels, 99) - percentile(fullLevels, 50);
  if (!b) return { presenceDb: null, maskingPercent: null, sibilanceDb };
  let vp = 0;
  let bp = 0;
  let masked = 0;
  for (const f of active) {
    vp += v.bands[0][f];
    bp += b.bands[0][f];
    // Only bands where the vocal actually carries energy (within 20 dB of its
    // strongest band this frame) can be masked.
    let vmax = 0;
    for (let k = 0; k < MASK_BANDS.length; k++) vmax = Math.max(vmax, v.bands[2 + k][f]);
    let considered = 0;
    let dom = 0;
    for (let k = 0; k < MASK_BANDS.length; k++) {
      if (v.bands[2 + k][f] < vmax * 0.01) continue;
      considered++;
      if (b.bands[1 + k][f] > v.bands[2 + k][f]) dom++;
    }
    if (considered > 0 && dom * 2 >= considered) masked++;
  }
  const presenceDb = bp > 0 ? 10 * Math.log10(vp / bp) : 60;
  return {
    presenceDb: Math.min(60, presenceDb),
    maskingPercent: (100 * masked) / active.length,
    sibilanceDb,
  };
}

export function stereoMetrics(l: Float32Array, r: Float32Array): { correlation: number | null; widthDb: number | null } {
  let lr = 0;
  let ll = 0;
  let rr = 0;
  let mid = 0;
  let side = 0;
  for (let i = 0; i < l.length; i++) {
    lr += l[i] * r[i];
    ll += l[i] * l[i];
    rr += r[i] * r[i];
    const m = 0.5 * (l[i] + r[i]);
    const s = 0.5 * (l[i] - r[i]);
    mid += m * m;
    side += s * s;
  }
  if (ll <= 1e-12 || rr <= 1e-12) return { correlation: ll + rr > 1e-12 ? 0 : null, widthDb: null };
  return {
    correlation: lr / Math.sqrt(ll * rr),
    widthDb: mid > 0 ? powerToDb(side / mid, -120) : null,
  };
}

export type MixProgress = (fraction: number) => void;

/**
 * Streaming: renders one track at a time, keeps only the three stems.
 * Rap pocket and sidechain are heard in playback and in the master, so they are measured too:
 * pocketed leads first (held), then the beat that ducks under them and keys the sidechain, then the rest.
 */
export function computeMixMetrics(input: MixAnalysisInput, onProgress?: MixProgress): MixMetrics {
  const sr = input.sampleRate;
  const anySolo = input.tracks.some((t) => t.solo);
  const len = Math.max(1, Math.round((input.lengthMs / 1000) * sr));
  const masterL = new Float32Array(len);
  const masterR = new Float32Array(len);
  const hasLead = input.tracks.some((t) => t.role === "lead_vocal");
  const vocalRoles = hasLead ? ["lead_vocal"] : VOCAL_ROLES;
  const vocalM = new Float32Array(len);
  const beatM = new Float32Array(len);
  let vocalCount = 0;
  let beatCount = 0;
  const tracks = new Array<TrackMetrics>(input.tracks.length);
  const steps = input.tracks.length + 2;
  let measured = 0;
  const measure = (idx: number, r: RenderedTrack) => {
    const t = input.tracks[idx]!;
    const hasAudio = r.activeRanges.length > 0;
    const lo = hasAudio ? measureLoudness([r.left, r.right], sr, { truePeak: false }) : null;
    tracks[idx] = {
      trackId: t.id,
      name: t.name,
      role: t.role,
      pan: t.pan,
      audible: r.audible,
      hasAudio,
      integratedLufs: lo?.integratedLufs ?? -Infinity,
      shortTermMaxLufs: lo?.shortTermMaxLufs ?? -Infinity,
      samplePeakDbfs: lo?.samplePeakDbfs ?? -120,
      clipEvents: hasAudio ? countClipEvents(r.left, r.right) : 0,
      noiseFloorDbfs: hasAudio && VOCAL_ROLES.includes(t.role) ? noiseFloor(dryForNoise(input, r, anySolo), sr) : null,
      toneDb: hasAudio && VOCAL_ROLES.includes(t.role) ? vocalTone(r.left, r.right, sr) : null,
    };
    if (r.audible && hasAudio) {
      for (let i = 0; i < len; i++) {
        masterL[i] += r.left[i];
        masterR[i] += r.right[i];
      }
      if (vocalRoles.includes(t.role)) {
        vocalCount++;
        for (let i = 0; i < len; i++) vocalM[i] += 0.5 * (r.left[i] + r.right[i]);
      } else if (BEAT_ROLES.includes(t.role)) {
        beatCount++;
        for (let i = 0; i < len; i++) beatM[i] += 0.5 * (r.left[i] + r.right[i]);
      }
    }
    measured++;
    onProgress?.(measured / steps);
  };
  const bus = mixHasTrackSidechain(input.tracks) ? new SidechainBus(sr, len) : null;
  const duck = (r: RenderedTrack) => {
    const params = bus ? trackSidechain(r.track) : null;
    if (bus && params) bus.duck(r.left, r.right, params);
  };
  const leads = input.tracks.flatMap((t, idx) => (isPocketLead(t) ? [{ idx, r: renderTrack(input, t, anySolo) }] : []));
  const pocketed = leads.filter((l) => l.r.audible && l.r.activeRanges.length > 0);
  const pocket = pocketLeadStage(
    pocketed.map(({ r }) => ({ role: r.track.role, effectsChain: r.track.effectsChain, left: r.left, right: r.right })),
    sr,
    input.lengthMs,
    input.markers ?? [],
  );
  const rest = input.tracks.map((t, idx) => ({ t, idx })).filter(({ t }) => !isPocketLead(t));
  // Key (BEAT) tracks before the tracks they duck; without a sidechain the project order stays.
  if (bus) rest.sort((x, y) => Number(isSidechainKey(y.t)) - Number(isSidechainKey(x.t)) || x.idx - y.idx);
  const renderRest = ({ t, idx }: { t: (typeof input.tracks)[number]; idx: number }) => {
    const r = renderTrack(input, t, anySolo);
    if (pocket && isPocketBeat(t)) duckBeatMids(r, pocket.key, sr, pocket.params.depth);
    if (bus && isSidechainKey(t)) {
      if (r.audible) bus.addKey(r.left, r.right);
    } else duck(r);
    measure(idx, r);
  };
  for (const item of rest) renderRest(item);
  pocket?.finish();
  for (const { idx, r } of leads) {
    duck(r);
    measure(idx, r);
  }
  const masterFx = analysisFxChain(input.masterEffectsChain, "master", sr);
  if (masterFx) applyFxInPlace(masterFx, masterL, masterR);
  const mg = Number.isFinite(input.masterGainDb) ? Math.pow(10, input.masterGainDb / 20) : 1;
  for (let i = 0; i < len; i++) {
    const [l, r] = stereoPan(masterL[i] * mg, masterR[i] * mg, false, input.masterPan);
    masterL[i] = l;
    masterR[i] = r;
  }
  const ml = measureLoudness([masterL, masterR], sr);
  onProgress?.((steps - 1) / steps);
  const stereo = stereoMetrics(masterL, masterR);
  const stem = (m: Float32Array) => {
    const lo = measureLoudness([m, m], sr, { truePeak: false });
    return { integratedLufs: lo.integratedLufs, shortTermMaxLufs: lo.shortTermMaxLufs };
  };
  const vocalStem = vocalCount > 0 ? stem(vocalM) : null;
  const beatStem = beatCount > 0 ? stem(beatM) : null;
  const vocalVsBeatLu =
    vocalStem && beatStem && Number.isFinite(vocalStem.integratedLufs) && Number.isFinite(beatStem.integratedLufs)
      ? vocalStem.integratedLufs - beatStem.integratedLufs
      : null;
  const spectral = vocalCount > 0 ? spectralVocalMetrics(vocalM, beatCount > 0 ? beatM : null, sr) : null;
  onProgress?.(1);
  return {
    sampleRate: sr,
    durationSeconds: len / sr,
    tracks,
    master: {
      integratedLufs: ml.integratedLufs,
      shortTermMaxLufs: ml.shortTermMaxLufs,
      lraLu: ml.lraLu,
      samplePeakDbfs: ml.samplePeakDbfs,
      truePeakDbtp: ml.truePeakDbtp,
      clipEvents: countClipEvents(masterL, masterR),
      correlation: stereo.correlation,
      widthDb: stereo.widthDb,
    },
    vocalStem,
    beatStem,
    vocalVsBeatLu,
    presenceDb: spectral?.presenceDb ?? null,
    maskingPercent: spectral?.maskingPercent ?? null,
    sibilanceDb: spectral?.sibilanceDb ?? null,
  };
}

