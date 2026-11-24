"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LOCALE_COOKIE, LOCALES, type AppLocale } from "@/i18n/config";
import { setLocaleAction } from "@/i18n/actions";
import { polishPathOf } from "@/lib/seo/locale-paths";
import { cn } from "@/lib/utils";

function openPolish(path: string) {
  document.cookie = `${LOCALE_COOKIE}=pl; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.location.assign(`${path}${window.location.search}${window.location.hash}`);
}

/**
 * Language switch — same visual language as ThemeToggle (Nocna sesja):
 * hairline border, soft label, active segment in full ink.
 * Locale lives in the NEXT_LOCALE cookie; on /en/... Polish opens the Polish address.
 */
export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Header: no visible "Język" word (the group keeps its aria-label). */
  compact?: boolean;
}) {
  const tl = useLibText();
  const t = useTranslations("language");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: AppLocale) {
    if (next === locale || pending) return;
    // /en/... always renders English (and stores "en"), so Polish needs the Polish address.
    const polish = next === "pl" ? polishPathOf(window.location.pathname) : null;
    if (polish) {
      openPolish(polish);
      return;
    }
    startTransition(async () => {
      await setLocaleAction(next);
      document.documentElement.lang = next;
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      data-language-switcher
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 border border-[var(--brd-line)] px-1.5 text-sm",
        className,
      )}
    >
      <span
        className={cn(
          "hidden px-1 text-xs text-[var(--brd-ink-soft)]",
          !compact && "sm:inline",
        )}
      >
        {t("label")}
      </span>
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            onClick={() => choose(code)}
            aria-pressed={active}
            aria-label={t("switchTo", { name: t(code) })}
            title={t(code)}
            className={cn(
              "min-h-11 min-w-11 px-1.5 font-medium uppercase outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
              active
                ? "text-[var(--brd-ink)] underline decoration-[var(--tape-amber)] decoration-2 underline-offset-4"
                : "text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)]",
            )}
          >
            {tl(code)}
          </button>
        );
      })}
    </div>
  );
}
