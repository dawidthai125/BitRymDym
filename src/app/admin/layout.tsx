import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireRole } from "@/lib/auth/session";

export const metadata = {
  title: "Admin · Bity",
  description: "PLATFORM content ops — Phase 1.7",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireRole(["ADMIN"]);
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
            Panel admina jest dostępny wyłącznie dla roli ADMIN.
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

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_95)_0%,_var(--background)_55%)]">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl px-6 py-4">
        <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
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
