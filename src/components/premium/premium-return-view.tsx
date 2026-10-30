import { useTranslations } from "next-intl";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { ReturnRefresh } from "@/components/premium/return-refresh";
import { AppShell } from "@/components/site/app-shell";

export type ReturnState =
  | { status: "pending" }
  | { status: "paid"; product: string; until: string }
  | { status: "skipped"; reason: "perpetual" | "downgrade" | "addon_perpetual" }
  | { status: "failed" }
  | { status: "missing" };

export function PremiumReturnView({ state }: { state: ReturnState }) {
  const t = useTranslations("account.premiumPage.returnPage");
  const pending = state.status === "pending";
  let body = t("brak");
  if (state.status === "pending") body = t("czekam");
  if (state.status === "paid") body = t("gotowe", { co: state.product, data: state.until });
  if (state.status === "skipped") body = t("pominiete", { powod: t(`powod.${state.reason}`) });
  if (state.status === "failed") body = t("nieudane");

  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-xl py-10 sm:py-12">
          <SectionLabel>{t("kicker")}</SectionLabel>
          <h1 className="brd-display mt-2 text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-[0.95] tracking-tight">{t("naglowek")}</h1>
          <p data-testid="premium-return-status" role="status" className="mt-4 max-w-[52ch] text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]">
            {body}
          </p>
          {pending ? <ReturnRefresh /> : null}
          <div className="mt-6">
            <BrdLink href="/premium">{t("wroc")}</BrdLink>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
