/**
 * Studio track automation (Silver/Gold) — gain and pan envelopes.
 * Pure model shared by the API, the browser engine and the server renderers: one definition of what
 * the value is at time t, so the preview and the mastered file agree. No I/O.
 *
 * Stored on studio_tracks.automation (jsonb): { v: 1, lanes: [{ param, points: [{ t, v }] }] }.
 * t = milliseconds on the project timeline, v = dB for gainDb or -1..1 for pan.
 * Between points the value moves linearly; before the first / after the last point it holds.
 */

export const AUTOMATION_VERSION = 1 as const;
export type AutomationParam = "gainDb" | "pan";
export const AUTOMATION_PARAMS: readonly AutomationParam[] = ["gainDb", "pan"];

export type AutomationPoint = { t: number; v: number };
export type AutomationLane = { param: AutomationParam; points: AutomationPoint[] };
export type StudioAutomationV1 = { v: typeof AUTOMATION_VERSION; lanes: AutomationLane[] };

export const AUTOMATION_LIMITS = {
  /** One lane per parameter. */
  maxLanes: 2,
  maxPoints: 256,
  /** Same ceiling as the document timeline (1 h in ms). */
  maxTimeMs: 3_600_000,
  range: { gainDb: { min: -60, max: 12 }, pan: { min: -1, max: 1 } } as Record<AutomationParam, { min: number; max: number }>,
  /** Serialised size guard (the DB checks the same). */
  maxBytes: 16_000,
} as const;

export const isAutomationParam = (v: unknown): v is AutomationParam => v === "gainDb" || v === "pan";

export class AutomationValidationError extends Error {
  constructor(
    message: string,
    readonly code: "bad_shape" | "bad_param" | "bad_point" | "too_many_points" | "too_many_lanes" | "too_big" | "duplicate_lane",
  ) {
    super(message);
    this.name = "AutomationValidationError";
  }
}

export function emptyAutomation(): StudioAutomationV1 {
  return { v: AUTOMATION_VERSION, lanes: [] };
}

export function hasAutomation(a: StudioAutomationV1 | null | undefined): boolean {
  return !!a && a.lanes.some((l) => l.points.length > 0);
}

export function clampAutomationValue(param: AutomationParam, value: number): number {
  const { min, max } = AUTOMATION_LIMITS.range[param];
  return Math.min(max, Math.max(min, value));
}

function cleanPoints(param: AutomationParam, raw: unknown[], strict: boolean): AutomationPoint[] {
  const out: AutomationPoint[] = [];
  for (const p of raw) {
    const t = (p as { t?: unknown } | null)?.t;
    const v = (p as { v?: unknown } | null)?.v;
    const ok = typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= AUTOMATION_LIMITS.maxTimeMs && typeof v === "number" && Number.isFinite(v);
    if (!ok) {
      if (strict) throw new AutomationValidationError("Nieprawidłowy punkt automatyki.", "bad_point");
      continue;
    }
    out.push({ t: Math.round(t), v: Math.round(clampAutomationValue(param, v) * 1000) / 1000 });
  }
  // Time order; a second point at the same millisecond replaces the first (last write wins).
  out.sort((a, b) => a.t - b.t);
  const dedup: AutomationPoint[] = [];
  for (const p of out) {
    if (dedup.length && dedup[dedup.length - 1].t === p.t) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  return dedup;
}

function build(raw: unknown, strict: boolean): StudioAutomationV1 {
  if (raw == null) return emptyAutomation();
  const o = raw as { v?: unknown; lanes?: unknown };
  if (typeof raw !== "object" || Array.isArray(raw) || o.v !== AUTOMATION_VERSION || !Array.isArray(o.lanes)) {
    if (strict) throw new AutomationValidationError("Nieprawidłowy format automatyki.", "bad_shape");
    return emptyAutomation();
  }
  if (strict && o.lanes.length > AUTOMATION_LIMITS.maxLanes) {
    throw new AutomationValidationError("Za dużo ścieżek automatyki.", "too_many_lanes");
  }
  const lanes: AutomationLane[] = [];
  const seen = new Set<AutomationParam>();
  for (const l of o.lanes.slice(0, AUTOMATION_LIMITS.maxLanes)) {
    const param = (l as { param?: unknown } | null)?.param;
    const pts = (l as { points?: unknown } | null)?.points;
    if (!isAutomationParam(param) || !Array.isArray(pts)) {
      if (strict) throw new AutomationValidationError("Nieprawidłowy parametr automatyki.", "bad_param");
      continue;
    }
    if (seen.has(param)) {
      if (strict) throw new AutomationValidationError("Parametr jest już zautomatyzowany.", "duplicate_lane");
      continue;
    }
    if (strict && pts.length > AUTOMATION_LIMITS.maxPoints) {
      throw new AutomationValidationError(`Maks. ${AUTOMATION_LIMITS.maxPoints} punktów na parametr.`, "too_many_points");
    }
    seen.add(param);
    const points = cleanPoints(param, pts.slice(0, AUTOMATION_LIMITS.maxPoints), strict);
    if (points.length) lanes.push({ param, points });
  }
  const result: StudioAutomationV1 = { v: AUTOMATION_VERSION, lanes };
  if (strict && JSON.stringify(result).length > AUTOMATION_LIMITS.maxBytes) {
    throw new AutomationValidationError("Automatyka jest za duża.", "too_big");
  }
  return result;
}

/** Strict parse for writes (API). Throws AutomationValidationError. */
export function parseAutomationForWrite(raw: unknown): StudioAutomationV1 {
  return build(raw, true);
}

/** Tolerant read (DB row → value). Never throws; drops anything invalid. */
export function readAutomation(raw: unknown): StudioAutomationV1 {
  try {
    return build(raw, false);
  } catch {
    return emptyAutomation();
  }
}

export function automationLane(a: StudioAutomationV1 | null | undefined, param: AutomationParam): AutomationLane | null {
  return a?.lanes.find((l) => l.param === param && l.points.length > 0) ?? null;
}

/**
 * Value of a lane at time tMs: linear between points, held outside them.
 * No points → `fallback` (the track's static gain / pan).
 */
export function evalAutomation(points: readonly AutomationPoint[] | null | undefined, tMs: number, fallback: number): number {
  if (!points || points.length === 0) return fallback;
  if (points.length === 1 || tMs <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (tMs >= last.t) return last.v;
  // Binary search for the segment [lo, lo + 1] containing tMs.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= tMs) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  return a.v + ((b.v - a.v) * (tMs - a.t)) / (b.t - a.t);
}

/** Convenience: the value of a parameter on a track at tMs (automation, else the static value). */
export function trackParamAt(a: StudioAutomationV1 | null | undefined, param: AutomationParam, tMs: number, staticValue: number): number {
  const lane = automationLane(a, param);
  return lane ? clampAutomationValue(param, evalAutomation(lane.points, tMs, staticValue)) : staticValue;
}
