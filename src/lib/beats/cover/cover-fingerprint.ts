/**
 * Own-catalog cover likeness. 64-bit dHash of a 9×8 grayscale sample.
 * A flat image (solid colour, empty frame) is not a copyright match:
 * those hashes collide with each other.
 */

export const COVER_DHASH_BITS = 64;
export const COVER_DHASH_MAX_DISTANCE = 8;
/** Stddev of the 9×8 sample, 0–255. Below this the picture is too flat to compare. */
export const COVER_DHASH_MIN_STDDEV = 12;

export type CoverHashRow = {
  id: string;
  ownerId: string | null;
  dhash: string | null;
};

const DHASH_RE = /^[0-9a-f]{16}$/;

export function isCoverDhash(value: unknown): value is string {
  return typeof value === "string" && DHASH_RE.test(value);
}

/** `gray` is row-major, width × height, one byte per pixel. Width must be 9, height 8. */
export function dhashHex(gray: Uint8Array, width: number, height: number): string {
  if (width < 2 || height < 1 || gray.length < width * height) {
    throw new Error("dhash sample is too small");
  }
  let bits = BigInt(0);
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1 && i < COVER_DHASH_BITS; x++) {
      if (gray[y * width + x]! > gray[y * width + x + 1]!) bits |= BigInt(1) << BigInt(i);
      i++;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function grayStddev(gray: Uint8Array): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (const p of gray) sum += p;
  const mean = sum / gray.length;
  let v = 0;
  for (const p of gray) {
    const d = p - mean;
    v += d * d;
  }
  return Math.sqrt(v / gray.length);
}

export function hammingHex(a: string, b: string): number {
  if (!isCoverDhash(a) || !isCoverDhash(b)) return COVER_DHASH_BITS;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}

/**
 * Closest cover that belongs to someone else.
 * Flat samples and the same owner's covers are ignored.
 */
export function nearestForeignCover(
  rows: readonly CoverHashRow[],
  query: { ownerId: string; excludeBeatId?: string | null; dhash: string; stddev: number },
): { beatId: string; distance: number } | null {
  if (query.stddev < COVER_DHASH_MIN_STDDEV || !isCoverDhash(query.dhash)) return null;
  let best: { beatId: string; distance: number } | null = null;
  for (const row of rows) {
    if (!row.dhash || !isCoverDhash(row.dhash)) continue;
    if (row.ownerId === query.ownerId) continue;
    if (query.excludeBeatId && row.id === query.excludeBeatId) continue;
    const distance = hammingHex(query.dhash, row.dhash);
    if (!best || distance < best.distance) best = { beatId: row.id, distance };
  }
  if (!best || best.distance > COVER_DHASH_MAX_DISTANCE) return null;
  return best;
}
