"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import Link from "@/components/ui/app-link";
import { LEGAL_PATHS, TERMS_VERSION } from "@/lib/legal/legal-config";

const KEY = "brd.termsNotice";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === TERMS_VERSION;
  } catch {
    return false;
  }
}

/** Notice of § 12: changed terms, for signed-in accounts that did not accept this version at sign-up. */
export function TermsNotice() {
  const t = useTranslations("common.legal");
  // Hidden in the server HTML: a closed notice must not flash on every page.
  const hidden = useSyncExternalStore(subscribe, seen, () => true);
  if (hidden) return null;
  function close() {
    try {
      window.localStorage.setItem(KEY, TERMS_VERSION);
    } catch {
      // Blocked storage: the notice comes back on the next page.
    }
    for (const listener of listeners) listener();
  }
  return (
    <section aria-label={t("zmianaTytul")} className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]" data-testid="terms-notice">
      <div className="mx-auto flex w-full max-w-[var(--brd-max-wide)] flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">{t("zmianaTytul")}.</strong> {t("zmianaTresc")}
        </p>
        <div className="flex shrink-0 items-center gap-4">
          <Link href={LEGAL_PATHS.terms} className="inline-flex min-h-11 items-center underline underline-offset-4">{t("zmianaCzytaj")}</Link>
          <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-[var(--brd-r-cta)] border border-[var(--brd-line)] px-4 font-semibold" data-testid="terms-notice-close">
            {t("zmianaZamknij")}
          </button>
        </div>
      </div>
    </section>
  );
}
