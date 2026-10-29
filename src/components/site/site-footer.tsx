import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/site/language-switcher";
import { siteConfig } from "@/config/site";

export async function SiteFooter() {
  const t = await getTranslations("language");
  return (
    <footer className="border-t border-[var(--brd-line)] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-[var(--brd-ink-soft)]">
        <span>© {siteConfig.name}</span>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">{t("hint")}</span>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
