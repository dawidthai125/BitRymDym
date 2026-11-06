import { describe, expect, it } from "vitest";

import {
  COVER_DHASH_MIN_STDDEV,
  dhashHex,
  grayStddev,
  hammingHex,
  nearestForeignCover,
} from "./cover-fingerprint";

function sample(fill: (x: number, y: number) => number): Uint8Array {
  const g = new Uint8Array(9 * 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) g[y * 9 + x] = fill(x, y);
  return g;
}

describe("cover dhash", () => {
  it("hashes a gradient and ignores a flat frame", () => {
    const gradient = sample((x) => x * 28);
    const hash = dhashHex(gradient, 9, 8);
    expect(hash).toHaveLength(16);
    expect(hammingHex(hash, hash)).toBe(0);
    expect(grayStddev(sample(() => 40))).toBeLessThan(COVER_DHASH_MIN_STDDEV);
    expect(grayStddev(gradient)).toBeGreaterThan(COVER_DHASH_MIN_STDDEV);
  });

  it("matches another owner's near copy and skips the same owner and flat art", () => {
    const picture = sample((x, y) => (x * 17 + y * 9) % 256);
    const hash = dhashHex(picture, 9, 8);
    const flipped = sample((x, y) => picture[y * 9 + x]! ^ 1);
    const near = dhashHex(flipped, 9, 8);
    const rows = [
      { id: "own", ownerId: "me", dhash: hash },
      { id: "other", ownerId: "them", dhash: near },
      { id: "blank", ownerId: "them", dhash: dhashHex(sample(() => 10), 9, 8) },
    ];
    const hit = nearestForeignCover(rows, {
      ownerId: "me",
      dhash: hash,
      stddev: grayStddev(picture),
    });
    expect(hit?.beatId).toBe("other");
    expect(hit!.distance).toBeLessThanOrEqual(8);
    expect(nearestForeignCover(rows, { ownerId: "me", dhash: hash, stddev: 0 })).toBeNull();
    expect(nearestForeignCover([{ id: "own", ownerId: "me", dhash: hash }], { ownerId: "me", dhash: hash, stddev: 40 })).toBeNull();
  });
});
