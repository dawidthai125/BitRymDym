"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { isStudioTypingTarget } from "@/lib/studio/studio-shortcut-guard";
import { isFullscreenToggleKey, STUDIO_FULL_CLASS, STUDIO_LANDSCAPE_PHONE_QUERY } from "@/lib/studio/studio-fullscreen";

type Mode = "off" | "button" | "landscape";

function setChromeHidden(hidden: boolean): void {
  document.documentElement.classList.toggle(STUDIO_FULL_CLASS, hidden);
}

function inBrowserFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}

/** Full-screen button for the Studio header (see src/lib/studio/studio-fullscreen.ts). */
export function StudioFullscreenToggle() {
  const tr = useTranslations("studio.studioEditor");
  const [mode, setMode] = useState<Mode>("off");
  const modeRef = useRef<Mode>("off");
  /** We asked the browser for full screen ourselves, so we also leave it. */
  const ownFullscreenRef = useRef(false);

  const apply = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
    setChromeHidden(next !== "off");
  }, []);

  const enter = useCallback(() => {
    apply("button");
    const root = document.documentElement;
    if (typeof root.requestFullscreen === "function" && !inBrowserFullscreen()) {
      root
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => {
          ownFullscreenRef.current = true;
        })
        .catch(() => {
          // Refused (iPhone, embedded view): hiding the site chrome is still full screen enough.
        });
    }
  }, [apply]);

  const leave = useCallback(() => {
    apply("off");
    if (ownFullscreenRef.current && inBrowserFullscreen()) void document.exitFullscreen().catch(() => {});
    ownFullscreenRef.current = false;
  }, [apply]);

  const toggle = useCallback(() => {
    if (modeRef.current === "off") enter();
    else leave();
  }, [enter, leave]);

  useEffect(() => {
    // Esc (or the browser's own control) left real full screen: show the site chrome again.
    function onFullscreenChange() {
      if (!inBrowserFullscreen() && ownFullscreenRef.current) {
        ownFullscreenRef.current = false;
        if (modeRef.current === "button") apply("off");
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (!isFullscreenToggleKey(event, isStudioTypingTarget(event.target))) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      event.preventDefault();
      toggle();
    }
    // Phone turned sideways: full screen by itself, back when turned upright (unless the button was used).
    const landscape = window.matchMedia(STUDIO_LANDSCAPE_PHONE_QUERY);
    function onOrientation() {
      if (landscape.matches && modeRef.current === "off") apply("landscape");
      else if (!landscape.matches && modeRef.current === "landscape") apply("off");
    }
    onOrientation();
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    landscape.addEventListener("change", onOrientation);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
      landscape.removeEventListener("change", onOrientation);
      // Leaving the Studio page: the rest of the site has its header again.
      setChromeHidden(false);
      if (ownFullscreenRef.current && inBrowserFullscreen()) void document.exitFullscreen().catch(() => {});
    };
  }, [apply, toggle]);

  const on = mode !== "off";
  const label = on ? tr("pelnyEkranWyjdz") : tr("pelnyEkran");
  return (
    <button
      type="button"
      data-testid="studio-fullscreen"
      aria-pressed={on}
      aria-label={label}
      title={`${label} (F)`}
      onClick={toggle}
      className="studio-fullscreen-btn inline-flex size-11 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {on ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
    </button>
  );
}
