import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { SiteHeader } from "@/components/site/site-header";
import { AdminClientMessages } from "@/i18n/client-messages";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { cn } from "@/lib/utils";
import { AuthError, requireRole } from "@/lib/auth/session";
import { canAccessAdminNav, canAccessModerationNav } from "@/lib/auth/permissions";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminLayout");
  return {
  title: t("metaTitle"),
  description: t("metaDescription"),
};
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("admin.adminLayout");
  let context: Awaited<ReturnType<typeof requireRole>>;
  try {
    // Single chrome gate: nested ADMIN-only layouts narrow further; profile is React cache()'d.
    context = await requireRole(["ADMIN", "MODERATOR"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    return (
      <AdminClientMessages>
      <div className="min-h-dvh">
        <SiteHeader tone="admin" />
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className={cn(
            "mx-auto max-w-3xl px-6 py-16",
            MAIN_CONTENT_LANDMARK_CLASS,
          )}
        >
          <h1 className="brd-display text-2xl font-semibold tracking-tight">
            {t("brakDostepu")}
          </h1>
          <p className="mt-2 text-sm text-[var(--brd-mute)]">
            {t("panelAdministracyjnyJestDostepny")}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm underline underline-offset-4"
          >
            {t("stronaGlowna")}
          </Link>
        </main>
      </div>
      </AdminClientMessages>
    );
  }

  const role = context.profile.role;
  const showPlatform = canAccessAdminNav(role);
  const showModeration = canAccessModerationNav(role);

  const navItems: { href: string; label: string; exact?: boolean }[] = [];
  if (showPlatform) {
    navItems.push(
      { href: "/admin", label: t("pulpit"), exact: true },
      { href: "/admin/beats", label: t("bity"), exact: true },
    );
  }
  if (showModeration) {
    navItems.push(
      { href: "/admin/moderation", label: t("moderacja") },
      { href: "/admin/samples", label: t("sample") },
    );
  }
  if (showPlatform) {
    navItems.push(
      { href: "/admin/users", label: t("uzytkownicy") },
      { href: "/admin/platnosci", label: t("platnosci") },
      { href: "/admin/sample-policy", label: t("politykaNagran") },
      { href: "/admin/site", label: t("trybPrac") },
      { href: "/admin/beats/new", label: t("nowyBit") },
      { href: "/admin/beats/generate", label: t("generator") },
      { href: "/admin/beats/waiting", label: t("oczekujace") },
    );
  }
  navItems.push({ href: "/beats", label: t("katalog") });

  return (
    <AdminClientMessages>
    <div className="brd-ops min-h-dvh">
      <SiteHeader tone="admin" />
      <div className="mx-auto w-full max-w-[var(--brd-max-ops)] px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] py-3">
        <AdminSectionNav items={navItems} label={t("panelAdministracyjny")} />
      </div>
      {/*
        Skip target is a div: admin pages already render their own main landmark.
        Nesting another main landmark would be invalid HTML.
      */}
      <div
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={MAIN_CONTENT_LANDMARK_CLASS}
      >
        {children}
      </div>
    </div>
    </AdminClientMessages>
  );
}
