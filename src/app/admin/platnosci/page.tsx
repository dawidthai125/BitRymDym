import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { AdminPaymentReviewActions } from "@/components/admin/admin-payment-review-actions";
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
import { listOpenPaymentReviews } from "@/lib/admin/payment-reviews";
import { paymentReviewReason } from "@/lib/admin/payment-reviews-present";
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

type Translate = Awaited<ReturnType<typeof getTranslations<"admin.adminPaymentsPage">>>;

function productLabel(t: Translate, row: Parameters<typeof paymentHistoryProduct>[0]): string {
  const product = paymentHistoryProduct(row);
  if (product.kind === "plan") return t("plan", { tier: product.tier });
  if (product.kind === "addon") return t("dodatek");
  if (product.kind === "pack") return t(`pakiet.${product.pack}`);
  if (product.kind === "beat") return t("bitWav");
  return t("nieznane");
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.adminPaymentsPage");
  const tr = await getTranslations("admin.adminPaymentReviews");
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

  let reviews: Awaited<ReturnType<typeof listOpenPaymentReviews>> | null = null;
  if (result) {
    try {
      reviews = await listOpenPaymentReviews();
    } catch (error) {
      if (error instanceof AuthError) throw error;
      reviews = null;
    }
  }

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </header>
        {result ? (
          <section className="mb-10 space-y-3" aria-labelledby="payment-reviews">
            <h2 id="payment-reviews" className="brd-display text-xl font-semibold tracking-tight">
              {tr("tytul")}
            </h2>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{tr("opis")}</p>
            {!reviews ? (
              <p className="text-sm text-[var(--brd-ink-soft)]">{tr("blad")}</p>
            ) : reviews.rows.length === 0 ? (
              <p className="text-sm text-[var(--brd-ink-soft)]">{tr("pusto")}</p>
            ) : (
              <div className="overflow-x-auto border border-[var(--brd-line)]">
                <table className="w-full min-w-[64rem] text-left text-sm">
                  <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                    <tr className="brd-meta text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                      <th className="px-3 py-3 font-medium">{tr("kiedy")}</th>
                      <th className="px-3 py-3 font-medium">{tr("kto")}</th>
                      <th className="px-3 py-3 font-medium">{tr("co")}</th>
                      <th className="px-3 py-3 font-medium">{tr("kwota")}</th>
                      <th className="px-3 py-3 font-medium">{tr("zwrot")}</th>
                      <th className="px-3 py-3 font-medium">{tr("powod")}</th>
                      {reviews.canManage ? <th className="px-3 py-3 font-medium">{tr("dalej")}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--brd-line)]">
                    {reviews.rows.map((row) => {
                      const reason = paymentReviewReason(row.reason);
                      const order = row.order;
                      const orderStatus = order ? paymentHistoryStatus(order.status) : null;
                      const who = row.displayName?.trim() || row.buyerEmail;
                      return (
                        <tr key={row.id} className="align-top hover:bg-[var(--brd-paper-deep)]/40">
                          <td className="px-3 py-3 whitespace-nowrap">{formatWhen(row.createdAt, tag)}</td>
                          <td className="px-3 py-3">
                            {row.userId ? (
                              <>
                                <Link href={`/admin/users/${row.userId}`} className="font-medium hover:text-[var(--brd-green)]">
                                  {who}
                                </Link>
                                <p className="text-xs text-[var(--brd-mute)]">{row.buyerEmail}</p>
                                {row.userNumber != null ? (
                                  <p className="text-xs text-[var(--brd-mute)]">#{row.userNumber}</p>
                                ) : null}
                              </>
                            ) : (
                              t("nieznane")
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {order ? productLabel(t, order) : t("nieznane")}
                            {order ? (
                              <p className="text-xs text-[var(--brd-mute)]">
                                {orderStatus ? t(`statusy.${orderStatus}`) : t("nieznane")}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">{formatGroszPln(order?.amount_grosz ?? null, locale)}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{formatGroszPln(row.refundAmount, locale)}</td>
                          <td className="px-3 py-3">{reason ? tr(`powody.${reason}`) : tr("powodInny", { kod: row.reason })}</td>
                          {reviews.canManage ? (
                            <td className="px-3 py-3">
                              <AdminPaymentReviewActions reviewId={row.id} canRevoke={row.canRevoke} />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
        {loadFailed || !result ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("blad")}</p>
        ) : result.rows.length === 0 ? (
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("pusto")}</p>
        ) : (
          <div className="overflow-x-auto border border-[var(--brd-line)]">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                <tr className="brd-meta text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">
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
                      <td className="px-3 py-3">{productLabel(t, row)}</td>
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
