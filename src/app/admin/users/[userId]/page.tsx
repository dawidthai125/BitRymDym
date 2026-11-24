import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { notFound, redirect } from "next/navigation";

import { AdminPublicProfile } from "@/components/admin/admin-public-profile";
import { AdminUserDeskTabs } from "@/components/admin/admin-user-desk-tabs";
import { AdminUserLimits } from "@/components/admin/admin-user-limits";
import { AdminUsersAddonDialog } from "@/components/admin/admin-users-addon-dialog";
import { AdminUsersDeleteDialog } from "@/components/admin/admin-users-delete-dialog";
import { AdminUsersManageDialog } from "@/components/admin/admin-users-manage-dialog";
import { PageFrame } from "@/components/brand/chrome";
import { loadAdminUserDesk } from "@/lib/admin/user-desk";
import { adminUsersListAccessDenial } from "@/lib/admin/users-list";
import { loadAdminCreatorProfile } from "@/lib/creators/creator-profile-server";
import { AuthError } from "@/lib/auth/session";
import { labelCreatorRank, labelPremiumPlan, labelSystemRole } from "@/lib/ui/labels";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.userDesk");
  return { title: t("metaTitle") };
}

export default async function AdminUserDeskPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const t = await getTranslations("admin.adminUsersPage");
  const td = await getTranslations("admin.userDesk");
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
  const publicProfile = await loadAdminCreatorProfile(user.id);
  const name = user.displayName?.trim() || t("uzytkownik");
  const expires = user.premiumExpiresAt
    ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "Europe/Warsaw" }).format(new Date(user.premiumExpiresAt))
    : null;

  const stats = [
    { label: td("zakladka.projects"), value: desk.projects.length },
    { label: td("zakladka.takes"), value: desk.takes.filter((x) => !x.deleted).length },
    { label: td("zakladka.songs"), value: desk.songs.length },
    { label: td("zakladka.beats"), value: desk.beats.length },
    { label: td("zakladka.jobs"), value: desk.exports.length },
    { label: td("zakladka.payments"), value: desk.payments.length },
  ];

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="space-y-6 py-8">
        <Link href="/admin/users" className="inline-flex min-h-10 items-center text-sm text-[var(--brd-amber)] hover:underline">
          {t("wrocDoListy")}
        </Link>

        {/* Identity + actions */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-[var(--brd-line)] p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--brd-amber)] text-2xl font-bold text-[var(--brd-on-media)]"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="brd-display truncate text-3xl font-semibold">{name}</h1>
              <p className="truncate text-sm text-[var(--brd-ink-soft)]">
                {user.email ?? "—"} · #{user.userNumber ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge strong>{labelPremiumPlan(user.premiumTier, user.premiumPrize)}</Badge>
                <Badge>{expires ? td("doKiedy", { kiedy: expires }) : td("bezterminowo")}</Badge>
                <Badge>{labelSystemRole(user.role)}</Badge>
                <Badge>{labelCreatorRank(user.rank)}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <AdminUsersAddonDialog
              userId={user.id}
              displayName={user.displayName}
              premiumTier={user.premiumTier}
              status={desk.referenceAddon}
            />
            <AdminUsersDeleteDialog
              userId={user.id}
              displayName={user.displayName}
              email={user.email}
              userNumber={user.userNumber}
              isSelf={desk.isSelf}
            />
            <Link
              href={`/admin/users?auditUser=${user.userNumber ?? ""}#historia`}
              className="inline-flex min-h-10 items-center rounded-md border border-[var(--brd-line)] px-3 text-sm hover:border-[var(--brd-amber)]"
            >
              {td("historiaZmian")}
            </Link>
          </div>
        </header>

        {/* Counts */}
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--brd-line)] bg-[var(--brd-line)] sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <li key={s.label} className="bg-[var(--brd-paper)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.06em] text-[var(--brd-ink-soft)]">{s.label}</p>
              <p className="mt-1 font-mono text-2xl tabular-nums">{s.value}</p>
            </li>
          ))}
        </ul>

        {publicProfile ? <AdminPublicProfile userId={user.id} profile={publicProfile} /> : null}

        <AdminUserLimits userId={user.id} limits={desk.limits} />

        <AdminUserDeskTabs
          desk={{
            projects: desk.projects,
            takes: desk.takes,
            songs: desk.songs,
            beats: desk.beats,
            exports: desk.exports,
            payments: desk.payments,
          }}
        />
        <p className="text-xs text-[var(--brd-ink-soft)]">{td("limitWierszy")}</p>
      </PageFrame>
    </main>
  );
}

function Badge({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={
        strong
          ? "rounded-full border border-[var(--brd-amber)] px-2.5 py-0.5 font-semibold text-[var(--brd-amber)]"
          : "rounded-full border border-[var(--brd-line)] px-2.5 py-0.5 text-[var(--brd-ink-soft)]"
      }
    >
      {children}
    </span>
  );
}
