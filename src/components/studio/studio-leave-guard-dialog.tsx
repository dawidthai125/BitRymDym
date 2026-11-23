"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  installStudioLeaveGuard,
  STUDIO_LEAVE_GUARD_BODY_PL,
  STUDIO_LEAVE_GUARD_LEAVE_PL,
  STUDIO_LEAVE_GUARD_STAY_PL,
  STUDIO_LEAVE_GUARD_TITLE_PL,
  type StudioLeaveGuard,
  type StudioLeaveIntent,
} from "@/components/studio/studio-leave-guard";
import { useStudioScrollLock } from "@/components/studio/use-studio-dialog";
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

/** A save usually ends faster than this, so most exits never show the dialog. */
const SAVE_GUARD_GRACE_MS = 500;

/**
 * Link / form out of Studio while a save is still running (or failed). The exit waits: it goes on by
 * itself once everything is saved, otherwise the dialog asks after a short grace period.
 */
export function useStudioSaveLeaveGuard(
  unsaved: boolean,
  studioRootRef: RefObject<HTMLElement | null>,
) {
  const [waiting, setWaiting] = useState<StudioLeaveIntent | null>(null);
  const [asking, setAsking] = useState<StudioLeaveIntent | null>(null);
  const guardRef = useRef<StudioLeaveGuard | null>(null);
  const unloadAllowedRef = useRef(false);

  useEffect(() => {
    if (!unsaved) return;
    const guard = installStudioLeaveGuard({
      target: window,
      studioRoot: () => studioRootRef.current,
      onIntercept: setWaiting,
      beforeUnload: false,
    });
    guardRef.current = guard;
    unloadAllowedRef.current = false;
    return () => guard.dispose();
  }, [unsaved, studioRootRef]);

  useEffect(() => {
    if (!waiting) return;
    if (!unsaved) {
      // Everything is saved: go where the user wanted to go.
      const go = window.setTimeout(() => {
        unloadAllowedRef.current = true;
        setWaiting(null);
        guardRef.current?.proceed(waiting);
      }, 0);
      return () => window.clearTimeout(go);
    }
    const id = window.setTimeout(() => setAsking(waiting), SAVE_GUARD_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [waiting, unsaved]);

  return {
    open: unsaved && waiting !== null && asking === waiting,
    stay: () => setWaiting(null),
    leave: () => {
      unloadAllowedRef.current = true;
      setWaiting(null);
      if (waiting) guardRef.current?.proceed(waiting);
    },
    unloadAllowed: () => unloadAllowedRef.current,
  };
}

export function StudioLeaveGuardDialog({
  open,
  onStay,
  onLeave,
  title,
  body,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
  /** Already translated; default = capture texts. */
  title?: string;
  body?: string;
}) {
  const tl = useLibText();
  const titleId = useId();
  const bodyId = useId();
  const stayRef = useRef<HTMLButtonElement | null>(null);
  const leaveRef = useRef<HTMLButtonElement | null>(null);

  // In a ref: the editor re-renders during capture and must not pull focus back to "Zostań".
  const onStayRef = useRef(onStay);
  useLayoutEffect(() => {
    onStayRef.current = onStay;
  });
  useStudioScrollLock(open);

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
        onStayRef.current();
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
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center md:items-center"
      data-testid="studio-leave-guard"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
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
          {title ?? tl(STUDIO_LEAVE_GUARD_TITLE_PL)}
        </p>
        <p id={bodyId} className="text-sm text-[var(--brd-ink)]">
          {body ?? tl(STUDIO_LEAVE_GUARD_BODY_PL)}
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
