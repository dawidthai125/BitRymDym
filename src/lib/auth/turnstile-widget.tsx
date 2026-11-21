"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function readSiteKey(): string | undefined {
  try {
    // Literal access so Next inlines the value at build time.
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;
  } catch {
    return undefined; // no `process` (non-Next bundlers)
  }
}

/**
 * Cloudflare Turnstile widget. Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * Turnstile injects the hidden `cf-turnstile-response` input into the enclosing <form>.
 * Tokens are single-use, so the widget is reset shortly after each submit.
 */
export function TurnstileWidget() {
  const siteKey = readSiteKey();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const el = ref.current;
    const form = el.closest("form");
    let widgetId: string | undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(el, { sitekey: siteKey, theme: "auto" });
      })
      .catch(() => {
        // Server rejects without a token (fail-closed); user can reload.
      });

    const onSubmit = () => {
      timer = setTimeout(() => window.turnstile?.reset(widgetId), 800);
    };
    form?.addEventListener("submit", onSubmit);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      form?.removeEventListener("submit", onSubmit);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} data-testid="turnstile-widget" className="min-h-[65px]" />;
}
