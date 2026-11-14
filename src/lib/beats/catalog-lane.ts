/** Generated-beat catalog lane. No imports from service or ai-beat (cycle). */

export const GENERATED_BEAT_TAG = "z-generatora";

export type CatalogLane = "free" | "paid";

/** Only the string "paid" is the paid lane. Everything else stays free. */
export function catalogLaneOf(value: unknown): CatalogLane {
  return value === "paid" ? "paid" : "free";
}
