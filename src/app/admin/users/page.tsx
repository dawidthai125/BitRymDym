import { getLibText } from "@/i18n/get-lib-text";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminUsersAuditFilters } from "@/components/admin/admin-users-audit-filters";
import { AdminUsersDeleteDialog } from "@/components/admin/admin-users-delete-dialog";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters";
import { AdminUsersManageDialog } from "@/components/admin/admin-users-manage-dialog";
import { PageFrame } from "@/components/brand/chrome";
import { listAdminUserAuditEvents } from "@/lib/admin/users-audit-list";
import { parseAdminUsersAuditQuery } from "@/lib/admin/users-audit-query";
import {
  adminUsersListAccessDenial,
  listAdminUsers,
  type AdminUsersListAccessDenial,
} from "@/lib/admin/users-list";
import { parseAdminUsersQuery } from "@/lib/admin/users-query";
import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import {
  labelCreatorRank,
  labelPremiumTier,
  labelSystemRole,
} from "@/lib/ui/labels";
import { intlTag, resolveLocale } from "@/i18n/config";

function formatExpiresAt(
  iso: string | null,
  tag = "pl-PL",
  noExpiry = "Bezterminowo",
): string {
  if (!iso) return noExpiry;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return noExpiry;
  return new Intl.DateTimeFormat(tag, {
    dateStyle: "medium",
  }).format(date);
}

function adminUsersHref(opts: {
  q?: string;
  role?: string | null;
  premium?: string | null;
  rank?: string | null;
  page?: number;
  auditAction?: string | null;
  auditUser?: string;
  auditPage?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.role) params.set("role", opts.role);
  if (opts.premium) params.set("premium", opts.premium);
  if (opts.rank) params.set("rank", opts.rank);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.auditAction) params.set("auditAction", opts.auditAction);
  if (opts.auditUser) params.set("auditUser", opts.auditUser);
  if (opts.auditPage && opts.auditPage > 1) {
    params.set("auditPage", String(opts.auditPage));
  }
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tl = await getLibText();
  const t = await getTranslations("admin.adminUsersPage");
  const tShared = await getTranslations("common.shared");
  const tag = intlTag(resolveLocale(await getLocale()));
  const raw = await searchParams;
  const query = parseAdminUsersQuery(raw);
  const auditQuery = parseAdminUsersAuditQuery(raw);
  const viewer = await getCurrentProfile();
  const auditUserParam =
    auditQuery.rejectTarget
      ? String(Array.isArray(raw.auditUser) ? raw.auditUser[0] : raw.auditUser ?? "")
      : auditQuery.targetUserNumber != null
        ? String(auditQuery.targetUserNumber)
        : "";

  let result: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let loadFailed = false;
  let denial: AdminUsersListAccessDenial | null = null;
  try {
    result = await listAdminUsers(query);
  } catch (error) {
    denial = adminUsersListAccessDenial(error);
    if (!denial) {
      if (error instanceof AuthError) throw error;
      loadFailed = true;
    }
  }

  // The layout renders the same denial, but it does not stop this page from
  // rendering, so the page must handle it too instead of throwing.
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") return null;

  let auditResult: Awaited<ReturnType<typeof listAdminUserAuditEvents>> | null =
    null;
  let auditLoadFailed = false;
  let auditForbidden = false;
  try {
    auditResult = await listAdminUserAuditEvents(auditQuery);
  } catch (error) {
    if (error instanceof AuthError) {
      auditForbidden = true;
    } else {
      auditLoadFailed = true;
    }
  }

  const hasFilters = Boolean(query.q || query.role || query.premium || query.rank);
  const emptyMessage = hasFilters
    ? t("nieZnalezionoUzytkownikowDla")
    : t("brakUzytkownikow");

  const hasAuditFilters = Boolean(
    auditQuery.action ||
      auditQuery.targetUserNumber != null ||
      auditQuery.rejectTarget,
  );
  const auditEmptyMessage = hasAuditFilters
    ? t("nieZnalezionoZmianDla")
    : t("brakZapisanychZmian");

  const sharedQuery = {
    q: query.q,
    role: query.role,
    premium: query.premium,
    rank: query.rank,
    page: query.page,
    auditAction: auditQuery.action,
    auditUser: auditUserParam,
  };

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            {t("uzytkownicy")}
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {t("podgladIZmianaRol")}
          </p>
        </header>

        <AdminUsersFilters
          q={query.q}
          role={query.role ?? ""}
          premium={query.premium ?? ""}
          rank={query.rank ?? ""}
          auditAction={auditQuery.action ?? ""}
          auditUser={auditUserParam}
        />

        {loadFailed ? (
          <p className="mt-8 text-sm text-[var(--brd-mute)]" role="alert">
            {t("nieUdaloSiePobrac")}
          </p>
        ) : !result || result.total === 0 ? (
          <p className="mt-8 text-sm text-[var(--brd-mute)]">{tl(emptyMessage)}</p>
        ) : (
          <div className="mt-8">
            <p className="mb-3 text-sm text-[var(--brd-mute)]">
              {result.total}{" "}
              {tl(result.total === 1 ? "użytkownik" : "użytkowników")}
              {tl(result.truncated
                ? t("wynikiOgraniczoneZawezWyszukiwanie")
                : "")}
            </p>
            <div className="overflow-x-auto border border-[var(--brd-line)]">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-[var(--brd-paper-deep)]/40 text-[var(--brd-mute)]">
                  <tr>
                    <th className="px-3 py-3 font-medium">{t("ksywka")}</th>
                    <th className="px-3 py-3 font-medium">{t("eMail")}</th>
                    <th className="px-3 py-3 font-medium">{t("id")}</th>
                    <th className="px-3 py-3 font-medium">{t("ranga")}</th>
                    <th className="px-3 py-3 font-medium">{t("premium")}</th>
                    <th className="px-3 py-3 font-medium">{t("wygasa")}</th>
                    <th className="px-3 py-3 font-medium">{t("rola")}</th>
                    <th className="px-3 py-3 font-medium">
                      <span className="sr-only">{t("akcje")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brd-line)]">
                  {result.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-3 font-medium">
                        {tl(row.displayName?.trim() || t("uzytkownik"))}
                      </td>
                      <td className="px-3 py-3 text-[var(--brd-ink-soft)]">
                        {tl(row.email ?? "—")}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {row.userNumber ?? "—"}
                      </td>
                      <td className="px-3 py-3">{tl(labelCreatorRank(row.rank))}</td>
                      <td className="px-3 py-3">
                        {tl(labelPremiumTier(row.premiumTier))}
                      </td>
                      <td className="px-3 py-3 text-[var(--brd-ink-soft)]">
                        {tl(row.premiumTier === "FREE"
                          ? "—"
                          : formatExpiresAt(row.premiumExpiresAt, tag, tShared("noExpiry")))}
                      </td>
                      <td className="px-3 py-3">{tl(labelSystemRole(row.role))}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-2">
                          <AdminUsersManageDialog
                            userId={row.id}
                            displayName={row.displayName}
                            email={row.email}
                            userNumber={row.userNumber}
                            role={row.role}
                            premiumTier={row.premiumTier}
                            premiumExpiresAt={row.premiumExpiresAt}
                            isSelf={viewer?.userId === row.id}
                          />
                          <AdminUsersDeleteDialog
                            userId={row.id}
                            displayName={row.displayName}
                            email={row.email}
                            userNumber={row.userNumber}
                            isSelf={viewer?.userId === row.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.pageCount > 1 ? (
              <nav
                className="mt-4 flex flex-wrap gap-2 text-sm"
                aria-label={t("stronyListyUzytkownikow")}
              >
                {Array.from({ length: result.pageCount }, (_, i) => i + 1).map(
                  (page) => {
                    const href = adminUsersHref({
                      ...sharedQuery,
                      page,
                    });
                    const current = page === result.page;
                    return current ? (
                      <span
                        key={page}
                        className="inline-flex min-h-11 items-center px-3 font-medium"
                      >
                        {page}
                      </span>
                    ) : (
                      <Link
                        key={page}
                        href={href}
                        className="inline-flex min-h-11 items-center px-3 underline underline-offset-4"
                      >
                        {page}
                      </Link>
                    );
                  },
                )}
              </nav>
            ) : null}
          </div>
        )}

        <section className="mt-12 border-t border-[var(--brd-line)] pt-8">
          <h2 className="brd-display text-2xl font-semibold tracking-tight">
            {t("historiaZmian")}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {t("kazdyZapisanyWpisJest")}
          </p>

          <div className="mt-6">
            <AdminUsersAuditFilters
              action={auditQuery.action ?? ""}
              auditUser={auditUserParam}
              q={query.q}
              role={query.role ?? ""}
              premium={query.premium ?? ""}
              rank={query.rank ?? ""}
              page={query.page > 1 ? String(query.page) : ""}
            />
          </div>

          {auditForbidden ? (
            <p className="mt-8 text-sm text-[var(--brd-mute)]" role="alert">
              {t("brakDostepuDoHistorii")}
            </p>
          ) : auditLoadFailed ? (
            <p className="mt-8 text-sm text-[var(--brd-mute)]" role="alert">
              {t("nieUdaloSiePobrac2")}
            </p>
          ) : !auditResult || auditResult.total === 0 ? (
            <p className="mt-8 text-sm text-[var(--brd-mute)]">
              {tl(auditEmptyMessage)}
            </p>
          ) : (
            <div className="mt-8">
              <p className="mb-3 text-sm text-[var(--brd-mute)]">
                {auditResult.total}{" "}
                {tl(auditResult.total === 1 ? "zmiana" : "zmian")}
              </p>
              <div className="overflow-x-auto border border-[var(--brd-line)]">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead className="bg-[var(--brd-paper-deep)]/40 text-[var(--brd-mute)]">
                    <tr>
                      <th className="px-3 py-3 font-medium">{t("data")}</th>
                      <th className="px-3 py-3 font-medium">{t("kto")}</th>
                      <th className="px-3 py-3 font-medium">{t("kogo")}</th>
                      <th className="px-3 py-3 font-medium">{t("operacja")}</th>
                      <th className="px-3 py-3 font-medium">{t("zmiana")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--brd-line)]">
                    {auditResult.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {tl(row.createdAt)}
                        </td>
                        <td className="px-3 py-3">{tl(row.actorLabel)}</td>
                        <td className="px-3 py-3">{tl(row.targetLabel)}</td>
                        <td className="px-3 py-3">{tl(row.action)}</td>
                        <td className="px-3 py-3">
                          {tl(row.oldLabel)} → {tl(row.newLabel)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {auditResult.pageCount > 1 ? (
                <nav
                  className="mt-4 flex flex-wrap gap-2 text-sm"
                  aria-label={t("stronyHistoriiZmian")}
                >
                  {Array.from(
                    { length: auditResult.pageCount },
                    (_, i) => i + 1,
                  ).map((auditPage) => {
                    const href = adminUsersHref({
                      ...sharedQuery,
                      auditPage,
                    });
                    const current = auditPage === auditResult.page;
                    return current ? (
                      <span
                        key={auditPage}
                        className="inline-flex min-h-11 items-center px-3 font-medium"
                      >
                        {auditPage}
                      </span>
                    ) : (
                      <Link
                        key={auditPage}
                        href={href}
                        className="inline-flex min-h-11 items-center px-3 underline underline-offset-4"
                      >
                        {auditPage}
                      </Link>
                    );
                  })}
                </nav>
              ) : null}
            </div>
          )}
        </section>
      </PageFrame>
    </main>
  );
}
