/**
 * English URLs (/en/...) for public pages (pure, client-safe).
 * The site keeps cookie-based language switching; /en/<path> is the crawlable
 * English address of <path>: middleware rewrites it to <path> with the request
 * locale forced to "en". Only pages whose copy lives in messages/*.json are
 * localized; Polish-only content (keyword landings, poradniki) stays without /en.
 */
import type { AppLocale } from "@/i18n/config";

export const EN_PREFIX = "/en";
/** Request header set by middleware for /en/... (read by src/i18n/request.ts). */
export const LOCALE_OVERRIDE_HEADER = "x-brd-locale";

const STATIC_PATHS = new Set([
  "/",
  "/beats",
  "/sampel",
  "/utwory",
  "/ranking",
  "/ranking/sampel",
  "/ranking/utwor",
  "/about",
  "/jak-nagrac",
  "/nagrywarka",
  "/mastering",
  "/premium",
]);
const DYNAMIC_PREFIXES = ["/beat/", "/sampel/", "/utwor/", "/beats/gatunek/"];

/** Path without query/hash, no trailing slash (except "/"). */
function clean(path: string): string {
  const p = path.split(/[?#]/)[0] || "/";
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export function isLocalizedPath(path: string): boolean {
  const p = clean(path);
  if (STATIC_PATHS.has(p)) return true;
  return DYNAMIC_PREFIXES.some((prefix) => p.startsWith(prefix) && p.length > prefix.length && !p.slice(prefix.length).includes("/"));
}

/** "/en/beats" → "/beats", "/en" → "/"; null when not an English URL of a localized page. */
export function stripEnglishPrefix(pathname: string): string | null {
  if (pathname !== EN_PREFIX && !pathname.startsWith(`${EN_PREFIX}/`)) return null;
  const rest = clean(pathname.slice(EN_PREFIX.length) || "/");
  return isLocalizedPath(rest) ? rest : null;
}

export function localizedPath(locale: AppLocale, path: string): string {
  const p = clean(path);
  if (locale !== "en" || !isLocalizedPath(p)) return p;
  return p === "/" ? EN_PREFIX : `${EN_PREFIX}${p}`;
}

/** canonical + hreflang alternates for Next metadata (relative to metadataBase). */
export function localeAlternates(
  locale: AppLocale,
  path: string,
): { canonical: string; languages?: Record<string, string> } {
  const p = clean(path);
  if (!isLocalizedPath(p)) return { canonical: p };
  return {
    canonical: localizedPath(locale, p),
    languages: { pl: p, en: localizedPath("en", p), "x-default": p },
  };
}

/** Extra domains that open the English site (DNS → Vercel project). */
const ENGLISH_HOSTS = new Set(["bitrymdym.com", "www.bitrymdym.com", "bitrymdym.eu", "www.bitrymdym.eu"]);

/**
 * bitrymdym.com/<path> → https://www.bitrymdym.pl/en/<path> (localized pages) or /<path> (the rest).
 * null for every other host.
 */
export function englishHostRedirect(host: string | null, pathname: string, search: string, origin: string): string | null {
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (!ENGLISH_HOSTS.has(h)) return null;
  return `${origin}${localizedPath("en", pathname)}${search}`;
}
