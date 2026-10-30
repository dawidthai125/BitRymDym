/**
 * BRD Tune — shared helpers (framework-free): key parsing, styles, plan gate,
 * latency compensation. DSP lives in `tune-core.ts`.
 */
import type { PremiumTier } from "@/types/premium";
import { pitchCorrectionAccessForTier } from "@/config/plan-policy";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  defaultStudioFxParams,
  interpretStudioFxChainForPlayback,
  type StudioFxChainV1,
  type StudioFxInstance,
  type StudioFxTuneParams,
} from "@/lib/studio/studio-fx-chain";

import type { TuneCoreParams } from "./tune-core";

export const TUNE_KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const TUNE_SCALE = { major: 0, minor: 1, chromatic: 2 } as const;
/** Fixed processing latency of TuneCore (compensated in every render path). */
export const TUNE_LATENCY_MS = 40;

export type TuneStyle = "natural" | "hard";
export const TUNE_STYLES: Record<TuneStyle, Pick<StudioFxTuneParams, "retuneMs" | "amount">> = {
  /** Free: gentle, keeps some natural movement. */
  natural: { retuneMs: 100, amount: 0.85 },
  /** Silver+: instant snap — the hard "trap" sound. */
  hard: { retuneMs: 0, amount: 1 },
};

export type TuneKey = { keyRoot: number; scale: 0 | 1 | 2 };

const NOTE_BASE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 };

/**
 * Beat metadata (`beats.key`, `beats.scale`, free text) → key. Accepts
 * "Am", "A minor", "F#m", "Db", "C-dur", "a-moll", "Bb maj", key "A" + scale "minor".
 * Unknown → null (caller detects from audio or asks the user).
 */
export function parseBeatKey(key: string | null | undefined, scale?: string | null): TuneKey | null {
  const raw = `${key ?? ""} ${scale ?? ""}`.trim();
  const m = /^([A-Ha-h])(#|♯|is|es|b|♭|s)?(.*)$/.exec(raw);
  if (!m) return null;
  const letter = m[1]!;
  const acc = m[2] ?? "";
  let root = NOTE_BASE[letter.toLowerCase()]!;
  if (acc === "#" || acc === "♯" || acc === "is") root += 1;
  else if (acc) root -= 1;
  root = (root + 12) % 12;
  const restRaw = (m[3] ?? "").replace(/^[\s-]+/, "").trim();
  const rest = restRaw.toLowerCase();
  if (rest && !/^(m|min|minor|moll|mol|maj|major|dur|m7|min7|mi)\b|^(m|maj|min)/.test(rest)) return null;
  let minor: boolean;
  if (/\b(maj|major|dur)\b|^maj/.test(rest) || restRaw === "M") minor = false;
  else if (/^m|\b(min|minor|moll|mol)\b/.test(rest)) minor = true;
  // German/Polish convention: a bare lowercase letter ("a", "a-moll") = minor.
  else minor = letter === letter.toLowerCase() && letter !== "b";
  return { keyRoot: root, scale: minor ? 1 : 0 };
}

export function formatTuneKey(k: TuneKey, lang: "pl" | "en" = "pl"): string {
  if (k.scale === 2) return lang === "pl" ? "chromatycznie" : "chromatic";
  const name = TUNE_KEY_NAMES[k.keyRoot] ?? "C";
  if (lang === "pl") return `${name} ${k.scale === 1 ? "moll" : "dur"}`;
  return `${name} ${k.scale === 1 ? "minor" : "major"}`;
}

export function tuneStyleOf(p: Pick<StudioFxTuneParams, "retuneMs" | "amount">): TuneStyle | "custom" {
  for (const style of ["natural", "hard"] as const) {
    const s = TUNE_STYLES[style];
    if (Math.abs(p.retuneMs - s.retuneMs) < 1e-6 && Math.abs(p.amount - s.amount) < 1e-6) return style;
  }
  return "custom";
}

export function tuneParams(key: TuneKey | null, style: TuneStyle): StudioFxTuneParams {
  const base = defaultStudioFxParams("tune");
  return {
    ...base,
    ...(key ? { keyRoot: key.keyRoot, scale: key.scale } : {}),
    ...TUNE_STYLES[style],
  };
}

export function toTuneCoreParams(p: StudioFxTuneParams): TuneCoreParams {
  return { keyRoot: p.keyRoot, scale: p.scale, retuneMs: p.retuneMs, amount: p.amount };
}

/** True when the plan may store these params (Free/Bronze: natural style only). */
export function tuneParamsAllowedForTier(tier: PremiumTier, p: StudioFxTuneParams): boolean {
  if (pitchCorrectionAccessForTier(tier).custom) return true;
  return tuneStyleOf(p) === "natural";
}

/** First tune effect that the plan may not store, or null when the chain is fine. */
export function findLockedTuneEffect(tier: PremiumTier, chain: StudioFxChainV1 | null | undefined): StudioFxInstance | null {
  for (const e of chain?.effects ?? []) {
    if (e.type === "tune" && !tuneParamsAllowedForTier(tier, e.params)) return e;
  }
  return null;
}

/** Client helper: presets / BITEK on a lower plan get the natural style instead. */
export function clampTuneChainForTier(tier: PremiumTier, chain: StudioFxChainV1): StudioFxChainV1 {
  if (!findLockedTuneEffect(tier, chain)) return chain;
  return {
    ...chain,
    effects: chain.effects.map((e) =>
      e.type === "tune" && !tuneParamsAllowedForTier(tier, e.params)
        ? { ...e, params: { ...e.params, ...TUNE_STYLES.natural } }
        : e,
    ),
  };
}

/** Enabled tune inserts in a raw chain (each adds TUNE_LATENCY_MS). */
export function enabledTuneCount(rawChain: unknown): number {
  const plan = interpretStudioFxChainForPlayback(rawChain);
  if (plan.kind !== "chain") return 0;
  return plan.slots.filter((s) => s.status === "ready" && s.effect.type === "tune").length;
}

/**
 * Per-sample paths (live preview, legacy per-sample export) run TuneCore as a
 * stream with a fixed delay. Compensate by starting clips of tuned tracks
 * earlier — exactly what a DAW's plugin-delay compensation does. Whole-buffer
 * renders (E3 mix/master, analysis) compensate inside processBuffer instead.
 */
export function compensateStudioTuneLatency<D extends StudioEngineDocument>(document: D): D {
  const shiftByTrack = new Map<string, number>();
  for (const t of document.tracks) {
    const count = enabledTuneCount(t.effectsChain);
    if (count > 0) shiftByTrack.set(t.id, count * TUNE_LATENCY_MS);
  }
  if (shiftByTrack.size === 0) return document;
  const clips = document.clips.map((clip) => {
    const shift = shiftByTrack.get(clip.trackId);
    if (!shift) return clip;
    const start = clip.timelineStartMs - shift;
    if (start >= 0) return { ...clip, timelineStartMs: start };
    // Clip starts within the first `shift` ms: trim its head instead.
    const cut = Math.min(-start, Math.max(0, clip.durationMs - 1));
    return {
      ...clip,
      timelineStartMs: 0,
      sourceOffsetMs: clip.sourceOffsetMs + cut,
      durationMs: clip.durationMs - cut,
    };
  });
  return { ...document, clips };
}
