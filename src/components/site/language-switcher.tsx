"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LOCALES, type AppLocale } from "@/i18n/config";
import { setLocaleAction } from "@/i18n/actions";
import { cn } from "@/lib/utils";

/**
 * Language switch — same visual language as ThemeToggle (Nocna sesja):
 * hairline border, soft label, active segment in full ink.
 * Locale lives in the NEXT_LOCALE cookie; no URL prefix.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: AppLocale) {
    if (next === locale || pending) return;
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
      <span className="hidden px-1 text-xs text-[var(--brd-ink-soft)] sm:inline">
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
              "min-h-9 min-w-9 px-1.5 font-medium uppercase outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
              active
                ? "text-[var(--brd-ink)] underline decoration-[var(--tape-amber)] decoration-2 underline-offset-4"
                : "text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)]",
            )}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
