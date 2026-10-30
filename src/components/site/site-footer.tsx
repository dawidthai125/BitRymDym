import Link from "next/link";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/site/language-switcher";
import { siteConfig } from "@/config/site";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";

export function SiteFooter() {
  const t = useTranslations("common.legal");
  return (
    <footer className="border-t border-[var(--brd-line)] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-[var(--brd-ink-soft)]">
        <span>© {siteConfig.name}</span>
        <nav aria-label={t("nawigacja")} className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href={LEGAL_PATHS.terms} className="underline-offset-4 hover:underline">{t("regulamin")}</Link>
          <Link href={LEGAL_PATHS.privacy} className="underline-offset-4 hover:underline">{t("prywatnosc")}</Link>
          <Link href={LEGAL_PATHS.cookies} className="underline-offset-4 hover:underline">{t("cookies")}</Link>
        </nav>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
