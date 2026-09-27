import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnTakesList } from "@/components/takes/own-takes-list";
import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listOwnTakes } from "@/lib/takes/list-own-takes";

export const metadata = {
  title: "Moje próbki · BitRymDym",
};

export default async function AccountTakesPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const takes = await listOwnTakes();

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Moje próbki</h1>
          <p className="text-sm text-muted-foreground">
            Twoje nagrania — podgląd, pobieranie i usuwanie. Bez publikacji i
            bez katalogu publicznego.
          </p>
        </header>

        <OwnTakesList items={takes} />

        <Link
          href="/account"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Konto
        </Link>
      </main>
    </div>
  );
}
