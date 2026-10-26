import { describe, expect, it } from "vitest";

import { formatBeatCountLabel } from "@/lib/ui/format-beat-count-label";

describe("formatBeatCountLabel", () => {
  it.each([
    [0, "0 bitów"],
    [1, "1 bit"],
    [2, "2 bity"],
    [3, "3 bity"],
    [4, "4 bity"],
    [5, "5 bitów"],
    [12, "12 bitów"],
    [13, "13 bitów"],
    [14, "14 bitów"],
    [21, "21 bitów"],
    [22, "22 bity"],
    [24, "24 bity"],
  ] as const)("n=%i → %s", (n, expected) => {
    expect(formatBeatCountLabel(n)).toBe(expected);
  });
});
