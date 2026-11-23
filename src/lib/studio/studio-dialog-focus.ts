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

  // Focus got out of the dialog (a click on plain text, a disabled button): bring it back.
  if (active && typeof panel.contains === "function" && !panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? lastItem : firstItem).focus();
    return;
  }

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

type ScrollLockBody = { style: { overflow: string; paddingRight: string } };
type ScrollLockView = { innerWidth: number; clientWidth: number };

let scrollLocks = 0;
let scrollRestore: (() => void) | null = null;

/**
 * Locks page scroll while a Studio dialog is open. Ref-counted: stacked dialogs (effects over the
 * mixer) keep the lock until the last one closes. The removed scrollbar is replaced with padding,
 * so the page does not jump sideways. Returns the unlock function (safe to call twice).
 */
export function lockStudioPageScroll(
  body: ScrollLockBody = document.body,
  view: ScrollLockView = {
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
  },
): () => void {
  if (scrollLocks === 0) {
    const overflow = body.style.overflow;
    const paddingRight = body.style.paddingRight;
    const bar = Math.max(0, view.innerWidth - view.clientWidth);
    body.style.overflow = "hidden";
    if (bar > 0) body.style.paddingRight = `${bar}px`;
    scrollRestore = () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks > 0) return;
    scrollRestore?.();
    scrollRestore = null;
  };
}
