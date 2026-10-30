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

/**
 * Mastering styles (every plan that can master). A style is a set of macro-setting
 * offsets scaled by intensity 0–100 % and added on top of the user's own settings
 * (then clamped to −3..3). Same function for the browser preview and the E3 job.
 */
export const MASTER_STYLE_IDS = ["warm", "bright", "loud", "dynamic"] as const;
export type MasterStyleId = (typeof MASTER_STYLE_IDS)[number];
export const isMasterStyleId = (v: unknown): v is MasterStyleId => typeof v === "string" && (MASTER_STYLE_IDS as readonly string[]).includes(v);

export const MASTER_STYLE_OFFSETS: Record<MasterStyleId, Partial<MasterSettings>> = {
  /** Ciepły: more low end, softer top, a little glue. */
  warm: { bass: 1.5, bright: -1.5, squash: 0.5 },
  /** Jasny: open top, slightly leaner low end, a touch wider. */
  bright: { bright: 2, bass: -0.5, width: 0.5 },
  /** Głośny: +2 LU over the target, denser compression. */
  loud: { loudness: 2, squash: 2 },
  /** Dynamiczny: −1.5 LU, light compression — keeps the punch. */
  dynamic: { loudness: -1.5, squash: -2 },
};

export const DEFAULT_MASTER_INTENSITY = 60;

export function clampIntensity(v: unknown, fallback = DEFAULT_MASTER_INTENSITY): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : fallback;
}

/** User settings + style offsets × intensity, clamped to −3..3 (not rounded to 0.5 steps). */
export function applyMasterStyle(settings: MasterSettings, style: MasterStyleId | null, intensity: number): MasterSettings {
  if (!style) return { ...settings };
  const k = clampIntensity(intensity, 0) / 100;
  const out = { ...settings };
  for (const key of MASTER_SETTING_KEYS) {
    const v = settings[key] + (MASTER_STYLE_OFFSETS[style][key] ?? 0) * k;
    out[key] = Math.round(Math.min(MASTER_SETTING_MAX, Math.max(MASTER_SETTING_MIN, v)) * 100) / 100;
  }
  return out;
}

/** Reference mastering limits (shared by UI, API and worker). */
export const REFERENCE_MAX_SECONDS = 600;
export const REFERENCE_MIN_SECONDS = 1;
export const REFERENCE_MAX_BYTES = 200 * 1024 * 1024;
export const REFERENCE_FORMATS = ["mp3", "wav"] as const;
export type ReferenceFormat = (typeof REFERENCE_FORMATS)[number];
/** Unused uploads are deleted after this (and every used one right after its master). */
export const REFERENCE_TTL_HOURS = 24;
/** Matching EQ never moves any frequency by more than this (dB at 100 % intensity). */
export const REFERENCE_EQ_MAX_DB = 6;
/** Upload part size (same as parts.ts PART_BYTES — Supabase 50 MB object cap). */
export const PART_BYTES_FOR_REFERENCE = 40 * 1024 * 1024;
export const DEFAULT_REFERENCE_INTENSITY = 70;
