/**
 * Shared Studio dialog focus helpers (Export a11y Stage I.3A).
 * Mirrors Mixer / Inspector / FxSheet keyboard contracts without a second trap.
 */

export function getStudioDialogFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

export type StudioDialogKeyLike = {
  key: string;
  shiftKey?: boolean;
  preventDefault: () => void;
};

/**
 * Escape closes; Tab / Shift+Tab cycle within the dialog focusables.
 * Call only while the dialog is open (single window listener).
 */
export function handleStudioDialogKeydown(options: {
  event: StudioDialogKeyLike;
  panel: HTMLElement | null;
  onClose: () => void;
  getFocusable?: (root: HTMLElement) => HTMLElement[];
  activeElement?: Element | null;
}): void {
  const {
    event,
    panel,
    onClose,
    getFocusable = getStudioDialogFocusable,
    activeElement = typeof document !== "undefined"
      ? document.activeElement
      : null,
  } = options;

  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key !== "Tab" || !panel) return;

  const items = getFocusable(panel);
  if (items.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }

  const firstItem = items[0]!;
  const lastItem = items[items.length - 1]!;
  const active = activeElement;

  if (event.shiftKey) {
    if (active === firstItem || active === panel) {
      event.preventDefault();
      lastItem.focus();
    }
  } else if (active === lastItem) {
    event.preventDefault();
    firstItem.focus();
  }
}
