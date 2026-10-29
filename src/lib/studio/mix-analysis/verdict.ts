/**
 * Stage 1 — Mix verdict: metrics → traffic-light cards (i18n keys only).
 * Thresholds are a documented starting point (Page „Co sprawdza AI w Mixie”),
 * to be tuned on 20–30 real songs.
 */

import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";

export type MixCardStatus = "green" | "yellow" | "red" | "na";
export type MixCardId =
  | "loudness"
  | "balance"
  | "presence"
  | "masking"
  | "sibilance"
  | "clipping"
  | "noise"
  | "stereo"
  | "panorama";

export type MixCard = {
  id: MixCardId;
  status: MixCardStatus;
  /** i18n key under studio.mixStep.cards.<id>.<messageKey> */
  messageKey: string;
  params: Record<string, string | number>;
  /** Short measured value for the card chip, already formatted. */
  value: string | null;
};

export type MixVerdict = {
  overall: "green" | "yellow" | "red";
  cards: MixCard[];
  redCount: number;
  yellowCount: number;
  canMaster: boolean;
};

export const MIX_THRESHOLDS = {
  /** Lead vocal − beat (integrated LU). */
  balance: { greenMin: 0, greenMax: 3, yellowMin: -6, yellowMax: 6 },
  /** Vocal − beat energy 1–4 kHz (dB). */
  presence: { green: 3, yellow: 0 },
  /** % frames masked. */
  masking: { green: 10, yellow: 25 },
  /** p99 sibilance over median vocal (dB). */
  sibilance: { green: 4, yellow: 8 },
  /** Clip events / master true peak (dBTP). */
  clipping: { yellowEvents: 1, redEvents: 11, yellowTp: -1, redTp: 0 },
  /** Noise floor (dBFS). */
  noise: { green: -60, yellow: -45 },
  /** Master L/R correlation. */
  stereo: { green: 0.3, yellow: 0 },
  /** |pan| below which an adlib/double counts as centred; lead above = off-centre. */
  panorama: { sideMin: 0.15, leadMax: 0.2 },
  /** Master integrated loudness below which the mix is "very quiet". */
  loudness: { quiet: -35, hot: -8 },
  /** Overall: green when no red and at most this many yellows. */
  overallMaxYellow: 2,
} as const;

const f1 = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : "−∞");
const signed = (n: number) => (n > 0 ? `+${f1(n)}` : f1(n));

export function buildMixVerdict(m: MixMetrics): MixVerdict {
  const T = MIX_THRESHOLDS;
  const cards: MixCard[] = [];

  // Loudness (overall LUFS — informative; only extremes warn).
  {
    const I = m.master.integratedLufs;
    let status: MixCardStatus = "green";
    let key = "ok";
    if (!Number.isFinite(I)) {
      status = "na";
      key = "silent";
    } else if (I < T.loudness.quiet) {
      status = "yellow";
      key = "quiet";
    } else if (I > T.loudness.hot) {
      status = "yellow";
      key = "hot";
    }
    cards.push({
      id: "loudness",
      status,
      messageKey: key,
      params: { lufs: f1(I), st: f1(m.master.shortTermMaxLufs) },
      value: Number.isFinite(I) ? `${f1(I)} LUFS` : null,
    });
  }

  // Balance vocal vs beat.
  {
    const d = m.vocalVsBeatLu;
    const b = T.balance;
    let status: MixCardStatus = "na";
    let key = m.vocalStem ? "noBeat" : "noVocal";
    if (d !== null) {
      if (d >= b.greenMin && d <= b.greenMax) {
        status = "green";
        key = "ok";
      } else if (d < b.yellowMin) {
        status = "red";
        key = "vocalBuried";
      } else if (d > b.yellowMax) {
        status = "red";
        key = "vocalTooLoud";
      } else {
        status = "yellow";
        key = d < b.greenMin ? "vocalLow" : "vocalHigh";
      }
    }
    cards.push({ id: "balance", status, messageKey: key, params: { lu: d === null ? "—" : signed(d) }, value: d === null ? null : `${signed(d)} LU` });
  }

  // Presence 1–4 kHz.
  {
    const d = m.presenceDb;
    let status: MixCardStatus = "na";
    let key = "na";
    if (d !== null) {
      if (d >= T.presence.green) [status, key] = ["green", "ok"];
      else if (d >= T.presence.yellow) [status, key] = ["yellow", "weak"];
      else [status, key] = ["red", "covered"];
    }
    cards.push({ id: "presence", status, messageKey: key, params: { db: d === null ? "—" : signed(d) }, value: d === null ? null : `${signed(d)} dB` });
  }

  // Masking.
  {
    const p = m.maskingPercent;
    let status: MixCardStatus = "na";
    let key = "na";
    if (p !== null) {
      if (p < T.masking.green) [status, key] = ["green", "ok"];
      else if (p <= T.masking.yellow) [status, key] = ["yellow", "some"];
      else [status, key] = ["red", "heavy"];
    }
    cards.push({ id: "masking", status, messageKey: key, params: { pct: p === null ? "—" : Math.round(p) }, value: p === null ? null : `${Math.round(p)}%` });
  }

  // Sibilance.
  {
    const s = m.sibilanceDb;
    let status: MixCardStatus = "na";
    let key = "na";
    if (s !== null) {
      if (s < T.sibilance.green) [status, key] = ["green", "ok"];
      else if (s <= T.sibilance.yellow) [status, key] = ["yellow", "some"];
      else [status, key] = ["red", "harsh"];
    }
    cards.push({ id: "sibilance", status, messageKey: key, params: { db: s === null ? "—" : signed(s) }, value: s === null ? null : `${signed(s)} dB` });
  }

  // Clipping / true peak.
  {
    const events = Math.max(m.master.clipEvents, ...m.tracks.map((t) => t.clipEvents), 0);
    const tp = m.master.truePeakDbtp;
    const C = T.clipping;
    let status: MixCardStatus = "green";
    let key = "ok";
    if (events >= C.redEvents || tp > C.redTp) [status, key] = ["red", events >= C.redEvents ? "clipped" : "overPeak"];
    else if (events >= C.yellowEvents) [status, key] = ["yellow", "fewClips"];
    else if (tp > C.yellowTp) [status, key] = ["yellow", "lowHeadroom"];
    if (!Number.isFinite(m.master.integratedLufs) && events === 0) [status, key] = ["na", "silent"];
    cards.push({ id: "clipping", status, messageKey: key, params: { events, tp: f1(tp) }, value: `${f1(tp)} dBTP` });
  }

  // Noise floor (worst vocal-role track).
  {
    const floors = m.tracks.filter((t) => t.noiseFloorDbfs !== null);
    let status: MixCardStatus = "na";
    let key = "na";
    let worst: (typeof floors)[number] | null = null;
    for (const t of floors) if (!worst || (t.noiseFloorDbfs as number) > (worst.noiseFloorDbfs as number)) worst = t;
    const v = worst?.noiseFloorDbfs ?? null;
    if (v !== null) {
      if (v < T.noise.green) [status, key] = ["green", "ok"];
      else if (v <= T.noise.yellow) [status, key] = ["yellow", "some"];
      else [status, key] = ["red", "loud"];
    }
    cards.push({ id: "noise", status, messageKey: key, params: { db: v === null ? "—" : f1(v), track: worst?.name ?? "" }, value: v === null ? null : `${f1(v)} dBFS` });
  }

  // Stereo correlation / width.
  {
    const c = m.master.correlation;
    let status: MixCardStatus = "na";
    let key = "na";
    if (c !== null) {
      if (c > T.stereo.green) [status, key] = ["green", "ok"];
      else if (c >= T.stereo.yellow) [status, key] = ["yellow", "wide"];
      else [status, key] = ["red", "phase"];
    }
    cards.push({ id: "stereo", status, messageKey: key, params: { corr: c === null ? "—" : c.toFixed(2) }, value: c === null ? null : c.toFixed(2) });
  }

  // Panorama of adlibs / doubles vs lead (by track roles).
  {
    const P = T.panorama;
    const audible = m.tracks.filter((t) => t.audible && t.hasAudio);
    const sides = audible.filter((t) => t.role === "adlib" || t.role === "double");
    const centred = sides.filter((t) => Math.abs(t.pan) < P.sideMin);
    const leadOff = audible.filter((t) => t.role === "lead_vocal" && Math.abs(t.pan) > P.leadMax);
    let status: MixCardStatus = "green";
    let key = sides.length === 0 ? "noAdlibs" : "ok";
    if (leadOff.length > 0) [status, key] = ["yellow", "leadOffCentre"];
    else if (centred.length > 0) [status, key] = ["yellow", "adlibsCentred"];
    else if (sides.length >= 2 && sides.every((t) => Math.sign(t.pan) === Math.sign(sides[0].pan))) [status, key] = ["yellow", "oneSide"];
    if (audible.length === 0) [status, key] = ["na", "na"];
    cards.push({
      id: "panorama",
      status,
      messageKey: key,
      params: { count: centred.length || leadOff.length, names: (leadOff.length ? leadOff : centred).map((t) => t.name).join(", ") },
      value: null,
    });
  }

  const redCount = cards.filter((c) => c.status === "red").length;
  const yellowCount = cards.filter((c) => c.status === "yellow").length;
  const overall = redCount > 0 ? "red" : yellowCount > T.overallMaxYellow ? "yellow" : "green";
  return {
    overall,
    cards,
    redCount,
    yellowCount,
    canMaster: redCount === 0 && Number.isFinite(m.master.integratedLufs),
  };
}
