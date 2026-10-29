/**
 * Chromaprint raw fingerprint helpers (pure; no IO).
 * One raw item ≈ 0.1238 s (11025 Hz, hop 1365).
 */
export const CHROMAPRINT_ITEM_SECONDS = 1365 / 11025;
/** Items whose Hamming distance is <= this are considered "same audio". */
export const ITEM_MAX_BIT_ERRORS = 6;

export type FpcalcRaw = { duration: number; fingerprint: number[] };

export function parseFpcalcJson(stdout: string): { duration: number; fingerprint: unknown } {
  const parsed = JSON.parse(stdout) as { duration?: unknown; fingerprint?: unknown };
  const duration = Number(parsed.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("fpcalc_bad_duration");
  return { duration, fingerprint: parsed.fingerprint };
}

export function parseFpcalcRaw(stdout: string): FpcalcRaw {
  const { duration, fingerprint } = parseFpcalcJson(stdout);
  if (!Array.isArray(fingerprint) || fingerprint.length === 0) throw new Error("fpcalc_bad_fingerprint");
  // Postgres int[] is signed 32-bit; fpcalc emits unsigned.
  return { duration, fingerprint: fingerprint.map((v) => Number(v) | 0) };
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export type FingerprintMatch = {
  /** Fraction of the shorter overlapping span that matches (0..1). */
  score: number;
  matchedSeconds: number;
  /** Offset of b relative to a, in seconds. */
  offsetSeconds: number;
};

/**
 * Best alignment between two raw fingerprints. Candidate offsets come from
 * voting on the top 20 bits of each item, then each candidate is scored by
 * the share of aligned items within ITEM_MAX_BIT_ERRORS.
 */
export function compareFingerprints(a: number[], b: number[], maxCandidates = 5): FingerprintMatch {
  const none: FingerprintMatch = { score: 0, matchedSeconds: 0, offsetSeconds: 0 };
  if (a.length === 0 || b.length === 0) return none;
  const index = new Map<number, number[]>();
  for (let j = 0; j < b.length; j++) {
    const key = b[j]! >>> 12;
    const list = index.get(key);
    if (list) list.push(j);
    else index.set(key, [j]);
  }
  const votes = new Map<number, number>();
  for (let i = 0; i < a.length; i++) {
    const list = index.get(a[i]! >>> 12);
    if (!list) continue;
    for (const j of list) votes.set(j - i, (votes.get(j - i) ?? 0) + 1);
  }
  const candidates = [...votes.entries()].sort((x, y) => y[1] - x[1]).slice(0, maxCandidates);
  if (candidates.length === 0) candidates.push([0, 0]);
  let best = none;
  for (const [offset] of candidates) {
    let good = 0;
    let overlap = 0;
    for (let i = Math.max(0, -offset); i < a.length && i + offset < b.length; i++) {
      overlap++;
      if (popcount32((a[i]! ^ b[i + offset]!) >>> 0) <= ITEM_MAX_BIT_ERRORS) good++;
    }
    if (overlap === 0) continue;
    const score = good / overlap;
    if (score > best.score) {
      best = {
        score: Math.round(score * 10000) / 10000,
        matchedSeconds: Math.round(good * CHROMAPRINT_ITEM_SECONDS * 10) / 10,
        offsetSeconds: Math.round(offset * CHROMAPRINT_ITEM_SECONDS * 10) / 10,
      };
    }
  }
  return best;
}
