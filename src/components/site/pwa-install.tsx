"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useStoreApp } from "@/components/site/store-app-context";

/** Chrome/Android install prompt (not in lib.dom). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Module store: the deferred prompt is captured once (layout) and read by the button (footer). */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getPrompt = () => deferredPrompt;
const getServerPrompt = () => null;

/**
 * Root layout: registers public/sw.js (offline page only, see the file) and keeps the
 * `beforeinstallprompt` event for the "Zainstaluj aplikację" button. Production only,
 * so `next dev` never runs a stale worker.
 */
export function PwaServiceWorker() {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      emit();
    };
    const onInstalled = () => {
      deferredPrompt = null;
      emit();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // No worker = no offline page; the site works the same.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad Safari (iPadOS reports a Mac with touch). No install prompt there: a hint instead. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Chrome/Firefox/Edge on iOS cannot add to the home screen the same way.
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * Discreet "Zainstaluj aplikację" link (footer). Android/Chrome: native install prompt.
 * iPhone Safari: short "Udostępnij → Do ekranu początkowego" hint. Hidden when the app is
 * already installed (standalone) and in the store app.
 */
export function InstallAppButton() {
  const t = useTranslations("common.pwa");
  const storeApp = useStoreApp();
  const prompt = useSyncExternalStore(subscribe, getPrompt, getServerPrompt);
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean } | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    // Browser-only facts; read after mount so SSR and hydration match.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability read
    setEnv({ standalone: isStandalone(), ios: isIosSafari() });
  }, []);

  if (storeApp || !env || env.standalone) return null;

  if (prompt) {
    return (
      <button
        type="button"
        data-testid="pwa-install"
        className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice.catch(() => null);
          deferredPrompt = null;
          emit();
        }}
      >
        {t("zainstaluj")}
      </button>
    );
  }

  if (!env.ios) return null;

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        data-testid="pwa-install-ios"
        aria-expanded={hint}
        className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline"
        onClick={() => setHint((v) => !v)}
      >
        {t("zainstaluj")}
      </button>
      {hint ? (
        <span role="note" data-testid="pwa-install-ios-hint" className="max-w-[28ch] text-xs text-[var(--brd-mute)]">
          {t("iosPodpowiedz")}
        </span>
      ) : null}
    </span>
  );
}
