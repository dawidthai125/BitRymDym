import { describe, expect, it } from "vitest";

import { BITEK_POLISH_TILES, bitekPolishTileById } from "./bitek-polish-tiles";

describe("BITEK polish tiles", () => {
  it("includes denoise as noise tile after mud", () => {
    const ids = BITEK_POLISH_TILES.map((t) => t.id);
    expect(ids).toEqual(["sibilance", "mud", "noise", "glue"]);
    expect(bitekPolishTileById("noise")?.fixes).toEqual(["denoise"]);
  });
});
