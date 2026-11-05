/**
 * Measured tone and clarity for the whole song.
 * The master shelves are 1.5 dB per step. A mid-band problem is not a shelf:
 * that one goes back to Mix.
 */

import { MASTER_TARGETS, type MasterTargetId } from "@/lib/studio/master/targets";

import { resolveMasterLoudness } from "./master-loudness";
import type { BitekMasterSetting } from "./types";

export type ClarityCard = {
  id: string;
  status: string;
  value?: string | null;
  note?: string | null;
};

export type MasterClarityMove = {
  key: BitekMasterSetting;
  value: number;
  reason: "harsh" | "dark" | "boomy" | "weak" | "mud" | "thin" | "squashed" | "wide" | "phase" | "loudness";
};

export type MasterClarityPlan = {
  moves: MasterClarityMove[];
  /** The middle of the spectrum. The master shelf cannot fix it. */
  mixBand: "muddy" | "thin" | null;
};

const SHELF_DB = 1.5;

const clampKnob = (n: number) => Math.round(Math.min(3, Math.max(-3, n)) * 2) / 2;

function absDelta(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/** How many shelf steps close a measured gap, capped by how bad the card is. */
function stepsFor(status: string, deltaDb: number | null): number {
  const cap = status === "red" ? 3 : status === "yellow" ? 2 : 0;
  if (!cap) return 0;
  if (deltaDb === null) return status === "red" ? 2 : 1;
  return Math.min(cap, Math.max(1, Math.round(deltaDb / SHELF_DB)));
}

function noteOf(card: ClarityCard): { key: string; band: string | null } | null {
  if (!card.note) return null;
  const [key, band] = card.note.split(":");
  if (!key) return null;
  return { key, band: band ?? null };
}

export function planMasterClarity(input: {
  settings: Record<BitekMasterSetting, number>;
  cards: readonly ClarityCard[];
  measuredLufs: number | null;
  truePeakDb: number | null;
  target: string;
  lang: "pl" | "en";
  targetName: string;
}): MasterClarityPlan {
  const { settings } = input;
  const moves: MasterClarityMove[] = [];
  let mixBand: MasterClarityPlan["mixBand"] = null;

  const put = (key: BitekMasterSetting, value: number, reason: MasterClarityMove["reason"]) => {
    const next = clampKnob(value);
    if (next === settings[key]) return;
    const prev = moves.find((m) => m.key === key);
    if (prev && Math.abs(prev.value - settings[key]) >= Math.abs(next - settings[key])) return;
    if (prev) prev.value = next;
    else moves.push({ key, value: next, reason });
    if (prev) prev.reason = reason;
  };

  for (const card of input.cards) {
    const note = noteOf(card);
    if (!note || card.status === "green" || card.status === "na") continue;
    const delta = card.id === "tonal" || card.id === "lowEnd" ? absDelta(card.value) : null;
    const step = stepsFor(card.status, delta);
    if (!step && note.key !== "muddy" && note.key !== "thin") continue;
    if (card.id === "tonal" && note.key === "harsh") put("bright", settings.bright - step, "harsh");
    else if (card.id === "tonal" && note.key === "dark") put("bright", settings.bright + step, "dark");
    else if (card.id === "tonal" && note.key === "muddy" && note.band === "mid") mixBand = mixBand ?? "muddy";
    else if (card.id === "tonal" && note.key === "thin" && note.band === "mid") mixBand = mixBand ?? "thin";
    else if (card.id === "tonal" && note.key === "muddy") put("bass", settings.bass - step, "mud");
    else if (card.id === "tonal" && note.key === "thin") put("bass", settings.bass + step, "thin");
    else if (card.id === "lowEnd" && note.key === "boomy") put("bass", settings.bass - step, "boomy");
    else if (card.id === "lowEnd" && note.key === "weak") put("bass", settings.bass + step, "weak");
    else if (card.id === "dynamics" && (note.key === "squashed" || note.key === "dense")) {
      put("squash", settings.squash - (note.key === "dense" ? 1 : step), "squashed");
    } else if (card.id === "stereo" && note.key === "wide") put("width", settings.width - step, "wide");
    else if (card.id === "stereo" && note.key === "phase") {
      const toward = settings.width > 0 ? settings.width - step : settings.width < 0 ? settings.width + step : settings.width;
      put("width", toward, "phase");
    }
  }

  if (input.measuredLufs !== null && Number.isFinite(input.measuredLufs) && input.target in MASTER_TARGETS) {
    const id = input.target as MasterTargetId;
    const loud = resolveMasterLoudness({
      measuredLufs: input.measuredLufs,
      targetLufs: MASTER_TARGETS[id].lufs,
      truePeakDb: input.truePeakDb !== null && Number.isFinite(input.truePeakDb) ? input.truePeakDb : null,
      ceilingDb: MASTER_TARGETS[id].tp,
      currentOffset: settings.loudness,
      lang: input.lang,
      targetName: input.targetName,
    });
    if (loud.changesKnob) put("loudness", loud.offset, "loudness");
  }

  return { moves, mixBand };
}
