import type { PremiumTier } from "@/types/premium";

export type StudioSurfaceStep = "record" | "mix" | "master";

/** Silver and Gold open the advanced studio. Free and Bronze stay on the simple record surface. */
export function studioAdvancedRecordAllowed(tier: PremiumTier | null | undefined): boolean {
  return tier === "SILVER" || tier === "GOLD";
}

/**
 * Record step: simple unless this plan may use the advanced surface and the user asked for it.
 * Mix and mastering stay on the full surface for every plan.
 */
export function studioRecordView(input: {
  step: StudioSurfaceStep;
  fullView: boolean;
  advancedAllowed?: boolean;
}): "simple" | "full" {
  if (input.step !== "record") return "full";
  if (input.advancedAllowed === false) return "simple";
  return input.fullView === true ? "full" : "simple";
}
