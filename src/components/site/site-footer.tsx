import { LanguageSwitcher } from "@/components/site/language-switcher";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--brd-line)] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-[var(--brd-ink-soft)]">
        <span>© {siteConfig.name}</span>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
