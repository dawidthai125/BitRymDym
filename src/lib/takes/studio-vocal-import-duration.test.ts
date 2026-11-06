import { describe, expect, it } from "vitest";

import { isStudioVocalImportTooLong } from "./studio-vocal-import";

describe("isStudioVocalImportTooLong", () => {
  it("accepts files within the beat cap", () => {
    expect(isStudioVocalImportTooLong(3, 4)).toBe(false);
    expect(isStudioVocalImportTooLong(4, 4)).toBe(false);
  });

  it("rejects files longer than the cap", () => {
    expect(isStudioVocalImportTooLong(6, 4)).toBe(true);
    expect(isStudioVocalImportTooLong(4.2, 4)).toBe(true);
  });

  it("does not block when duration or cap is unknown", () => {
    expect(isStudioVocalImportTooLong(null, 4)).toBe(false);
    expect(isStudioVocalImportTooLong(Number.NaN, 4)).toBe(false);
    expect(isStudioVocalImportTooLong(10, 0)).toBe(false);
  });
});
