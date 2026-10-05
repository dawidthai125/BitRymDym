import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireRole } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/auth/session";
import { canAccessAdminNav, canAccessModerationNav } from "@/lib/auth/permissions";

export const metadata = {
  title: "Panel Administracyjny · BitRymDym",
  description: "Panel Administracyjny BitRymDym",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireRole(["ADMIN", "MODERATOR"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    return (
      <div className="min-h-dvh">
        <SiteHeader tone="admin" />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="brd-display text-2xl font-semibold tracking-tight">
            Brak dostępu
          </h1>
          <p className="mt-2 text-sm text-[var(--brd-mute)]">
            Panel Administracyjny jest dostępny dla ról administratora i
            moderatora.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm underline underline-offset-4"
          >
            Strona główna
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
          aria-label="Panel Administracyjny"
        >
          {showPlatform ? (
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              Pulpit
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/beats"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              Bity
            </Link>
          ) : null}
          {showModeration ? (
            <Link
              href="/admin/moderation"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              Moderacja
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/users"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              Użytkownicy
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/sample-policy"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              Polityka nagrań
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href="/admin/beats/new"
              className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            >
              Nowy bit
            </Link>
          ) : null}
          <Link
            href="/beats"
            className="inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
          >
            Katalog
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
