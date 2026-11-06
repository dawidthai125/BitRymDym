import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminUsersDeleteDialog } from "@/components/admin/admin-users-delete-dialog";
import { AdminUsersManageDialog } from "@/components/admin/admin-users-manage-dialog";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { loadAdminUserDesk } from "@/lib/admin/user-desk";
import { adminUsersListAccessDenial } from "@/lib/admin/users-list";
import { AuthError } from "@/lib/auth/session";

export default async function AdminUserDeskPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const t = await getTranslations("admin.adminUsersPage");
  let desk;
  try {
    desk = await loadAdminUserDesk(userId);
  } catch (error) {
    const denial = adminUsersListAccessDenial(error);
    if (denial === "UNAUTHENTICATED") redirect("/sign-in");
    if (denial === "FORBIDDEN") redirect("/admin");
    if (error instanceof AuthError) throw error;
    throw error;
  }
  if (!desk) notFound();
  const { user } = desk;

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8">
        <Link href="/admin/users" className="text-sm text-[var(--brd-green)] hover:underline">
          {t("wrocDoListy")}
        </Link>
        <header className="mt-4 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold">{user.displayName?.trim() || t("uzytkownik")}</h1>
          <p className="text-sm text-[var(--brd-ink-soft)]">
            {user.email ?? "—"} · #{user.userNumber ?? "—"} · {user.role} · {user.premiumTier}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <AdminUsersManageDialog
              userId={user.id}
              displayName={user.displayName}
              email={user.email}
              userNumber={user.userNumber}
              role={user.role}
              premiumTier={user.premiumTier}
              premiumExpiresAt={user.premiumExpiresAt}
              isSelf={desk.isSelf}
            />
            <AdminUsersDeleteDialog
              userId={user.id}
              displayName={user.displayName}
              email={user.email}
              userNumber={user.userNumber}
              isSelf={desk.isSelf}
            />
          </div>
        </header>

        <DeskList
          title={t("projekty")}
          note={t("projektyPodglad")}
          empty={t("brakProjektow")}
          rows={desk.projects.map((row) => ({
            id: row.id,
            title: row.title || row.id.slice(0, 8),
            meta: [row.status ?? "—", day(row.updatedAt)].filter(Boolean).join(" · "),
          }))}
        />
        <DeskList
          title={t("bityOsoby")}
          note={t("bityGdzie")}
          empty={t("brakBitowOsoby")}
          rows={desk.beats.map((row) => ({
            id: row.id,
            href: beatDeskHref(row),
            title: row.title || row.id.slice(0, 8),
            meta: `${row.status ?? "—"} · ${row.ownershipType ?? ""}`,
          }))}
        />
        <DeskList title={t("nagraniaOsoby")} empty={t("brakNagranOsoby")} rows={desk.takes.map((row) => ({
          id: row.id,
          title: row.title || row.id.slice(0, 8),
          meta: [row.status ?? "—", day(row.createdAt)].filter(Boolean).join(" · "),
        }))} />
        <DeskList title={t("eksportyOsoby")} empty={t("brakEksportow")} rows={desk.exports.map((row) => ({
          id: row.id,
          title: row.kind || row.id.slice(0, 8),
          meta: [row.status ?? "—", day(row.createdAt)].filter(Boolean).join(" · "),
        }))} />
      </PageFrame>
    </main>
  );
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Moderation only loads USER beats in review or approved. Published beats open in the catalogue. */
function beatDeskHref(row: {
  id: string;
  status: string | null;
  ownershipType: string | null;
}): string | undefined {
  if (row.ownershipType === "PLATFORM") return `/admin/beats/${row.id}`;
  if (row.ownershipType === "USER" && (row.status === "PENDING_REVIEW" || row.status === "APPROVED")) {
    return `/admin/moderation/${row.id}`;
  }
  if (row.status === "PUBLISHED") return `/beat/${row.id}`;
  return undefined;
}

function DeskList({
  title,
  note,
  empty,
  rows,
}: {
  title: string;
  note?: string;
  empty: string;
  rows: { id: string; title: string; meta: string; href?: string }[];
}) {
  return (
    <section className="mt-8">
      <SectionLabel className="mb-3">{title}</SectionLabel>
      {note ? <p className="mb-3 max-w-[62ch] text-sm text-[var(--brd-mute)]">{note}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              {row.href ? (
                <Link href={row.href} className="font-medium hover:text-[var(--brd-green)]">{row.title}</Link>
              ) : (
                <span className="font-medium">{row.title}</span>
              )}
              <span className="text-[var(--brd-mute)]">{row.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
