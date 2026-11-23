"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import {
  getStudioDialogFocusable,
  handleStudioDialogKeydown,
  lockStudioPageScroll,
} from "@/lib/studio/studio-dialog-focus";

/** Page scroll lock for as long as `active` is true. */
export function useStudioScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockStudioPageScroll();
  }, [active]);
}

/**
 * Modal behaviour for a Studio dialog: first focus, Tab trap, Escape, scroll lock, focus restore.
 * `onClose` lives in a ref, so a re-render of the editor never moves focus back to the start.
 * Keys are handled in the capture phase, so a dialog below does not react to the same Escape.
 */
export function useStudioDialog({
  open,
  onClose,
  panelRef,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): void {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  useStudioScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first =
      initialFocusRef?.current ?? (panel ? getStudioDialogFocusable(panel)[0] : null) ?? panel;
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      event.stopImmediatePropagation();
      handleStudioDialogKeydown({
        event,
        panel: panelRef.current,
        onClose: () => onCloseRef.current(),
      });
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open, panelRef, initialFocusRef]);
}
