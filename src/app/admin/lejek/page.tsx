import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { adminPaymentHistoryAccessDenial } from "@/lib/admin/payment-history";
import type { PaymentHistoryProduct } from "@/lib/admin/payment-history-present";
import { AuthError } from "@/lib/auth/session";
import { loadFunnelStats, type FunnelWindowStats } from "@/lib/funnel/funnel-stats";
import { intlTag, resolveLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminFunnelPage");
  return { title: t("metaTitle") };
}

/** Panel Administracyjny → Lejek zakupu. ADMIN with payments.view (as /admin/platnosci). */
export default async function AdminFunnelPage() {
  const t = await getTranslations("admin.adminFunnelPage");
  const tp = await getTranslations("admin.adminPaymentsPage");
  const tag = intlTag(resolveLocale(await getLocale()));
  const number = new Intl.NumberFormat(tag);
  const percent = (value: number | null) =>
    value === null ? "—" : `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)}%`;
  const productLabel = (product: PaymentHistoryProduct) =>
    product.kind === "plan"
      ? tp("plan", { tier: product.tier })
      : product.kind === "addon"
        ? tp("dodatek")
        : product.kind === "pack"
          ? tp(`pakiet.${product.pack}`)
          : product.kind === "beat"
            ? tp("bitWav")
            : tp("nieznane");

  let windows: FunnelWindowStats[] | null = null;
  try {
    windows = await loadFunnelStats();
  } catch (error) {
    const denial = adminPaymentHistoryAccessDenial(error);
    if (denial === "UNAUTHENTICATED") redirect("/sign-in");
    if (denial === "FORBIDDEN") redirect("/admin");
    if (error instanceof AuthError) throw error;
    windows = null;
  }

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </header>
        {!windows ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("blad")}</p>
        ) : (
          <div className="space-y-10">
            {windows.map((window) => (
              <section key={window.days} aria-labelledby={`lejek-${window.days}`} className="space-y-4">
                <h2 id={`lejek-${window.days}`} className="brd-display text-xl font-semibold tracking-tight">
                  {t("okno", { days: window.days })}
                </h2>
                <div className="overflow-x-auto border border-[var(--brd-line)]">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                      <tr className="brd-meta text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                        <th className="px-3 py-3 font-medium">{t("krok")}</th>
                        <th className="px-3 py-3 font-medium">{t("liczba")}</th>
                        <th className="px-3 py-3 font-medium">{t("zPoprzedniego")}</th>
                        <th className="px-3 py-3 font-medium">{t("zWyswietlen")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--brd-line)]">
                      {window.steps.map((step) => (
                        <tr key={step.id} className="hover:bg-[var(--brd-paper-deep)]/40">
                          <td className="px-3 py-3">{t(`kroki.${step.id}`)}</td>
                          <td className="px-3 py-3 font-mono">{number.format(step.count)}</td>
                          <td className="px-3 py-3 font-mono">{percent(step.fromPrevious)}</td>
                          <td className="px-3 py-3 font-mono">{percent(step.fromViews)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="text-sm font-semibold">{t("rozbicie")}</h3>
                {window.breakdown.length === 0 ? (
                  <p className="text-sm text-[var(--brd-ink-soft)]">{t("pustoOplacone")}</p>
                ) : (
                  <div className="overflow-x-auto border border-[var(--brd-line)]">
                    <table className="w-full min-w-[20rem] text-left text-sm">
                      <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                        <tr className="brd-meta text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                          <th className="px-3 py-3 font-medium">{t("produkt")}</th>
                          <th className="px-3 py-3 font-medium">{t("ile")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--brd-line)]">
                        {window.breakdown.map((row) => (
                          <tr key={row.key} className="hover:bg-[var(--brd-paper-deep)]/40">
                            <td className="px-3 py-3">{productLabel(row.product)}</td>
                            <td className="px-3 py-3 font-mono">{number.format(row.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
            <p className="max-w-prose text-xs text-[var(--brd-mute)]">{t("uwaga")}</p>
          </div>
        )}
      </PageFrame>
    </main>
  );
}
