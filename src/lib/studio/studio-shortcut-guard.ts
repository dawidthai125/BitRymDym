/** Which Studio keyboard shortcuts may run for the current focus and open windows. Pure over the DOM. */

type ClosestLike = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => ClosestLike | null;
  getAttribute?: (name: string) => string | null;
  contains?: (node: unknown) => boolean;
};

/** Inputs that take text: no shortcut may run. A range slider is not one of them. */
export function isStudioTypingTarget(target: unknown): boolean {
  const el = target as ClosestLike | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT") {
    const type = (el.getAttribute?.("type") ?? "text").toLowerCase();
    return !["range", "checkbox", "radio", "button", "submit", "reset", "file", "color"].includes(type);
  }
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("textarea, select, [contenteditable=true]"));
}

const CONTROL_SELECTOR =
  'button, a[href], summary, input, label, [role="button"], [role="tab"], [role="menuitem"], [role="slider"], [role="switch"], [role="checkbox"], [role="option"]';

/** Keys a focused control uses itself (press, move the slider, change the tab). */
export function isStudioControlKey(key: string): boolean {
  return (
    key === " " ||
    key === "Spacebar" ||
    key === "Enter" ||
    key === "Home" ||
    key === "End" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key.startsWith("Arrow")
  );
}

/**
 * A control focused from the keyboard keeps its own keys. After a mouse click the focus ring means
 * nothing to the user, so Space is still play / record. Sliders always keep arrows.
 */
export function studioControlKeepsKey(input: {
  target: unknown;
  key: string;
  focusedByPointer: boolean;
}): boolean {
  if (!isStudioControlKey(input.key)) return false;
  const el = input.target as ClosestLike | null;
  if (!el || typeof el.closest !== "function") return false;
  const control = el.closest(CONTROL_SELECTOR);
  if (!control) return false;
  if (!input.focusedByPointer) return true;
  const slider =
    (control.tagName?.toUpperCase() === "INPUT" && control.getAttribute?.("type") === "range") ||
    control.getAttribute?.("role") === "slider";
  return slider && input.key !== " " && input.key !== "Spacebar" && input.key !== "Enter";
}

export type StudioModalState = "none" | "record-sheet" | "modal";

/** An open modal blocks shortcuts. The inspector sheet (record panel on tablets) still allows transport keys. */
export function studioModalState(doc: {
  querySelectorAll: (selector: string) => ArrayLike<{ getAttribute: (name: string) => string | null }>;
}): StudioModalState {
  const open = Array.from(
    doc.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], [role="menu"]'),
  );
  if (open.length === 0) return "none";
  return open.every((el) => el.getAttribute("data-testid") === "studio-inspector-mobile")
    ? "record-sheet"
    : "modal";
}
