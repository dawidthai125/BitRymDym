/** Stage 3 — whole-track (mastering) cards for BITEK. Same shape as Mix cards. */

import type { MixCardStatus } from "@/lib/studio/mix-analysis/verdict";

import type { MasterMetrics } from "./dsp";
import { masterGoal, type MasterSettings, type MasterTargetId } from "./targets";

export type MasterCardId = "loudness" | "truePeak" | "dynamics" | "tonal" | "lowEnd" | "stereo";
export type MasterCard = {
  id: MasterCardId;
  status: MixCardStatus;
  /** i18n: studio.masterStep.cards.<id>.<messageKey> */
  messageKey: string;
  params: Record<string, string | number>;
  value: string | null;
};
export type MasterVerdict = { overall: "green" | "yellow" | "red"; cards: MasterCard[]; redCount: number; yellowCount: number; ready: boolean };

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function buildMasterVerdict(m: MasterMetrics, target: MasterTargetId, settings: MasterSettings): MasterVerdict {
  const goal = masterGoal(target, settings);
  const cards: MasterCard[] = [];
  const dl = m.lufs - goal.lufs;
  cards.push({
    id: "loudness",
    status: !Number.isFinite(m.lufs) ? "red" : Math.abs(dl) <= 1 ? "green" : Math.abs(dl) <= 2 ? "yellow" : "red",
    messageKey: !Number.isFinite(m.lufs) ? "silent" : Math.abs(dl) <= 1 ? "ok" : dl < 0 ? "quiet" : "loud",
    params: { lufs: f1(m.lufs), goal: f1(goal.lufs) },
    value: Number.isFinite(m.lufs) ? `${f1(m.lufs)} LUFS` : null,
  });
  cards.push({
    id: "truePeak",
    status: m.truePeakDb <= goal.tp + 0.05 ? "green" : m.truePeakDb <= goal.tp + 0.5 ? "yellow" : "red",
    messageKey: m.truePeakDb <= goal.tp + 0.05 ? "ok" : "over",
    params: { tp: f1(m.truePeakDb), goal: f1(goal.tp) },
    value: `${f1(m.truePeakDb)} dBTP`,
  });
  // PLR: < 6 LU over-squashed, 6..8 dense, > 8 healthy (club targets allowed denser).
  const plrRed = target === "club" ? 4.5 : 6;
  const plrYellow = target === "club" ? 6 : 8;
  cards.push({
    id: "dynamics",
    status: m.plr < plrRed ? "red" : m.plr < plrYellow ? "yellow" : "green",
    messageKey: m.plr < plrRed ? "squashed" : m.plr < plrYellow ? "dense" : "ok",
    params: { plr: f1(m.plr), lra: f1(m.lraLu) },
    value: `PLR ${f1(m.plr)}`,
  });
  const tonalBands = (["lowmid", "mid", "high", "air"] as const).map((b) => [b, m.tonal[b].delta] as const);
  const worst = tonalBands.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  cards.push({
    id: "tonal",
    status: Math.abs(worst[1]) <= 4 ? "green" : Math.abs(worst[1]) <= 7 ? "yellow" : "red",
    messageKey: Math.abs(worst[1]) <= 4 ? "ok" : worst[0] === "high" || worst[0] === "air" ? (worst[1] < 0 ? "dark" : "harsh") : worst[1] < 0 ? "thin" : "muddy",
    params: { band: worst[0], delta: f1(worst[1]) },
    value: `${worst[1] > 0 ? "+" : ""}${f1(worst[1])} dB`,
  });
  const low = (m.tonal.sub.delta + m.tonal.bass.delta) / 2;
  cards.push({
    id: "lowEnd",
    status: Math.abs(low) <= 4 ? "green" : Math.abs(low) <= 7 ? "yellow" : "red",
    messageKey: Math.abs(low) <= 4 ? "ok" : low < 0 ? "weak" : "boomy",
    params: { delta: f1(low) },
    value: `${low > 0 ? "+" : ""}${f1(low)} dB`,
  });
  cards.push({
    id: "stereo",
    status: m.correlation < 0 ? "red" : m.correlation < 0.2 || m.sideToMid > 0.9 ? "yellow" : "green",
    messageKey: m.correlation < 0 ? "phase" : m.sideToMid > 0.9 ? "wide" : m.correlation < 0.2 ? "phase" : m.sideToMid < 0.05 ? "mono" : "ok",
    params: { corr: m.correlation.toFixed(2), width: Math.round(m.sideToMid * 100) },
    value: m.correlation.toFixed(2),
  });
  const redCount = cards.filter((c) => c.status === "red").length;
  const yellowCount = cards.filter((c) => c.status === "yellow").length;
  return { overall: redCount ? "red" : yellowCount ? "yellow" : "green", cards, redCount, yellowCount, ready: redCount === 0 };
}
