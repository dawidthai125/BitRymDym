/**
 * 1-tap Bitek Vocal Polish tiles → existing mix-autofix ids (no new DSP).
 */

import type { MixPlanFixId } from "@/lib/studio/mix-autofix/plan";

export type BitekPolishTileId = "mud" | "sibilance" | "glue";

export type BitekPolishTile = {
  id: BitekPolishTileId;
  /** i18n key under studio.mixStep.polishTiles.<id> */
  labelKey: string;
  fixes: readonly MixPlanFixId[];
};

/** Producent order: Sybilanty → Muł → Klej. */
export const BITEK_POLISH_TILES: readonly BitekPolishTile[] = [
  {
    id: "sibilance",
    labelKey: "sibilance",
    fixes: ["deesser"],
  },
  {
    id: "mud",
    labelKey: "mud",
    /** High-pass + low-mid cut live in eq autofix. */
    fixes: ["eq"],
  },
  {
    id: "glue",
    labelKey: "glue",
    fixes: ["balance", "compression", "rider"],
  },
] as const;

export function bitekPolishTileById(
  id: string,
): BitekPolishTile | undefined {
  return BITEK_POLISH_TILES.find((t) => t.id === id);
}
