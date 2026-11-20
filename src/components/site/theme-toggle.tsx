"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useCallback, useSyncExternalStore } from "react";

import {
  applyBrdThemeToDocument,
  readStoredBrdTheme,
  toggleBrdTheme,
  writeStoredBrdTheme,
  type BrdTheme,
} from "@/lib/ui/theme";
import { cn } from "@/lib/utils";

const BRD_THEME_CHANGE_EVENT = "brd-theme-change";

function subscribeBrdTheme(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== "bitrymdym.theme") return;
    onStoreChange();
  }
  function onLocal() {
    onStoreChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(BRD_THEME_CHANGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(BRD_THEME_CHANGE_EVENT, onLocal);
  };
}

function getBrdThemeSnapshot(): BrdTheme {
  return readStoredBrdTheme();
}

function getBrdThemeServerSnapshot(): BrdTheme {
  return "dark";
}

/**
 * Global theme switch — visible label, keyboard, localStorage.
 * SSR / missing preference = dark; hydrates via useSyncExternalStore.
 */
export function ThemeToggle({
  className,
  iconOnly = false,
}: {
  className?: string;
  /** Header: icon only, the theme name stays in aria-label/title. */
  iconOnly?: boolean;
}) {
  const tl = useLibText();
  const t = useTranslations("nav.themeToggle");
  const theme = useSyncExternalStore(
    subscribeBrdTheme,
    getBrdThemeSnapshot,
    getBrdThemeServerSnapshot,
  );

  const onToggle = useCallback(() => {
    const next = toggleBrdTheme(theme);
    writeStoredBrdTheme(next);
    applyBrdThemeToDocument(next);
    window.dispatchEvent(new Event(BRD_THEME_CHANGE_EVENT));
  }, [theme]);

  const label = theme === "dark" ? t("ciemny") : t("jasny");
  const nextHint =
    theme === "dark" ? t("przelaczNaJasnyMotyw") : t("przelaczNaCiemnyMotyw");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={theme === "dark"}
      aria-label={tl(nextHint)}
      title={tl(nextHint)}
      data-theme-ready="true"
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink-soft)] outline-none transition-colors",
        "hover:border-[var(--brd-line-strong)] hover:text-[var(--brd-ink)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
        className,
      )}
    >
      {/* Ikona zamiast „Motyw Ciemny”: pasek mieści menu w jednej linii. Nazwa motywu zostaje w aria-label i title. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5 text-[var(--brd-ink)]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === "dark" ? (
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      <span className={iconOnly ? "sr-only" : "font-medium text-[var(--brd-ink)]"}>
        {iconOnly ? `${t("motyw")} ` : null}
        {tl(label)}
      </span>
    </button>
  );
}
