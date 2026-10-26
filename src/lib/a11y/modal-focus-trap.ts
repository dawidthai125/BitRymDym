/**
 * Shared modal focus contract (Studio Inspector / Mixer / FxSheet pattern):
 * move focus into panel on attach, Tab/Shift+Tab wrap, Escape → onClose.
 */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

export type AttachModalFocusTrapOptions = {
  onClose: () => void;
};

/**
 * @returns disposer that removes the keydown listener (does not restore focus).
 */
export function attachModalFocusTrap(
  panel: HTMLElement,
  options: AttachModalFocusTrapOptions,
): () => void {
  const initial = getFocusableElements(panel);
  const first = initial[0] ?? panel;
  first.focus();

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = getFocusableElements(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const firstItem = items[0]!;
    const lastItem = items[items.length - 1]!;
    const active = document.activeElement;
    if (!(active instanceof Node) || !panel.contains(active)) {
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

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

/**
 * Mark AppShell chrome (header / main / bottom nav) inert while a portaled
 * modal lives outside `[data-app-shell]`. Never call this on an ancestor of the
 * dialog node.
 */
export function setAppShellInert(inert: boolean): () => void {
  if (typeof document === "undefined") return () => {};
  const shell = document.querySelector<HTMLElement>("[data-app-shell]");
  if (!shell) return () => {};
  const previous = shell.inert;
  shell.inert = inert;
  return () => {
    shell.inert = previous;
  };
}
