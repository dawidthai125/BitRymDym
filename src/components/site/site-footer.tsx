import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/site/language-switcher";
import { InstallAppButton } from "@/components/site/pwa-install";
import { siteConfig } from "@/config/site";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";
import { LANDING_PAGES, landingPath } from "@/lib/seo/landing-pages";
import { EN_LANDING_PAGES, englishLandingPath } from "@/lib/seo/landing-pages-en";
import { isStoreApp } from "@/lib/site/store-app-server";

export async function SiteFooter() {
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
      ];
  return (
    <footer className="border-t border-[var(--brd-line)] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-[var(--brd-ink-soft)]">
        <span>© {siteConfig.name}</span>
        <nav aria-label={menu("glowneMenu")} className="flex flex-wrap gap-x-4 gap-y-0">
          <Link href="/beats?zrodlo=brd" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("beats")}</Link>
          <Link href="/ranking" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{shelf("beatRank")}</Link>
          <Link href="/sampel?zrodlo=brd" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{shelf("samples")}</Link>
          <Link href="/ranking/sampel" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{shelf("sampleRank")}</Link>
          <Link href="/utwory" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{shelf("works")}</Link>
          <Link href="/ranking/utwor" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{shelf("workRank")}</Link>
          <Link href="/studio" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("studio")}</Link>
          <Link href="/mastering" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("mastering")}</Link>
          <Link href="/nagrywarka" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("recorder")}</Link>
          <Link href="/jak-nagrac" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("howTo")}</Link>
          <Link href="/about" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("about")}</Link>
          {/* Store app: no plan / purchase links (store rules). */}
          {storeApp ? null : (
            <Link href="/premium" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("premium")}</Link>
          )}
          <InstallAppButton />
        </nav>
        <nav aria-label={english ? "Shortcuts" : "Na skróty"} className="flex w-full flex-wrap gap-x-4 gap-y-0 text-xs text-[var(--brd-mute)]" data-testid="footer-landing-links">
          {shortcuts.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <nav aria-label={t("nawigacja")} className="flex flex-wrap gap-x-4 gap-y-0">
          <Link href={LEGAL_PATHS.terms} className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{t("regulamin")}</Link>
          <Link href={LEGAL_PATHS.privacy} className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{t("prywatnosc")}</Link>
          <Link href={LEGAL_PATHS.cookies} className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{t("cookies")}</Link>
        </nav>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
