import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { cn } from "@/lib/utils";
import { AuthError, requireRole } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/auth/session";
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
  try {
    await requireRole(["ADMIN", "MODERATOR"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    return (
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
    );
  }

  const context = await getCurrentProfile();
  const role = context?.profile.role;
  const showPlatform = canAccessAdminNav(role);
  const showModeration = canAccessModerationNav(role);

  return (
    <div className="brd-ops min-h-dvh">
      <SiteHeader tone="admin" />
      <div className="mx-auto w-full max-w-[var(--brd-max-ops)] px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] py-3">
        <nav
          className="flex flex-wrap gap-1 overflow-x-auto text-sm text-[var(--brd-ink-soft)]"
          aria-label={t("panelAdministracyjny")}
        >
          {showPlatform ? (
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              {t("pulpit")}
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/beats"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              {t("bity")}
            </Link>
          ) : null}
          {showModeration ? (
            <Link
              href="/admin/moderation"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              {t("moderacja")}
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/users"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              {t("uzytkownicy")}
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/sample-policy"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              {t("politykaNagran")}
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/beats/new"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              {t("nowyBit")}
            </Link>
          ) : null}
          <Link
            href="/beats"
            className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
          >
            {t("katalog")}
          </Link>
        </nav>
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
  );
}
