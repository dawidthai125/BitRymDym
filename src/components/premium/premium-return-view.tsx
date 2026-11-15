import { useTranslations } from "next-intl";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { ReturnRefresh } from "@/components/premium/return-refresh";
import { AppShell } from "@/components/site/app-shell";

export type ReturnState =
  | { status: "pending" }
  | { status: "paid"; product: string; until: string | null; scheduled?: boolean }
  | { status: "skipped"; reason: "perpetual" | "downgrade" | "pending_plan" | "addon_perpetual" }
  | { status: "failed" }
  | { status: "missing" }
  | { status: "beat_pending"; href: string }
  | { status: "beat_paid"; href: string }
  | { status: "beat_skipped"; href: string }
  | { status: "beat_failed"; href: string };

export function PremiumReturnView({ state }: { state: ReturnState }) {
  const t = useTranslations("account.premiumPage.returnPage");
  const pending = state.status === "pending" || state.status === "beat_pending";
  const beatHref = state.status === "beat_pending" || state.status === "beat_paid" || state.status === "beat_skipped" || state.status === "beat_failed" ? state.href : null;
  let body = t("brak");
  if (state.status === "pending") body = t("czekam");
  if (state.status === "beat_pending") body = t("bitCzekam");
  if (state.status === "beat_paid") body = t("bitGotowy");
  if (state.status === "beat_skipped") body = t("bitJuz");
  if (state.status === "beat_failed") body = t("bitNieudane");
  if (state.status === "paid") {
    body = state.until
      ? t(state.scheduled ? "zaplanowane" : "gotowe", { co: state.product, data: state.until })
      : t("pakietGotowy", { co: state.product });
  }
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
          <div className="mt-6 flex flex-wrap gap-3">
            {beatHref ? <BrdLink href={beatHref}>{state.status === "beat_paid" ? t("pobierzWav") : t("otworzBit")}</BrdLink> : null}
            <BrdLink href="/premium">{t("wroc")}</BrdLink>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
