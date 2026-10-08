"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  studioInspectorContextTitle,
  type StudioInspectorContext,
} from "@/components/studio/studio-inspector-context";

type StudioInspectorShellProps = {
  open: boolean;
  context: StudioInspectorContext;
  onClose: () => void;
  children: ReactNode;
};

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

/**
 * Phase 7.1.3 — single overlay host:
 * - mobile (< md): bottom sheet
 * - tablet (md–xl): right drawer
 * Desktop dock stays in studio-editor (aside xl:flex).
 */
export function StudioInspectorOverlay({
  open,
  context,
  onClose,
  children,
}: StudioInspectorShellProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const focusables = panel ? getFocusable(panel) : [];
    const first = focusables[0] ?? panel;
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = getFocusable(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === firstItem || active === panelRef.current) {
          event.preventDefault();
          lastItem.focus();
        }
      } else if (active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const title = studioInspectorContextTitle(context);

  return (
    <div
      className="fixed inset-0 z-40 flex xl:hidden"
      data-testid="studio-inspector-overlay"
      data-studio-inspector="overlay"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--brd-ink)_45%,transparent)]"
        aria-label="Zamknij Inspector"
        data-testid="studio-inspector-backdrop"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="studio-inspector-mobile"
        className="relative flex w-full flex-col border border-[var(--brd-line)] bg-[var(--brd-bg)] shadow-lg outline-none max-md:mt-auto max-md:max-h-[70vh] max-md:rounded-t-lg max-md:pb-[env(safe-area-inset-bottom)] md:ml-auto md:h-full md:w-[min(22rem,92vw)] md:border-l md:pb-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--brd-line)] px-3 py-2">
          <p
            id={titleId}
            className="text-sm font-medium text-[var(--brd-ink)]"
          >
            {title}
          </p>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="min-h-11 min-w-11"
            onClick={onClose}
          >
            Zamknij
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {children}
        </div>
      </div>
    </div>
  );
}
