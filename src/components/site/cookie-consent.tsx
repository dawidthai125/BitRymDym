"use client";

import Link from "@/components/ui/app-link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  consentCookie,
  parseConsent,
  type ConsentChoice,
} from "@/lib/analytics/consent";
import { expireAnalyticsCookies, loadAnalytics } from "@/lib/analytics/ga";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";

const OPEN_EVENT = "brd:consent-open";
const CHANGE_EVENT = "brd:consent-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Server render: unknown → no banner in HTML (avoids a flash for visitors who already decided). */
const readChoice = () => parseConsent(document.cookie);
const serverChoice = () => "pending" as const;

/** Bottom banner: statistics cookies (Google Analytics) only after "Akceptuję". */
export function CookieConsent({ nonce, disabled }: { nonce?: string; disabled?: boolean }) {
  const t = useTranslations("common.consent");
  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    if (disabled) return;
    if (choice === "all") loadAnalytics(nonce);
  }, [choice, disabled, nonce]);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  const decide = useCallback((next: ConsentChoice) => {
    const previous = parseConsent(document.cookie);
    document.cookie = consentCookie(next, window.location.protocol === "https:");
    setReopened(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    if (next === "necessary" && previous === "all") {
      expireAnalyticsCookies();
      window.location.reload();
    }
  }, []);

  const open = choice === null || reopened;
  if (disabled || !open) return null;
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("tytul")}
      data-testid="cookie-consent"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-[var(--brd-r-cta)] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 text-sm text-[var(--brd-ink-soft)] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] sm:p-5"
    >
      <p className="font-semibold text-[var(--brd-ink)]">{t("tytul")}</p>
      <p className="mt-1 leading-relaxed">
        {t("tresc")}{" "}
        <Link href={LEGAL_PATHS.cookies} className="underline underline-offset-4">
          {t("wiecej")}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide("all")}
          className="min-h-11 rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-green)] bg-[var(--brd-green)] px-4 font-semibold text-[var(--primary-foreground)]"
        >
          {t("akceptuj")}
        </button>
        <button
          type="button"
          onClick={() => decide("necessary")}
          className="min-h-11 rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-ink-soft)] px-4 font-semibold text-[var(--brd-ink)]"
        >
          {t("tylkoNiezbedne")}
        </button>
      </div>
    </div>
  );
}

/** Footer link: reopen the banner to change the decision. */
export function CookieSettingsButton() {
  const t = useTranslations("common.consent");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline"
    >
      {t("ustawienia")}
    </button>
  );
}
