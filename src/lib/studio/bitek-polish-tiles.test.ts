import { describe, expect, it } from "vitest";

import { BITEK_POLISH_TILES, bitekPolishTileById } from "./bitek-polish-tiles";

describe("BITEK polish tiles", () => {
  it("includes denoise as noise tile and light pitch after glue", () => {
    const ids = BITEK_POLISH_TILES.map((t) => t.id);
    expect(ids).toEqual(["sibilance", "mud", "noise", "glue", "pitch"]);
    expect(bitekPolishTileById("noise")?.fixes).toEqual(["denoise"]);
    expect(bitekPolishTileById("pitch")?.fixes).toEqual(["tune"]);
  });
});
