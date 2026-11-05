export type StudioSurfaceStep = "record" | "mix" | "master";

/**
 * Record step opens in the amateur surface (record, arrange, export).
 * Full view restores the inspector, mixer and edit tools.
 * Mix and mastering are unchanged.
 */
export function studioRecordView(input: {
  step: StudioSurfaceStep;
  fullView: boolean;
}): "simple" | "full" {
  if (input.step === "record" && input.fullView !== true) return "simple";
  return "full";
}
