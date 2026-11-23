import Link from "@/components/ui/app-link";
import { getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/site/language-switcher";
import { CookieSettingsButton } from "@/components/site/cookie-consent";
import { SocialIcon } from "@/components/site/social-icon";
import { InstallAppButton } from "@/components/site/pwa-install";
import { siteConfig } from "@/config/site";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";
import { LANDING_PAGES, landingPath } from "@/lib/seo/landing-pages";
import { EN_LANDING_PAGES, englishLandingPath } from "@/lib/seo/landing-pages-en";
import { SOCIAL_PROFILES } from "@/lib/seo/social";
import { isStoreApp } from "@/lib/site/store-app-server";

/** `compact`: one line, for work screens such as the Studio. */
export async function SiteFooter({ compact = false }: { compact?: boolean } = {}) {
  const [t, nav, shelf, menu, storeApp] = await Promise.all([
    getTranslations("common.legal"),
    getTranslations("nav.items"),
    getTranslations("community.shelf"),
    getTranslations("nav.siteMainNav"),
    isStoreApp(),
  ]);
  const english = (await getLocale()) === "en";
  const shortcuts = english
    ? EN_LANDING_PAGES.map((p) => ({ href: englishLandingPath(p.slug), label: p.navLabel }))
    : [
        ...LANDING_PAGES.filter((p) => !(p.webOnly && storeApp)).map((p) => ({ href: landingPath(p.slug), label: p.navLabel })),
        { href: "/poradniki", label: "Poradniki" },
        { href: "/rymy", label: "Słownik rymów" },
        { href: "/narzedzia", label: "Narzędzia" },
      ];
  // 36 px rows on touch, tight rows with a mouse.
  const link = "inline-flex min-h-9 items-center underline-offset-4 hover:text-[var(--brd-ink)] hover:underline lg:min-h-7";
  const heading = "mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brd-ink)]";
  const legal = (
    <nav aria-label={t("nawigacja")} className="flex flex-wrap items-center gap-x-4">
      <Link href={LEGAL_PATHS.terms} className={link}>{t("regulamin")}</Link>
      <Link href={LEGAL_PATHS.privacy} className={link}>{t("prywatnosc")}</Link>
      <Link href={LEGAL_PATHS.cookies} className={link}>{t("cookies")}</Link>
      {storeApp ? null : <CookieSettingsButton />}
    </nav>
  );
  const social = (
    <ul className="flex flex-wrap items-center gap-1" aria-label={t("profile")}>
      {SOCIAL_PROFILES.map((p) => (
        <li key={p.url}>
          <a
            href={p.url}
            rel="me noopener"
            target="_blank"
            aria-label={p.name}
            title={p.name}
            className="inline-flex size-11 items-center justify-center rounded-[2px] text-[var(--brd-ink-soft)] hover:text-[var(--brd-amber)] focus-visible:outline-2 focus-visible:outline-[var(--brd-amber)] lg:size-9"
          >
            <SocialIcon name={p.name} className="size-5" />
          </a>
        </li>
      ))}
    </ul>
  );
  if (compact) {
    return (
      <footer className="border-t border-[var(--brd-line)] px-4 py-1 sm:px-6" data-testid="site-footer" data-footer="compact">
        <div className="flex flex-wrap items-center justify-between gap-x-6 text-xs text-[var(--brd-mute)]">
          <span>© {siteConfig.name}</span>
          {legal}
          {social}
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-[var(--brd-line)] px-4 pb-2 pt-6 sm:px-6" data-testid="site-footer" data-footer="full">
      <div className="mx-auto max-w-6xl text-sm text-[var(--brd-ink-soft)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)]">
          <nav aria-label={t("muzyka")}>
            <h2 className={heading}>{t("muzyka")}</h2>
            <ul className="flex flex-col">
              <li><Link href="/beats?zrodlo=brd" className={link}>{nav("beats")}</Link></li>
              <li><Link href="/ranking" className={link}>{shelf("beatRank")}</Link></li>
              <li><Link href="/sampel?zrodlo=brd" className={link}>{shelf("samples")}</Link></li>
              <li><Link href="/ranking/sampel" className={link}>{shelf("sampleRank")}</Link></li>
              <li><Link href="/utwory" className={link}>{shelf("works")}</Link></li>
              <li><Link href="/ranking/utwor" className={link}>{shelf("workRank")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={menu("glowneMenu")}>
            <h2 className={heading}>{t("tworzenie")}</h2>
            <ul className="flex flex-col">
              <li><Link href="/studio" className={link}>{nav("studio")}</Link></li>
              <li><Link href="/mastering" className={link}>{nav("mastering")}</Link></li>
              <li><Link href="/nagrywarka" className={link}>{nav("recorder")}</Link></li>
              <li><Link href="/jak-nagrac" className={link}>{nav("howTo")}</Link></li>
              {/* Store app: no plan / purchase links (store rules). */}
              {storeApp ? null : (
                <li><Link href="/premium" className={link}>{nav("premium")}</Link></li>
              )}
              <li><Link href="/about" className={link}>{nav("about")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={english ? "Shortcuts" : "Na skróty"} className="col-span-2 lg:col-span-1" data-testid="footer-landing-links">
            <h2 className={heading}>{english ? "Shortcuts" : "Na skróty"}</h2>
            <ul className="grid grid-cols-2 gap-x-6">
              {shortcuts.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-[var(--brd-line)] pt-2 text-xs text-[var(--brd-mute)]">
          <div className="flex flex-wrap items-center gap-x-4">
            <span>© {siteConfig.name}</span>
            {legal}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <InstallAppButton />
            {social}
            <LanguageSwitcher compact className="lg:min-h-9" />
          </div>
        </div>
      </div>
    </footer>
  );
}
