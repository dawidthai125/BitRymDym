/**
 * P6.7.1 / P6.7.2 — Clip fade envelope helpers + write-path validation/CAS.
 * SSOT: docs/decisions/P6_7_CLIP_FADES_DESIGN_FREEZE.md
 *
 * effectiveGain = baseClipGain × fadeEnvelope
 * Fade is a clip runtime property — not automation lanes / not FX.
 */

import {
  clipGraphGain,
  type StudioEngineClip,
} from "@/lib/studio/studio-audio-schedule";
import {
  applyStudioFxCasToState,
  FX_CHAIN_CONFLICT_UI_PL,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";
import type { StudioClipDto } from "@/lib/studio/studio-types";

export type StudioNormalizedFades = {
  fadeInMs: number;
  fadeOutMs: number;
};

export type StudioFadeRampPoint = {
  /** AudioContext time (seconds) relative to schedule origin + contextTime. */
  atContextTime: number;
  /** Absolute linear gain to reach (base × envelope). */
  gain: number;
  kind: "set" | "linearRamp";
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Design Freeze §9.2 — proportional integer-safe normalize.
 * When Fi + Fo > D: Fi' + Fo' === D (preserving ratio).
 */
export function normalizeFades(
  fadeInMs: number,
  fadeOutMs: number,
  durationMs: number,
): StudioNormalizedFades {
  const D = Number.isFinite(durationMs) ? Math.trunc(durationMs) : 0;
  if (D <= 0) return { fadeInMs: 0, fadeOutMs: 0 };

  const Fi = clampInt(fadeInMs, 0, D);
  const Fo = clampInt(fadeOutMs, 0, D);
  if (Fi + Fo <= D) return { fadeInMs: Fi, fadeOutMs: Fo };

  const sum = Fi + Fo;
  const Fi2 = Math.floor((Fi * D) / sum);
  const Fo2 = D - Fi2;
  return { fadeInMs: Fi2, fadeOutMs: Fo2 };
}

/**
 * Design Freeze §8.2 — envelope at local clip time t.
 * Active window is 0 ≤ t < D. Outside → 0. Result clamped to [0, 1].
 */
export function fadeEnvelopeAt(
  localMs: number,
  fadeInMs: number,
  fadeOutMs: number,
  durationMs: number,
): number {
  const D = Number.isFinite(durationMs) ? Math.trunc(durationMs) : 0;
  if (D <= 0) return 0;

  const t = Number.isFinite(localMs) ? localMs : NaN;
  if (!Number.isFinite(t) || t < 0 || t >= D) return 0;

  const { fadeInMs: Fi, fadeOutMs: Fo } = normalizeFades(
    fadeInMs,
    fadeOutMs,
    D,
  );

  let env: number;
  if (Fi > 0 && t < Fi) {
    env = t / Fi;
  } else if (Fo > 0 && t >= D - Fo) {
    env = (D - t) / Fo;
  } else {
    env = 1;
  }

  if (!Number.isFinite(env)) return 0;
  if (env < 0) return 0;
  if (env > 1) return 1;
  return env;
}

/** Local clip time from timeline playhead (integer ms SSOT). */
export function clipLocalMs(
  playheadMs: number,
  timelineStartMs: number,
): number {
  if (!Number.isFinite(playheadMs) || !Number.isFinite(timelineStartMs)) {
    return Number.NaN;
  }
  return playheadMs - timelineStartMs;
}

/**
 * Base clip gain (persisted gainDb/muted) — independent of fade.
 * REUSE clipGraphGain.
 */
export function baseClipGain(
  clip: Pick<StudioEngineClip, "gainDb" | "muted">,
): number {
  return clipGraphGain(clip);
}

/** effectiveGain = baseClipGain × fadeEnvelope */
export function effectiveClipGain(
  clip: Pick<
    StudioEngineClip,
    "gainDb" | "muted" | "fadeInMs" | "fadeOutMs" | "durationMs" | "timelineStartMs"
  >,
  playheadMs: number,
): number {
  const base = baseClipGain(clip);
  const t = clipLocalMs(playheadMs, clip.timelineStartMs);
  const env = fadeEnvelopeAt(t, clip.fadeInMs, clip.fadeOutMs, clip.durationMs);
  const g = base * env;
  if (!Number.isFinite(g) || g < 0) return 0;
  return g;
}

export type StudioFadeSchedulePlan = {
  /** Immediate gain at schedule start. */
  immediateGain: number;
  /** Future automation points (absolute contextTime seconds). */
  ramps: StudioFadeRampPoint[];
};

/**
 * Plan cancel→set→linearRamp sequence for remaining envelope from playhead.
 * Pure: no AudioParam mutation. Engine applies the plan.
 */
export function planClipFadeSchedule(params: {
  clip: Pick<
    StudioEngineClip,
    | "gainDb"
    | "muted"
    | "fadeInMs"
    | "fadeOutMs"
    | "durationMs"
    | "timelineStartMs"
  >;
  playheadMs: number;
  contextTime: number;
  /** When false (pause/seek-hold), only immediate gain — no forward ramps. */
  scheduleForward: boolean;
}): StudioFadeSchedulePlan {
  const { clip, playheadMs, contextTime, scheduleForward } = params;
  const immediateGain = effectiveClipGain(clip, playheadMs);
  const ramps: StudioFadeRampPoint[] = [];

  if (!scheduleForward) {
    return { immediateGain, ramps };
  }

  const D = Number.isFinite(clip.durationMs) ? Math.trunc(clip.durationMs) : 0;
  const t = clipLocalMs(playheadMs, clip.timelineStartMs);
  if (D <= 0 || !Number.isFinite(t) || t < 0 || t >= D) {
    return { immediateGain, ramps };
  }

  const base = baseClipGain(clip);
  const { fadeInMs: Fi, fadeOutMs: Fo } = normalizeFades(
    clip.fadeInMs,
    clip.fadeOutMs,
    D,
  );
  const fadeOutStart = D - Fo;

  const at = (localTargetMs: number) =>
    contextTime + Math.max(0, localTargetMs - t) / 1000;

  if (Fi > 0 && t < Fi) {
    // Ramp through remaining fade-in to plateau (base × 1).
    ramps.push({
      atContextTime: at(Fi),
      gain: base,
      kind: "linearRamp",
    });
    if (Fo > 0) {
      // Hold plateau until fade-out start (set), then ramp to 0.
      if (fadeOutStart > Fi) {
        ramps.push({
          atContextTime: at(fadeOutStart),
          gain: base,
          kind: "set",
        });
      }
      ramps.push({
        atContextTime: at(D),
        gain: 0,
        kind: "linearRamp",
      });
    }
  } else if (Fo > 0 && t >= fadeOutStart) {
    ramps.push({
      atContextTime: at(D),
      gain: 0,
      kind: "linearRamp",
    });
  } else if (Fo > 0 && t < fadeOutStart) {
    ramps.push({
      atContextTime: at(fadeOutStart),
      gain: base,
      kind: "set",
    });
    ramps.push({
      atContextTime: at(D),
      gain: 0,
      kind: "linearRamp",
    });
  }

  return { immediateGain, ramps };
}

/** Minimal AudioParam-like surface used by the engine. */
export type StudioFadeGainParam = {
  value: number;
  cancelScheduledValues?: (when: number) => void;
  setValueAtTime?: (value: number, when: number) => void;
  linearRampToValueAtTime?: (value: number, when: number) => void;
};

/**
 * Apply planned fade to an AudioParam (or test fake).
 * Cancels prior automation, sets immediate gain, optionally schedules ramps.
 */
export function applyClipFadeGainParam(
  param: StudioFadeGainParam,
  clip: Pick<
    StudioEngineClip,
    | "gainDb"
    | "muted"
    | "fadeInMs"
    | "fadeOutMs"
    | "durationMs"
    | "timelineStartMs"
  >,
  playheadMs: number,
  contextTime: number,
  scheduleForward: boolean,
): void {
  const plan = planClipFadeSchedule({
    clip,
    playheadMs,
    contextTime,
    scheduleForward,
  });

  if (typeof param.cancelScheduledValues === "function") {
    param.cancelScheduledValues(contextTime);
  }

  if (typeof param.setValueAtTime === "function") {
    param.setValueAtTime(plan.immediateGain, contextTime);
  } else {
    param.value = plan.immediateGain;
  }

  if (!scheduleForward) return;

  for (const point of plan.ramps) {
    if (point.kind === "set") {
      if (typeof param.setValueAtTime === "function") {
        param.setValueAtTime(point.gain, point.atContextTime);
      }
    } else if (typeof param.linearRampToValueAtTime === "function") {
      param.linearRampToValueAtTime(point.gain, point.atContextTime);
    }
  }

  // Keep `.value` aligned for hosts/fakes that only read `.value`.
  param.value = plan.immediateGain;
}

/* ─── P6.7.2 write-path validation + in-memory CAS ─── */

const FADE_INVALID_PL =
  "Nie udało się zapisać fade. Sprawdź wartości i spróbuj ponownie.";

function fadeInvalid(detail?: string): never {
  throw new StudioFxChainError(
    "FX_CHAIN_INVALID",
    detail ? `${FADE_INVALID_PL} (${detail})` : FADE_INVALID_PL,
  );
}

/**
 * Design Freeze §9.1 — integer ms, >= 0, <= durationMs (before normalize).
 */
export function parseStudioFadeMs(
  raw: unknown,
  field: "fadeInMs" | "fadeOutMs",
  durationMs: number,
): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || !Number.isFinite(raw)) {
    fadeInvalid(field);
  }
  const D = Number.isFinite(durationMs) ? Math.trunc(durationMs) : 0;
  if (raw < 0) fadeInvalid(`${field} negative`);
  if (raw > D) fadeInvalid(`${field} > durationMs`);
  return raw;
}

/** Validate both sides then REUSE normalizeFades (§9.2). */
export function resolveStudioClipFadesForWrite(
  fadeInMs: unknown,
  fadeOutMs: unknown,
  durationMs: number,
): StudioNormalizedFades {
  const D = Number.isFinite(durationMs) ? Math.trunc(durationMs) : 0;
  const fi = parseStudioFadeMs(fadeInMs, "fadeInMs", D);
  const fo = parseStudioFadeMs(fadeOutMs, "fadeOutMs", D);
  return normalizeFades(fi, fo, D);
}

/**
 * Design Freeze §14 — fades after duration shrink/expand to D2.
 * Fi2 = min(Fi, D2); Fo2 = min(Fo, D2); then normalizeFades.
 */
export function resolveFadesAfterTrim(params: {
  fadeInMs: number;
  fadeOutMs: number;
  newDurationMs: number;
}): StudioNormalizedFades {
  const D2 = Number.isFinite(params.newDurationMs)
    ? Math.trunc(params.newDurationMs)
    : 0;
  const Fi = Number.isFinite(params.fadeInMs) ? Math.trunc(params.fadeInMs) : 0;
  const Fo = Number.isFinite(params.fadeOutMs) ? Math.trunc(params.fadeOutMs) : 0;
  const bound = Math.max(0, D2);
  const Fi2 = Math.min(Math.max(0, Fi), bound);
  const Fo2 = Math.min(Math.max(0, Fo), bound);
  return normalizeFades(Fi2, Fo2, D2);
}

export type StudioSplitFadesResult = {
  left: StudioNormalizedFades;
  right: StudioNormalizedFades;
};

/**
 * Design Freeze §15 — fade inheritance at local split offset S (0 < S < D).
 * Original fades are normalized against D first, then left/right rules apply.
 */
export function resolveFadesAfterSplit(params: {
  fadeInMs: number;
  fadeOutMs: number;
  durationMs: number;
  /** Local cut offset from clip start (equals left duration). */
  splitLocalMs: number;
}): StudioSplitFadesResult {
  const D = Number.isFinite(params.durationMs)
    ? Math.trunc(params.durationMs)
    : 0;
  const S = Number.isFinite(params.splitLocalMs)
    ? Math.trunc(params.splitLocalMs)
    : 0;
  const { fadeInMs: Fi, fadeOutMs: Fo } = normalizeFades(
    params.fadeInMs,
    params.fadeOutMs,
    D,
  );
  const Dr = D - S;

  const fadeInL = Math.min(Fi, S);
  let fadeOutL = 0;
  if (S > D - Fo) {
    fadeOutL = Math.min(S - (D - Fo), S);
  }
  const left = normalizeFades(fadeInL, fadeOutL, S);

  const fadeInR = 0;
  const fadeOutR = Math.min(Fo, Math.max(0, Dr));
  const right = normalizeFades(fadeInR, fadeOutR, Dr);

  return { left, right };
}

export type StudioClipFadesCasState = {
  documentVersion: number;
  fadeInMs: number;
  fadeOutMs: number;
};

/**
 * In-memory Clip Fades CAS — SSOT algorithm for tests / planning.
 * Reuses FX CAS conflict vocabulary (same document_version).
 */
export function applyStudioClipFadesCasToState(
  state: StudioClipFadesCasState,
  expectedDocumentVersion: number,
  input: {
    fadeInMs: unknown;
    fadeOutMs: unknown;
    durationMs: number;
  },
): StudioClipFadesCasState {
  const normalized = resolveStudioClipFadesForWrite(
    input.fadeInMs,
    input.fadeOutMs,
    input.durationMs,
  );
  return applyStudioFxCasToState(state, expectedDocumentVersion, (next) => {
    next.fadeInMs = normalized.fadeInMs;
    next.fadeOutMs = normalized.fadeOutMs;
  });
}

/* ─── P6.7.3 UI persist contract (no second normalize; explicit save) ─── */

export type StudioClipFadesPatchBody = {
  op: "set_fades";
  fadeInMs: number;
  fadeOutMs: number;
  expectedDocumentVersion: number;
};

export function buildStudioClipFadesPatchBody(params: {
  fadeInMs: number;
  fadeOutMs: number;
  expectedDocumentVersion: number;
}): StudioClipFadesPatchBody {
  return {
    op: "set_fades",
    fadeInMs: params.fadeInMs,
    fadeOutMs: params.fadeOutMs,
    expectedDocumentVersion: params.expectedDocumentVersion,
  };
}

export type StudioClipFadesPersistResult =
  | { ok: true; documentVersion: number; clip: StudioClipDto }
  | {
      ok: false;
      kind: "conflict" | "unauthorized" | "forbidden" | "validation" | "error";
      status: number;
      message: string;
    };

/**
 * Map Clip PATCH set_fades HTTP response → UI result.
 * Never retries. 409 never mutates local state (caller must not apply).
 */
export function interpretStudioClipFadesPersistResponse(
  status: number,
  json: {
    success?: boolean;
    clip?: StudioClipDto;
    documentVersion?: number;
    error?: string;
    code?: string;
  },
): StudioClipFadesPersistResult {
  if (status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
    return {
      ok: false,
      kind: "conflict",
      status: status === 409 ? 409 : status,
      message: json.error ?? FX_CHAIN_CONFLICT_UI_PL,
    };
  }
  if (status === 401) {
    return {
      ok: false,
      kind: "unauthorized",
      status: 401,
      message: json.error ?? "Zaloguj się, aby zapisać fade.",
    };
  }
  if (status === 403) {
    return {
      ok: false,
      kind: "forbidden",
      status: 403,
      message: json.error ?? "Brak uprawnień do zapisu fade.",
    };
  }
  if (status === 400) {
    return {
      ok: false,
      kind: "validation",
      status: 400,
      message:
        json.error ??
        "Nie udało się zapisać fade. Sprawdź wartości i spróbuj ponownie.",
    };
  }
  if (
    status < 200 ||
    status >= 300 ||
    !json.clip ||
    typeof json.documentVersion !== "number"
  ) {
    return {
      ok: false,
      kind: "error",
      status,
      message: json.error ?? "Nie udało się zapisać fade.",
    };
  }
  return {
    ok: true,
    documentVersion: json.documentVersion,
    clip: json.clip,
  };
}

/** UX hint only — backend normalizeFades remains SoT. */
export function studioClipFadesOverlapHint(
  fadeInMs: number,
  fadeOutMs: number,
  durationMs: number,
): boolean {
  const D = Number.isFinite(durationMs) ? Math.trunc(durationMs) : 0;
  if (D <= 0) return false;
  const fi = Number.isFinite(fadeInMs) ? Math.trunc(fadeInMs) : 0;
  const fo = Number.isFinite(fadeOutMs) ? Math.trunc(fadeOutMs) : 0;
  return fi + fo > D;
}
