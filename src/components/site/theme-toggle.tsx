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
export function ThemeToggle({ className }: { className?: string }) {
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
        "inline-flex min-h-11 items-center gap-1 border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink-soft)] outline-none transition-colors sm:gap-1.5 sm:px-2.5",
        "hover:border-[var(--brd-line-strong)] hover:text-[var(--brd-ink)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
        className,
      )}
    >
      <span className="hidden text-xs text-[var(--brd-ink-soft)] sm:inline">
        {t("motyw")}
      </span>
      <span className="font-medium text-[var(--brd-ink)]">{tl(label)}</span>
    </button>
  );
}
