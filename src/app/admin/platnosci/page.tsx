import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import {
  adminPaymentHistoryAccessDenial,
  listAdminPaymentHistory,
} from "@/lib/admin/payment-history";
import {
  formatGroszPln,
  parsePaymentHistoryPage,
  paymentHistoryGrant,
  paymentHistoryPeriod,
  paymentHistoryProduct,
  paymentHistoryStatus,
} from "@/lib/admin/payment-history-present";
import { AuthError } from "@/lib/auth/session";
import { intlTag, resolveLocale } from "@/i18n/config";

function formatWhen(iso: string | null, tag: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(tag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.adminPaymentsPage");
  const tag = intlTag(resolveLocale(await getLocale()));
  const locale = resolveLocale(await getLocale()) === "en" ? "en" : "pl";
  const raw = await searchParams;
  const page = parsePaymentHistoryPage(raw.page);

  let result: Awaited<ReturnType<typeof listAdminPaymentHistory>> | null = null;
  let loadFailed = false;
  try {
    result = await listAdminPaymentHistory(page);
  } catch (error) {
    const denial = adminPaymentHistoryAccessDenial(error);
    if (denial === "UNAUTHENTICATED") redirect("/sign-in");
    if (denial === "FORBIDDEN") redirect("/admin");
    if (error instanceof AuthError) throw error;
    loadFailed = true;
  }

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </header>
        {loadFailed || !result ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("blad")}</p>
        ) : result.rows.length === 0 ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("pusto")}</p>
        ) : (
          <div className="overflow-x-auto border border-[var(--brd-line)]">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                <tr className="brd-meta text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                  <th className="px-3 py-3 font-medium">{t("kiedy")}</th>
                  <th className="px-3 py-3 font-medium">{t("oplacono")}</th>
                  <th className="px-3 py-3 font-medium">{t("kto")}</th>
                  <th className="px-3 py-3 font-medium">{t("co")}</th>
                  <th className="px-3 py-3 font-medium">{t("kwota")}</th>
                  <th className="px-3 py-3 font-medium">{t("okres")}</th>
                  <th className="px-3 py-3 font-medium">{t("status")}</th>
                  <th className="px-3 py-3 font-medium">{t("doKiedy")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brd-line)]">
                {result.rows.map((row) => {
                  const product = paymentHistoryProduct(row);
                  const period = paymentHistoryPeriod(row.period);
                  const status = paymentHistoryStatus(row.status);
                  const grant = paymentHistoryGrant(row.grant_status);
                  const who = row.displayName?.trim() || row.buyerEmail;
                  return (
                    <tr key={row.id} className="align-top hover:bg-[var(--brd-paper-deep)]/40">
                      <td className="px-3 py-3 whitespace-nowrap">{formatWhen(row.createdAt, tag)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatWhen(row.paidAt, tag)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/admin/users/${row.userId}`} className="font-medium hover:text-[var(--brd-green)]">
                          {who}
                        </Link>
                        <p className="text-xs text-[var(--brd-mute)]">{row.buyerEmail}</p>
                        {row.userNumber != null ? (
                          <p className="text-xs text-[var(--brd-mute)]">#{row.userNumber}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {product.kind === "plan"
                          ? t("plan", { tier: product.tier })
                          : product.kind === "addon"
                            ? t("dodatek")
                            : product.kind === "pack"
                              ? t(`pakiet.${product.pack}`)
                              : t("nieznane")}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatGroszPln(row.amount_grosz, locale)}</td>
                      <td className="px-3 py-3">{period ? t(`okresy.${period}`) : t("nieznane")}</td>
                      <td className="px-3 py-3">
                        <p>{status ? t(`statusy.${status}`) : t("nieznane")}</p>
                        <p className="text-xs text-[var(--brd-mute)]">{grant ? t(`nadanie.${grant}`) : t("nieznane")}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatWhen(row.grantedUntil, tag)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {result && result.pageCount > 1 ? (
          <nav className="mt-4 flex gap-3 text-sm" aria-label={t("strony")}>
            {result.page > 1 ? (
              <Link href={result.page === 2 ? "/admin/platnosci" : `/admin/platnosci?page=${result.page - 1}`} className="underline">
                {t("nowsze")}
              </Link>
            ) : null}
            {result.page < result.pageCount ? (
              <Link href={`/admin/platnosci?page=${result.page + 1}`} className="underline">
                {t("starsze")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </PageFrame>
    </main>
  );
}
