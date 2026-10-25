/**
 * WCAG 2.4.1 Bypass Blocks — one skip control per SiteHeader surface.
 * Target landmark id must exist once on the page (`MAIN_CONTENT_ID`).
 */
export const MAIN_CONTENT_ID = "main-content";

/** Clear sticky SiteHeader (+ safe-area) when activating skip / hash focus. */
export const MAIN_CONTENT_LANDMARK_CLASS =
  "scroll-mt-[calc(4.5rem+env(safe-area-inset-top))] outline-none";

const skipLinkClass =
  "sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:inline-flex focus:min-h-11 focus:items-center focus:border focus:border-[var(--brd-green)] focus:bg-[var(--brd-paper)] focus:px-3 focus:text-sm focus:font-medium focus:text-[var(--brd-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brd-focus)] focus:ring-offset-2 focus:ring-offset-[var(--brd-paper)]";

export function SkipToMainContent() {
  return (
    <a href={`#${MAIN_CONTENT_ID}`} className={skipLinkClass}>
      Przejdź do treści
    </a>
  );
}
