/**
 * User beats 2026-10-30 — server-side key detection in the analyze step
 * (Vercel; no E3 worker). Reuses the Studio Tune Krumhansl–Schmuckler
 * detector on the mono PCM that BPM analysis already decoded, and turns it
 * into an upload-form suggestion (prefill like BPM, the owner can change it).
 */
import { chromaOf, keyFromChroma } from "@/lib/studio/tune/key-detect";
import { TUNE_KEY_NAMES } from "@/lib/studio/tune/tune";

export type BeatKeySuggestion = {
  /** Root note, e.g. "A" / "F#" (beats.key). */
  key: string;
  /** "major" | "minor" (beats.scale). */
  scale: "major" | "minor";
  /** 0..1 — correlation of the winning profile weighted by its margin. */
  confidence: number;
};

/** Below this the form leaves key/scale empty (manual). */
export const KEY_SUGGEST_MIN_CONFIDENCE = 0.3;

const MARGIN_FULL = 0.08;

export function keyConfidence(score: number, margin: number): number {
  const s = Math.min(1, Math.max(0, score));
  const m = Math.min(1, Math.max(0, margin / MARGIN_FULL));
  return Math.round(s * (0.5 + 0.5 * m) * 1000) / 1000;
}

export function detectBeatKeyFromMonoPcm(
  samples: Float32Array,
  sampleRate: number,
): BeatKeySuggestion | null {
  if (!(sampleRate > 0) || samples.length === 0) return null;
  const detected = keyFromChroma(chromaOf(samples, sampleRate));
  if (!detected || detected.scale === 2) return null;
  return {
    key: TUNE_KEY_NAMES[detected.keyRoot] ?? "C",
    scale: detected.scale === 1 ? "minor" : "major",
    confidence: keyConfidence(detected.score, detected.margin),
  };
}

/** Short label stored in beats.key_detected, e.g. "Am" / "F#". */
export function beatKeyDetectedLabel(s: BeatKeySuggestion): string {
  return `${s.key}${s.scale === "minor" ? "m" : ""}`;
}

/** Validate an untrusted suggestion echoed back by the upload form. */
export function parseBeatKeySuggestion(input: unknown): BeatKeySuggestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.key !== "string" ||
    !(TUNE_KEY_NAMES as readonly string[]).includes(raw.key)
  ) {
    return null;
  }
  if (raw.scale !== "major" && raw.scale !== "minor") return null;
  const c = raw.confidence;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1) return null;
  return { key: raw.key, scale: raw.scale, confidence: Math.round(c * 1000) / 1000 };
}
