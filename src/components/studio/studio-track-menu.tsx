"use client";

/**
 * Track ⋮ menu (popover next to its button) and the "delete track" question (a real dialog).
 * Both stay on screen at every width and never move the page layout.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useStudioDialog } from "@/components/studio/use-studio-dialog";
import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { placeStudioPopover } from "@/lib/studio/studio-popover";

function menuButton(trackId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="studio-track-menu"][data-track-id="${CSS.escape(trackId)}"]`,
  );
}

export function StudioTrackMenu({
  trackId,
  trackName,
  onClose,
  children,
}: {
  trackId: string;
  trackName: string;
  onClose: () => void;
  /** Buttons with role="menuitem". */
  children: ReactNode;
}) {
  const tl = useLibText();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const place = () => {
      const panel = panelRef.current;
      const anchor = menuButton(trackId);
      if (!panel || !anchor) return;
      const a = anchor.getBoundingClientRect();
      setPos(
        placeStudioPopover({
          anchor: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
          panel: { width: panel.offsetWidth, height: panel.offsetHeight },
          viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [trackId]);

  useEffect(() => {
    const items = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
      );
    items()[0]?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        menuButton(trackId)?.focus({ preventScroll: true });
        return;
      }
      // The name field keeps its own text keys.
      if (event.target instanceof HTMLInputElement && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const list = items();
      if (list.length === 0) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "ArrowDown"
          ? list[(at + 1) % list.length]
          : event.key === "ArrowUp"
            ? list[(at - 1 + list.length) % list.length]
            : event.key === "Home"
              ? list[0]
              : event.key === "End"
                ? list[list.length - 1]
                : null;
      if (!next) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      next.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || menuButton(trackId)?.contains(target)) return;
      // Blur first: the name field saves on blur and the panel is about to disappear.
      if (panelRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [trackId]);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={tl(trackName)}
      data-testid="studio-track-menu-panel"
      className="fixed z-50 flex max-h-[calc(100dvh-1rem)] w-60 max-w-[calc(100vw-1rem)] flex-col gap-1 overflow-y-auto rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 shadow-2xl"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <span className="truncate px-1 text-xs text-[var(--brd-mute)]">{tl(trackName)}</span>
      {children}
    </div>
  );
}

export function StudioDeleteTrackDialog({
  trackName,
  disabled,
  onCancel,
  onConfirm,
}: {
  trackName: string;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useTranslations("studio.studioEditor");
  const tl = useLibText();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useStudioDialog({ open: true, onClose: onCancel, panelRef, initialFocusRef: cancelRef });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60"
        aria-label={tr("anuluj")}
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="studio-delete-track-title"
        tabIndex={-1}
        data-testid="studio-delete-track-confirm"
        className="relative w-full max-w-md rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 shadow-2xl outline-none"
      >
        <p id="studio-delete-track-title" className="text-sm font-medium text-[var(--brd-ink)]">
          {tr("usunacSciezkeNazwa", { v0: tl(trackName) })}
        </p>
        <p className="mt-1 text-xs text-[var(--brd-mute)]">
          {tr("sciezkaIJejKlipy")} {tr("usuniecieSciezkiBezCofania")}
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} type="button" size="sm" variant="outline" className="min-h-11" onClick={onCancel}>
            {tr("anuluj")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="min-h-11"
            data-testid="studio-delete-track-confirm-btn"
            disabled={disabled}
            onClick={onConfirm}
          >
            {tr("usun")}
          </Button>
        </div>
      </div>
    </div>
  );
}
