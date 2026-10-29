/** Stage 3 — Mastering targets + whole-track settings (shared by UI, API, worker, BITEK). */

export const MASTER_TARGETS = {
  streaming: { lufs: -14, tp: -1 },
  youtube: { lufs: -14, tp: -1 },
  headphones: { lufs: -16, tp: -1 },
  club: { lufs: -9, tp: -0.3 },
} as const;

export type MasterTargetId = keyof typeof MASTER_TARGETS;
export const MASTER_TARGET_IDS = Object.keys(MASTER_TARGETS) as MasterTargetId[];

export const isMasterTargetId = (v: unknown): v is MasterTargetId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(MASTER_TARGETS, v);

/** Whole-track macro settings, each -3..3 steps (0 = engine default). Same keys as scripts/master/master.py. */
export const MASTER_SETTING_KEYS = ["loudness", "bright", "bass", "width", "squash"] as const;
export type MasterSettingKey = (typeof MASTER_SETTING_KEYS)[number];
export type MasterSettings = Record<MasterSettingKey, number>;
export const MASTER_SETTING_MIN = -3;
export const MASTER_SETTING_MAX = 3;

export const DEFAULT_MASTER_SETTINGS: MasterSettings = { loudness: 0, bright: 0, bass: 0, width: 0, squash: 0 };

export function clampMasterSettings(raw: unknown): MasterSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_MASTER_SETTINGS };
  for (const k of MASTER_SETTING_KEYS) {
    const v = typeof r[k] === "number" ? (r[k] as number) : typeof r[k] === "string" ? Number(r[k]) : 0;
    out[k] = Number.isFinite(v) ? Math.round(Math.min(MASTER_SETTING_MAX, Math.max(MASTER_SETTING_MIN, v)) * 2) / 2 : 0;
  }
  return out;
}

/** Effective loudness goal: target LUFS + loudness offset (1 step = 1 LU). TP ceiling never moves. */
export function masterGoal(target: MasterTargetId, settings: MasterSettings): { lufs: number; tp: number } {
  return { lufs: MASTER_TARGETS[target].lufs + settings.loudness, tp: MASTER_TARGETS[target].tp };
}

/** Hip-hop / rap reference tonal balance (band energy vs total, dB). Same table as master.py. */
export const MASTER_BANDS = [
  { id: "sub", loHz: 20, hiHz: 60 },
  { id: "bass", loHz: 60, hiHz: 250 },
  { id: "lowmid", loHz: 250, hiHz: 1000 },
  { id: "mid", loHz: 1000, hiHz: 4000 },
  { id: "high", loHz: 4000, hiHz: 10000 },
  { id: "air", loHz: 10000, hiHz: 20000 },
] as const;
export type MasterBandId = (typeof MASTER_BANDS)[number]["id"];
export const HIPHOP_REFERENCE_DB: Record<MasterBandId, number> = {
  sub: -6.5,
  bass: -4,
  lowmid: -8.5,
  mid: -11,
  high: -16,
  air: -25,
};
