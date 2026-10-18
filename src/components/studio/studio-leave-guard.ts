/**
 * STU-12 — leaving Studio while a take is being captured or saved.
 *
 * Unmounting StudioEditor unmounts StudioRecordingPanel, which cancels the
 * recorder. While capture is active, one window-level capture-phase listener
 * set intercepts every way out that runs through the DOM before React / Next
 * see it: any <a href> (SiteHeader, user menu, MobileBottomNav, Studio links),
 * any form outside Studio (header search, sign-out) and full unloads
 * (beforeunload). Browser back/forward (popstate) is NOT intercepted: the URL
 * has already changed and the App Router owns history state.
 */

export const STUDIO_LEAVE_GUARD_TITLE_PL = "Trwa nagrywanie";
export const STUDIO_LEAVE_GUARD_BODY_PL =
  "Trwa nagrywanie lub zapisywanie take'a. Jeśli teraz opuścisz Studio, nagrywanie zostanie przerwane, a niezapisany take może przepaść.";
export const STUDIO_LEAVE_GUARD_STAY_PL = "Zostań w Studio";
export const STUDIO_LEAVE_GUARD_LEAVE_PL = "Opuść Studio";

export type StudioLeaveIntent =
  | { kind: "link"; anchor: HTMLAnchorElement; href: string }
  | { kind: "form"; form: HTMLFormElement; submitter: HTMLElement | null };

type Containing = { contains(node: Node | null): boolean };

export type StudioLeaveGuardTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
> & { location: Pick<Location, "href" | "assign"> };

/** Plain left click on a link that would replace the current page. */
export function studioLeaveIntentFromClick(
  event: MouseEvent,
  currentHref: string,
): StudioLeaveIntent | null {
  if (event.defaultPrevented) return null;
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }
  const origin = event.target as Partial<Element> | null;
  const anchor = origin?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
  if (!anchor) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  let next: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    next = new URL(anchor.getAttribute("href") ?? "", current);
  } catch {
    return null;
  }
  // mailto:, tel:, javascript: … keep the document mounted.
  if (next.protocol !== "http:" && next.protocol !== "https:") return null;
  if (
    next.origin === current.origin &&
    next.pathname === current.pathname &&
    next.search === current.search
  ) {
    return null;
  }
  return { kind: "link", anchor, href: next.href };
}

/** Submit of a form outside Studio (Studio's own forms never leave the page). */
export function studioLeaveIntentFromSubmit(
  event: SubmitEvent,
  studioRoot: Containing | null,
): StudioLeaveIntent | null {
  if (event.defaultPrevented) return null;
  const form = event.target as HTMLFormElement | null;
  if (!form || typeof form.requestSubmit !== "function") return null;
  if (studioRoot?.contains(form)) return null;
  return {
    kind: "form",
    form,
    submitter: (event.submitter as HTMLElement | null) ?? null,
  };
}

export type StudioLeaveGuard = {
  /** Replays the intercepted navigation without interception. */
  proceed(intent: StudioLeaveIntent): void;
  dispose(): void;
};

/**
 * One native prompt for a single unload attempt.
 * Capture and a dirty project share this decision so two listeners cannot each prompt.
 * `unloadAllowed` is the confirmed Leave path (no second prompt).
 */
export function studioPageUnloadPrompt(input: {
  unloadAllowed: boolean;
  captureActive: boolean;
  persistGuarded: boolean;
}): boolean {
  if (input.unloadAllowed) return false;
  return input.captureActive || input.persistGuarded;
}

/** Install only while capture is active; dispose when it ends. */
export function installStudioLeaveGuard(options: {
  target: StudioLeaveGuardTarget;
  studioRoot: () => Containing | null;
  onIntercept: (intent: StudioLeaveIntent) => void;
  /**
   * Studio editor owns the single beforeunload listener (persist + capture).
   * Default true keeps the standalone guard self-contained.
   */
  beforeUnload?: boolean;
}): StudioLeaveGuard {
  const { target } = options;
  let replaying = false;
  let unloadAllowed = false;

  const block = (event: Event, intent: StudioLeaveIntent) => {
    event.preventDefault();
    event.stopPropagation();
    unloadAllowed = false;
    options.onIntercept(intent);
  };

  const onClick = (event: MouseEvent) => {
    if (replaying) return;
    const intent = studioLeaveIntentFromClick(event, target.location.href);
    if (intent) block(event, intent);
  };

  const onSubmit = (event: SubmitEvent) => {
    if (replaying) return;
    const intent = studioLeaveIntentFromSubmit(event, options.studioRoot());
    if (intent) block(event, intent);
  };

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (unloadAllowed) return;
    event.preventDefault();
    event.returnValue = "";
  };

  const ownBeforeUnload = options.beforeUnload !== false;
  target.addEventListener("click", onClick, true);
  target.addEventListener("submit", onSubmit, true);
  if (ownBeforeUnload) {
    target.addEventListener("beforeunload", onBeforeUnload);
  }

  return {
    proceed(intent) {
      // The user already confirmed in the Studio dialog; no second native prompt.
      unloadAllowed = true;
      replaying = true;
      try {
        if (intent.kind === "link") {
          if (intent.anchor.isConnected) intent.anchor.click();
          else target.location.assign(intent.href);
        } else {
          intent.form.requestSubmit(intent.submitter ?? undefined);
        }
      } finally {
        replaying = false;
      }
    },
    dispose() {
      target.removeEventListener("click", onClick, true);
      target.removeEventListener("submit", onSubmit, true);
      if (ownBeforeUnload) {
        target.removeEventListener("beforeunload", onBeforeUnload);
      }
    },
  };
}
