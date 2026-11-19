/**
 * Streaming readiness for a finished master: how each service would treat the measured
 * loudness, whether the true peak is safe, and what to change. Pure arithmetic on the
 * measured numbers; no claim about how the track sounds.
 */

import type { MasterMetrics } from "./dsp";

/** Published normalisation targets (integrated LUFS). */
export const STREAMING_PLATFORMS = [
  { id: "spotify", lufs: -14 },
  { id: "youtube", lufs: -14 },
  { id: "tidal", lufs: -14 },
  { id: "apple", lufs: -16 },
] as const;
export type StreamingPlatformId = (typeof STREAMING_PLATFORMS)[number]["id"];

/** True peak at or below this is safe for lossy re-encoding on every service. */
export const STREAMING_TP_CEILING_DB = -1;

export type StreamingRow = {
  id: StreamingPlatformId;
  target: number;
  /** Gain the service would apply (dB). Negative = turns the track down. */
  gainDb: number;
  action: "down" | "up" | "none";
};

export type StreamingNoteKey = "tpOver" | "loud" | "quiet" | "squashed" | "phase" | "ok";
export type StreamingNote = { key: StreamingNoteKey; params: Record<string, string | number> };

export type StreamingReadiness = {
  /** 0–100. */
  score: number;
  rows: StreamingRow[];
  truePeakOk: boolean;
  notes: StreamingNote[];
};

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function buildStreamingReadiness(m: MasterMetrics): StreamingReadiness | null {
  if (!Number.isFinite(m.lufs) || !Number.isFinite(m.truePeakDb)) return null;
  const rows: StreamingRow[] = STREAMING_PLATFORMS.map((p) => {
    const gainDb = Math.round((p.lufs - m.lufs) * 10) / 10;
    return { id: p.id, target: p.lufs, gainDb, action: Math.abs(gainDb) < 0.5 ? "none" : gainDb < 0 ? "down" : "up" };
  });
  const truePeakOk = m.truePeakDb <= STREAMING_TP_CEILING_DB + 0.05;
  const notes: StreamingNote[] = [];
  let score = 100;
  if (!truePeakOk) {
    score -= m.truePeakDb > 0 ? 30 : 15;
    notes.push({ key: "tpOver", params: { tp: f1(m.truePeakDb), ceiling: STREAMING_TP_CEILING_DB } });
  }
  if (m.lufs > -11) {
    score -= Math.min(25, Math.round((m.lufs + 11) * 5 + 8));
    notes.push({ key: "loud", params: { lufs: f1(m.lufs), down: f1(Math.abs(-14 - m.lufs)) } });
  } else if (m.lufs < -17) {
    score -= Math.min(20, Math.round((-17 - m.lufs) * 4 + 6));
    notes.push({ key: "quiet", params: { lufs: f1(m.lufs) } });
  }
  if (m.plr < 7) {
    score -= Math.min(20, Math.round((7 - m.plr) * 5 + 5));
    notes.push({ key: "squashed", params: { plr: f1(m.plr) } });
  }
  if (m.correlation < 0.2) {
    score -= 10;
    notes.push({ key: "phase", params: { corr: m.correlation.toFixed(2) } });
  }
  if (notes.length === 0) notes.push({ key: "ok", params: {} });
  return { score: Math.max(0, Math.min(100, score)), rows, truePeakOk, notes };
}
