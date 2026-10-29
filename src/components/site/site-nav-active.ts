/**
 * Shared primary-nav active matching for desktop header and mobile bottom nav.
 * Keep aria-current="page" in sync with this helper (WCAG 2.2 current page).
 */

/** Shared link classes for SiteHeader auth CTAs and SiteMainNav items. */
export const siteNavLinkClass =
  "inline-flex min-h-11 items-center px-2.5 font-poster text-base font-bold uppercase tracking-[0.1em] text-[var(--brd-ink-soft)] underline-offset-[6px] decoration-2 transition-colors hover:text-[var(--brd-ink)]";

export type SiteNavActiveOptions = {
  /** Mobile Studio tab also covers /account hub routes. */
  studioIncludesAccount?: boolean;
};

export function isSiteNavHrefActive(
  pathname: string,
  href: string,
  options?: SiteNavActiveOptions,
): boolean {
  if (href === "/studio") {
    if (
      options?.studioIncludesAccount &&
      (pathname === "/account" || pathname.startsWith("/account/"))
    ) {
      return true;
    }
    return pathname === "/studio" || pathname.startsWith("/studio/");
  }
  if (href === "/library") {
    return pathname === "/library" || pathname.startsWith("/library/");
  }
  if (href === "/profile") {
    return pathname === "/profile" || pathname.startsWith("/profile/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
