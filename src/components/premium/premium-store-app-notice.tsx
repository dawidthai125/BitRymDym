import { getTranslations } from "next-intl/server";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";

/**
 * Store app (Google Play / App Store): no price list, no checkout and no link to buying —
 * one neutral line instead (store rules forbid steering to payments).
 */
export async function PremiumStoreAppNotice() {
  const tr = await getTranslations("account.premiumPage");
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-10 sm:py-12">
          <SectionLabel>{tr("premium")}</SectionLabel>
          <h1 className="brd-display mt-2 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[0.95] tracking-tight">
            {tr("sklep.tytul")}
          </h1>
          <p data-testid="premium-store-app" role="note" className="mt-4 max-w-[52ch] text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]">
            {tr("sklep.opis")}
          </p>
          <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-[var(--brd-mute)]">{tr("sklep.wAplikacji")}</p>
        </PageFrame>
      </main>
    </AppShell>
  );
}
