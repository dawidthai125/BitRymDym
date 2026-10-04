import Link from "next/link";

import { AdminUsersFilters } from "@/components/admin/admin-users-filters";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { listAdminUsers } from "@/lib/admin/users-list";
import { parseAdminUsersQuery } from "@/lib/admin/users-query";
import { AuthError } from "@/lib/auth/session";
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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminUsersQuery(raw);

  let result: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let loadFailed = false;
  try {
    result = await listAdminUsers(query);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    loadFailed = true;
  }

  const hasFilters = Boolean(query.q || query.role || query.premium || query.rank);
  const emptyMessage = hasFilters
    ? "Nie znaleziono użytkowników dla podanych filtrów."
    : "Brak użytkowników.";

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <SectionLabel>ADMIN</SectionLabel>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            Użytkownicy
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Podgląd kont, ról i Premium. Zmiana uprawnień będzie dostępna w
            kolejnej wersji.
          </p>
        </header>

        <AdminUsersFilters
          q={query.q}
          role={query.role ?? ""}
          premium={query.premium ?? ""}
          rank={query.rank ?? ""}
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
                        <span
                          className="text-sm text-[var(--brd-mute)]"
                          title="Zarządzanie uprawnieniami będzie dostępne w kolejnej wersji"
                        >
                          Zarządzaj
                        </span>
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
                    const params = new URLSearchParams();
                    if (query.q) params.set("q", query.q);
                    if (query.role) params.set("role", query.role);
                    if (query.premium) params.set("premium", query.premium);
                    if (query.rank) params.set("rank", query.rank);
                    params.set("page", String(page));
                    const href = `/admin/users?${params.toString()}`;
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
      </PageFrame>
    </main>
  );
}
