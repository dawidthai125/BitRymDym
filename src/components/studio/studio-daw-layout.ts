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
/** Phone: list above the lane so the lane keeps the full width. From sm, a side column. */
export const STUDIO_DAW_HEADER_WIDTH_CLASS =
  "h-1/2 w-full max-h-[50%] border-b sm:h-auto sm:max-h-none sm:w-[272px] sm:border-b-0 sm:border-r";
