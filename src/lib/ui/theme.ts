/**
 * Global app theme — browser-only preference (no DB / cookies).
 * Default: dark. Light preserves the paper zine palette.
 */

export const BRD_THEME_STORAGE_KEY = "bitrymdym.theme";

export type BrdTheme = "dark" | "light";

export function isBrdTheme(value: unknown): value is BrdTheme {
  return value === "dark" || value === "light";
}

/** Missing or invalid → dark (Owner default). */
export function normalizeBrdTheme(value: unknown): BrdTheme {
  return isBrdTheme(value) ? value : "dark";
}

export function readStoredBrdTheme(): BrdTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return normalizeBrdTheme(window.localStorage.getItem(BRD_THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function writeStoredBrdTheme(theme: BrdTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRD_THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / quota — preference is session-only */
  }
}

/** Apply theme to <html> (data-theme + .dark for Tailwind variant). */
export function applyBrdThemeToDocument(theme: BrdTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function toggleBrdTheme(current: BrdTheme): BrdTheme {
  return current === "dark" ? "light" : "dark";
}

/**
 * Inline blocking script for RootLayout (FOUC guard).
 * Keep in sync with normalizeBrdTheme / storage key above.
 */
export const BRD_THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(BRD_THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="dark";var r=document.documentElement;r.setAttribute("data-theme",t);r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;}catch(e){var r2=document.documentElement;r2.setAttribute("data-theme","dark");r2.classList.add("dark");r2.style.colorScheme="dark";}})();`;
