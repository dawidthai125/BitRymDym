/** Popover next to its button: below when it fits, otherwise above, always inside the viewport. */
export function placeStudioPopover(input: {
  anchor: { left: number; right: number; top: number; bottom: number };
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
  margin?: number;
}): { left: number; top: number } {
  const { anchor, panel, viewport } = input;
  const gap = input.gap ?? 4;
  const margin = input.margin ?? 8;
  const clamp = (value: number, size: number, max: number) =>
    Math.max(margin, Math.min(value, max - size - margin));
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - panel.height;
  const top =
    below + panel.height + margin <= viewport.height || above < margin ? below : above;
  return {
    left: Math.round(clamp(anchor.right - panel.width, panel.width, viewport.width)),
    top: Math.round(clamp(top, panel.height, viewport.height)),
  };
}
