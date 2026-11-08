/** Whether a cleaned WAV may replace a take. Rejects a short preview of a longer take. */

const MAX_BYTES = 52_428_800;
const MAX_SECONDS = 360;
const TOLERANCE_SECONDS = 2;

export type NoiseSaveDecision =
  | { ok: true }
  | { ok: false; error: "bad_wav" | "too_big" | "too_long" | "truncated" | "take_unknown" };

export function decideNoiseSave(input: {
  wavSeconds: number;
  byteSize: number;
  takeSeconds: number | null;
}): NoiseSaveDecision {
  if (!Number.isFinite(input.wavSeconds) || input.wavSeconds <= 0) return { ok: false, error: "bad_wav" };
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 44 || input.byteSize > MAX_BYTES) {
    return { ok: false, error: "too_big" };
  }
  if (input.wavSeconds > MAX_SECONDS) return { ok: false, error: "too_long" };
  if (input.takeSeconds == null || !Number.isFinite(input.takeSeconds) || input.takeSeconds <= 0) {
    return { ok: false, error: "take_unknown" };
  }
  if (input.wavSeconds < input.takeSeconds - TOLERANCE_SECONDS) return { ok: false, error: "truncated" };
  if (input.wavSeconds > input.takeSeconds + TOLERANCE_SECONDS) return { ok: false, error: "too_long" };
  return { ok: true };
}
