import Link from "next/link";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/site/language-switcher";
import { siteConfig } from "@/config/site";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";

export function SiteFooter() {
  const t = useTranslations("common.legal");
  const nav = useTranslations("nav.items");
  const shelf = useTranslations("community.shelf");
  const menu = useTranslations("nav.siteMainNav");
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
          <Link href="/premium" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline">{nav("premium")}</Link>
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
