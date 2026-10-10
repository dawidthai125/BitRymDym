/**
 * SFM-3 — Node biquad coefficients matching Web Audio BiquadFilterNode
 * (Audio EQ Cookbook / W3C filter characteristics).
 *
 * Shelves: Q is ignored (S = 1), matching Web Audio. Peaking uses Q.
 * Direct Form I, stereo, independent channel state.
 */

export type BiquadCoeffs = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

export type BiquadChannelState = {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

export type StereoBiquadState = {
  left: BiquadChannelState;
  right: BiquadChannelState;
};

export type BiquadFilterKind = "lowshelf" | "peaking" | "highshelf";

function emptyChannel(): BiquadChannelState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

export function createStereoBiquadState(): StereoBiquadState {
  return { left: emptyChannel(), right: emptyChannel() };
}

/** Approximate bytes retained per stereo biquad state (8 floats). */
export const STEREO_BIQUAD_STATE_BYTES = 8 * 4;

/**
 * Web Audio / RBJ cookbook coefficients, normalized so a0 = 1.
 * Shelves use S = 1 (Q unused). Peaking uses classic EE Q.
 */
export function computeBiquadCoeffs(
  kind: BiquadFilterKind,
  sampleRate: number,
  frequencyHz: number,
  gainDb: number,
  q: number,
): BiquadCoeffs {
  const sr = Math.max(1, sampleRate);
  const f0 = Math.min(Math.max(frequencyHz, 1e-6), sr * 0.499);
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);

  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;

  if (kind === "peaking") {
    const Q = Math.max(1e-6, q);
    const alpha = sin / (2 * Q);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    // Web Audio: Q not used for shelves → S = 1 → alpha = sin(w0)/2 * √2
    const S = 1;
    const alpha =
      (sin / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    if (kind === "lowshelf") {
      b0 = A * (A + 1 - (A - 1) * cos + twoSqrtAAlpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - twoSqrtAAlpha);
      a0 = A + 1 + (A - 1) * cos + twoSqrtAAlpha;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - twoSqrtAAlpha;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + twoSqrtAAlpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - twoSqrtAAlpha);
      a0 = A + 1 - (A - 1) * cos + twoSqrtAAlpha;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - twoSqrtAAlpha;
    }
  }

  const inv = 1 / a0;
  return {
    b0: b0 * inv,
    b1: b1 * inv,
    b2: b2 * inv,
    a1: a1 * inv,
    a2: a2 * inv,
  };
}

function processChannel(
  x: number,
  c: BiquadCoeffs,
  s: BiquadChannelState,
): number {
  const y = c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2;
  s.x2 = s.x1;
  s.x1 = x;
  s.y2 = s.y1;
  s.y1 = y;
  return y;
}

export function processStereoBiquadSample(
  left: number,
  right: number,
  coeffs: BiquadCoeffs,
  state: StereoBiquadState,
): { left: number; right: number } {
  return {
    left: processChannel(left, coeffs, state.left),
    right: processChannel(right, coeffs, state.right),
  };
}
