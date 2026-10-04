import Link from "next/link";

import { AdminUsersAuditFilters } from "@/components/admin/admin-users-audit-filters";
import { AdminUsersDeleteDialog } from "@/components/admin/admin-users-delete-dialog";
import { AdminUsersFilters } from "@/components/admin/admin-users-filters";
import { AdminUsersManageDialog } from "@/components/admin/admin-users-manage-dialog";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { listAdminUserAuditEvents } from "@/lib/admin/users-audit-list";
import { parseAdminUsersAuditQuery } from "@/lib/admin/users-audit-query";
import { listAdminUsers } from "@/lib/admin/users-list";
import { parseAdminUsersQuery } from "@/lib/admin/users-query";
import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import {
  labelCreatorRank,
  labelPremiumTier,
  labelSystemRole,
} from "@/lib/ui/labels";

function formatExpiresAt(iso: string | null): string {
  if (!iso) return "Bezterminowo";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Bezterminowo";
  return new Intl.DateTimeFormat("pl-PL", {
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
  try {
    result = await listAdminUsers(query);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    loadFailed = true;
  }

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
    ? "Nie znaleziono użytkowników dla podanych filtrów."
    : "Brak użytkowników.";

  const hasAuditFilters = Boolean(
    auditQuery.action ||
      auditQuery.targetUserNumber != null ||
      auditQuery.rejectTarget,
  );
  const auditEmptyMessage = hasAuditFilters
    ? "Nie znaleziono zmian dla podanych filtrów."
    : "Brak zapisanych zmian.";

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
          <SectionLabel>ADMIN</SectionLabel>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            Użytkownicy
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Podgląd i zmiana ról oraz Premium. Usunięcie konta wymaga powodu.
            Historia zmian jest tylko do odczytu.
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
            Nie udało się pobrać listy użytkowników.
          </p>
        ) : !result || result.total === 0 ? (
          <p className="mt-8 text-sm text-[var(--brd-mute)]">{emptyMessage}</p>
        ) : (
          <div className="mt-8">
            <p className="mb-3 text-sm text-[var(--brd-mute)]">
              {result.total}{" "}
              {result.total === 1 ? "użytkownik" : "użytkowników"}
              {result.truncated
                ? " (wyniki ograniczone — zawęź wyszukiwanie)"
                : ""}
            </p>
            <div className="overflow-x-auto border border-[var(--brd-line)]">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-[var(--brd-paper-deep)]/40 text-[var(--brd-mute)]">
                  <tr>
                    <th className="px-3 py-3 font-medium">Ksywka</th>
                    <th className="px-3 py-3 font-medium">E-mail</th>
                    <th className="px-3 py-3 font-medium">ID</th>
                    <th className="px-3 py-3 font-medium">Ranga</th>
                    <th className="px-3 py-3 font-medium">Premium</th>
                    <th className="px-3 py-3 font-medium">Wygasa</th>
                    <th className="px-3 py-3 font-medium">Rola</th>
                    <th className="px-3 py-3 font-medium">
                      <span className="sr-only">Akcje</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brd-line)]">
                  {result.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-3 font-medium">
                        {row.displayName?.trim() || "Użytkownik"}
                      </td>
                      <td className="px-3 py-3 text-[var(--brd-ink-soft)]">
                        {row.email ?? "—"}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {row.userNumber ?? "—"}
                      </td>
                      <td className="px-3 py-3">{labelCreatorRank(row.rank)}</td>
                      <td className="px-3 py-3">
                        {labelPremiumTier(row.premiumTier)}
                      </td>
                      <td className="px-3 py-3 text-[var(--brd-ink-soft)]">
                        {row.premiumTier === "FREE"
                          ? "—"
                          : formatExpiresAt(row.premiumExpiresAt)}
                      </td>
                      <td className="px-3 py-3">{labelSystemRole(row.role)}</td>
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
                aria-label="Strony listy użytkowników"
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
            Historia zmian
          </h2>
          <p className="mt-2 max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Każdy zapisany wpis jest osobnym wierszem. Usunięci użytkownicy
            pozostają widoczni po numerze ID.
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
              Brak dostępu do historii zmian.
            </p>
          ) : auditLoadFailed ? (
            <p className="mt-8 text-sm text-[var(--brd-mute)]" role="alert">
              Nie udało się pobrać historii zmian.
            </p>
          ) : !auditResult || auditResult.total === 0 ? (
            <p className="mt-8 text-sm text-[var(--brd-mute)]">
              {auditEmptyMessage}
            </p>
          ) : (
            <div className="mt-8">
              <p className="mb-3 text-sm text-[var(--brd-mute)]">
                {auditResult.total}{" "}
                {auditResult.total === 1 ? "zmiana" : "zmian"}
              </p>
              <div className="overflow-x-auto border border-[var(--brd-line)]">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead className="bg-[var(--brd-paper-deep)]/40 text-[var(--brd-mute)]">
                    <tr>
                      <th className="px-3 py-3 font-medium">Data</th>
                      <th className="px-3 py-3 font-medium">Kto</th>
                      <th className="px-3 py-3 font-medium">Kogo</th>
                      <th className="px-3 py-3 font-medium">Operacja</th>
                      <th className="px-3 py-3 font-medium">Zmiana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--brd-line)]">
                    {auditResult.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {row.createdAt}
                        </td>
                        <td className="px-3 py-3">{row.actorLabel}</td>
                        <td className="px-3 py-3">{row.targetLabel}</td>
                        <td className="px-3 py-3">{row.action}</td>
                        <td className="px-3 py-3">
                          {row.oldLabel} → {row.newLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {auditResult.pageCount > 1 ? (
                <nav
                  className="mt-4 flex flex-wrap gap-2 text-sm"
                  aria-label="Strony historii zmian"
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
