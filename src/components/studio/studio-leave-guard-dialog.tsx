"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import {
  installStudioLeaveGuard,
  STUDIO_LEAVE_GUARD_BODY_PL,
  STUDIO_LEAVE_GUARD_LEAVE_PL,
  STUDIO_LEAVE_GUARD_STAY_PL,
  STUDIO_LEAVE_GUARD_TITLE_PL,
  type StudioLeaveGuard,
  type StudioLeaveIntent,
} from "@/components/studio/studio-leave-guard";
import { Button } from "@/components/ui/button";

/**
 * Listeners exist only while `active` (capture in flight); inactive Studio
 * navigation is untouched. A pending intent is dropped when capture ends.
 */
export function useStudioLeaveGuard(
  active: boolean,
  studioRootRef: RefObject<HTMLElement | null>,
) {
  const [pending, setPending] = useState<StudioLeaveIntent | null>(null);
  const guardRef = useRef<StudioLeaveGuard | null>(null);
  const unloadAllowedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const guard = installStudioLeaveGuard({
      target: window,
      studioRoot: () => studioRootRef.current,
      onIntercept: setPending,
      // Editor registers the only beforeunload listener (persist + capture).
      beforeUnload: false,
    });
    guardRef.current = guard;
    return () => {
      guard.dispose();
      unloadAllowedRef.current = false;
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, [active, studioRootRef]);

  const intent = active ? pending : null;
  return {
    open: intent !== null,
    stay: () => setPending(null),
    leave: () => {
      unloadAllowedRef.current = true;
      setPending(null);
      if (intent) guardRef.current?.proceed(intent);
    },
    unloadAllowed: () => unloadAllowedRef.current,
  };
}

export function StudioLeaveGuardDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const tl = useLibText();
  const titleId = useId();
  const bodyId = useId();
  const stayRef = useRef<HTMLButtonElement | null>(null);
  const leaveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayRef.current?.focus();

    // Capture + stopImmediatePropagation: the Inspector / Mixer overlays below
    // must not also react to Escape (same pattern as StudioFxSheet).
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onStay();
        return;
      }
      if (event.key !== "Tab") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const next =
        document.activeElement === stayRef.current ? leaveRef.current : stayRef.current;
      next?.focus();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open, onStay]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center md:items-center"
      data-testid="studio-leave-guard"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--brd-ink)_45%,transparent)]"
        aria-label={tl(STUDIO_LEAVE_GUARD_STAY_PL)}
        tabIndex={-1}
        onClick={onStay}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-testid="studio-leave-guard-dialog"
        className="relative flex w-full flex-col gap-3 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 shadow-lg max-md:rounded-t-lg max-md:pb-[calc(1rem+env(safe-area-inset-bottom))] md:w-[min(26rem,92vw)] md:rounded-lg"
      >
        <p
          id={titleId}
          className="text-xs font-medium uppercase tracking-[0.1em] text-destructive"
        >
          {tl(STUDIO_LEAVE_GUARD_TITLE_PL)}
        </p>
        <p id={bodyId} className="text-sm text-[var(--brd-ink)]">
          {tl(STUDIO_LEAVE_GUARD_BODY_PL)}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={leaveRef}
            type="button"
            variant="destructive"
            className="min-h-11"
            data-testid="studio-leave-guard-leave"
            onClick={onLeave}
          >
            {tl(STUDIO_LEAVE_GUARD_LEAVE_PL)}
          </Button>
          <Button
            ref={stayRef}
            type="button"
            className="min-h-11"
            data-testid="studio-leave-guard-stay"
            onClick={onStay}
          >
            {tl(STUDIO_LEAVE_GUARD_STAY_PL)}
          </Button>
        </div>
      </div>
    </div>
  );
}
