/**
 * Stage 1 — Mix metrics (browser-only, worker-friendly, no DOM).
 * Role-aware: vocal stem = lead_vocal (fallback: any vocal role),
 * beat stem = beat + instrument.
 */

import type { StudioTrackRole } from "@/config/studio";
import { percentile, powerToDb, stftBandPowers } from "@/lib/studio/mix-analysis/dsp";
import { measureLoudness } from "@/lib/studio/mix-analysis/loudness";
import {
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

function mono(l: Float32Array, r: Float32Array): Float32Array {
  const m = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) m[i] = 0.5 * (l[i] + r[i]);
  return m;
}

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

/** Streaming: renders one track at a time, keeps only the three stems. */
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
  const tracks: TrackMetrics[] = [];
  const steps = input.tracks.length + 2;
  input.tracks.forEach((t, idx) => {
    const r = renderTrack(input, t, anySolo);
    const hasAudio = r.activeRanges.length > 0;
    const lo = hasAudio ? measureLoudness([r.left, r.right], sr, { truePeak: false }) : null;
    tracks.push({
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
      noiseFloorDbfs: hasAudio && VOCAL_ROLES.includes(t.role) ? noiseFloor(r, sr) : null,
    });
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
    onProgress?.((idx + 1) / steps);
  });
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

