import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireRole } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/auth/session";
import { canAccessAdminNav, canAccessModerationNav } from "@/lib/auth/permissions";

export const metadata = {
  title: "Admin · BitRymDym",
  description: "Staff panel",
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
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Brak dostępu</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Panel staff jest dostępny dla ról ADMIN i MODERATOR.
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
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_95)_0%,_var(--background)_55%)]">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl px-6 py-4">
        <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {showModeration ? (
            <Link
              href="/admin/moderation"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Moderacja bitów
            </Link>
          ) : null}
          {showPlatform ? (
            <>
              <Link
                href="/admin/beats"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                PLATFORM beats
              </Link>
              <Link
                href="/admin/beats/new"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Nowy beat
              </Link>
            </>
          ) : null}
          <Link
            href="/beats"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Publiczny katalog
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
