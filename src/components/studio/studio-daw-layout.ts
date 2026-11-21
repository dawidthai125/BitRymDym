/**
 * Studio DAW layout constants shared by the editor, the timeline and the Mix overview
 * (moved out of studio-editor.tsx, audit 2026-11-21).
 */

export type StudioTimelineMode = "seek" | "edit";

/**
 * Visual Parity V2 — denser DAW lanes (header vol/pan + M/S/R keep min-h-11).
 * Clip geometry SSOT unchanged; height is presentation only.
 */
export const STUDIO_DAW_LANE_HEIGHT_PX = 168;
/** Same vocal edge colors as the Windows recorder lanes. */
export const STUDIO_TRACK_EDGE = ["#e8735a", "#f2a93b", "#d9c45a", "#7cc68d", "#5fb6c9", "#9b8be0", "#d27fc0", "#e0937a"] as const;
/**
 * Phone: list above the lane so the lane keeps the full width, both at their natural height
 * (audit 2026-11-21: a fixed 28rem box gave three nested scrollbars). From sm, a side column.
 */
export const STUDIO_DAW_HEADER_WIDTH_CLASS =
  "w-full border-b sm:h-auto sm:max-h-none sm:w-[272px] sm:border-b-0 sm:border-r";

/** Track header pan readout: C, L 35, R 100 (mono, fixed width). */
export function formatStudioPanShort(
  pan: number,
  labels: { center: string; left: string; right: string },
): string {
  const v = Math.round(pan * 100);
  if (v === 0) return labels.center;
  return v < 0 ? `${labels.left}${Math.abs(v)}` : `${labels.right}${v}`;
}
export const STUDIO_DAW_CHIP_CLASS = "h-11 min-h-11 min-w-11 w-11 px-0";
/** Track gain bounds — same as Mixer strips. */
export const STUDIO_TRACK_GAIN_DB_MIN = -24;
export const STUDIO_TRACK_GAIN_DB_MAX = 12;
