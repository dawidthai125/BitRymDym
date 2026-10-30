/**
 * rec-live-ui — BITEK must never cover the record panel buttons or the transport.
 * Pure placement decision for StudioBitekDock (tested without React).
 *
 * - capture running → dock hidden (bubbles wait behind the "ma coś" pill afterwards);
 * - inspector sheet/drawer open (< xl; it is a modal that owns the bottom/right) → hidden;
 * - record step / record context on wide screens (record panel in the right rail) →
 *   compact avatar moved to the bottom-LEFT, speech bubble folded into the pill;
 * - same on narrow screens → stays bottom-RIGHT (left would sit on the track M/S/R
 *   headers) but compact and folded (sheet opens over it anyway and hides it);
 * - otherwise → default bottom-right with bubbles.
 */
export type BitekDockPlacement = {
  hidden: boolean;
  side: "left" | "right";
  /** Expanded speech bubble may show (otherwise only the restore pill). */
  bubble: boolean;
  compact: boolean;
};

export function bitekDockPlacement(input: {
  recording: boolean;
  recordContext: boolean;
  inspectorSheetOpen: boolean;
  /** < lg — the left edge holds the track headers (M / S / R arm). */
  narrow?: boolean;
}): BitekDockPlacement {
  if (input.recording || input.inspectorSheetOpen) {
    return { hidden: true, side: "right", bubble: false, compact: true };
  }
  if (input.recordContext) {
    return {
      hidden: false,
      side: input.narrow ? "right" : "left",
      bubble: false,
      compact: true,
    };
  }
  return { hidden: false, side: "right", bubble: true, compact: false };
}
