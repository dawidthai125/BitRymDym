/**
 * Shared primary-nav active matching for desktop header and mobile bottom nav.
 * Keep aria-current="page" in sync with this helper (WCAG 2.2 current page).
 */
import { ACCOUNT_TABS } from "@/lib/account/account-tabs";

/** Shared link classes for SiteHeader auth CTAs and SiteMainNav items. */
export const siteNavLinkClass =
  "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-2.5 font-poster text-base font-bold uppercase tracking-[0.1em] text-[var(--brd-ink-soft)] underline-offset-[6px] decoration-2 transition-colors hover:text-[var(--brd-ink)]";

/** The profile pages that the "Library" entry opens. */
const LIBRARY_PAGES = ACCOUNT_TABS.find((tab) => tab.id === "library")!.pages.map((page) => page.href);

function within(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSiteNavHrefActive(pathname: string, href: string): boolean {
  const library = within(pathname, "/library") || LIBRARY_PAGES.some((page) => within(pathname, page));
  if (href === "/library") return library;
  // "Profile" covers the rest of the profile pages, so exactly one of the two is lit.
  if (href === "/profile") return within(pathname, "/profile") || (within(pathname, "/account") && !library);
  return within(pathname, href);
}
