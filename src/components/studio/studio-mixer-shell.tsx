"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

type StudioMixerOverlayProps = {
  open: boolean;
  onClose: () => void;
  panelId?: string;
  children: ReactNode;
};

/**
 * Phase 7.1.4 — Mixer overlay host (< xl):
 * - mobile (< md): bottom sheet
 * - tablet (md–xl): bottom drawer sheet
 * Desktop dock stays in studio-editor (xl:flex).
 * z-40 — same band as Inspector overlay (XOR); StudioFxSheet remains z-50.
 */
export function StudioMixerOverlay({
  open,
  onClose,
  panelId,
  children,
}: StudioMixerOverlayProps) {
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

  return (
    <div
      className="fixed inset-0 z-40 flex xl:hidden"
      data-testid="studio-mixer-overlay"
      data-studio-mixer="overlay"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--brd-ink)_45%,transparent)]"
        aria-label="Zamknij Mixer"
        data-testid="studio-mixer-backdrop"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="studio-mixer-sheet"
        className="relative mt-auto flex max-h-[min(70vh,28rem)] w-full flex-col rounded-t-lg border border-[var(--brd-line)] bg-[var(--brd-bg)] shadow-lg outline-none pb-[env(safe-area-inset-bottom)] md:max-h-[min(75vh,30rem)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--brd-line)] px-3 py-2">
          <p
            id={titleId}
            className="text-sm font-medium text-[var(--brd-ink)]"
          >
            Mixer
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
        <div
          id={panelId}
          className="flex min-h-0 flex-1 flex-col overflow-hidden p-3"
          data-testid="studio-mixer-panel"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type StudioMixerDockChromeProps = {
  expanded: boolean;
  panelId: string;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * Phase 7.1.4 — desktop (≥ xl) bottom collapsible dock chrome.
 * Collapsed = thin bar + chevron; expanded = channel strips (children).
 */
export function StudioMixerDockChrome({
  expanded,
  panelId,
  onToggle,
  children,
}: StudioMixerDockChromeProps) {
  return (
    <section
      data-testid="studio-mixer-dock"
      data-studio-mixer="dock"
      data-mixer-expanded={expanded ? "true" : "false"}
      aria-label="Mix"
      className="hidden shrink-0 flex-col border border-[var(--brd-line)] bg-[var(--brd-paper)] shadow-[0_-2px_8px_-4px_color-mix(in_srgb,var(--brd-ink)_18%,transparent)] xl:flex"
    >
      <div
        className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--brd-line)] px-2"
        data-testid="studio-mixer-chrome"
      >
        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          Mixer
        </p>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="min-h-11 min-w-11"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? "Zwiń Mixer" : "Rozwiń Mixer"}
          data-testid="studio-mixer-collapse"
          onClick={onToggle}
        >
          {expanded ? "▾" : "▴"}
        </Button>
      </div>
      {expanded ? (
        <div
          id={panelId}
          role="region"
          aria-label="Kanały Mixera"
          data-testid="studio-mixer-panel"
          className="max-h-[17.5rem] min-h-0 overflow-y-auto overflow-x-hidden p-2"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
