import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { OwnTakesList } from "@/components/takes/own-takes-list";
import { AppShell } from "@/components/site/app-shell";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listOwnTakes } from "@/lib/takes/list-own-takes";

export const metadata = {
  title: "Moje nagrania · BitRymDym",
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
    <AppShell tone="studio">
      <main className="pb-16">
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <SectionLabel>Biblioteka</SectionLabel>
            <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Moje nagrania
            </h1>
            <p className="text-sm text-[var(--brd-ink-soft)]">
              Twoje próby — podgląd, pobieranie i usuwanie.
            </p>
          </header>

          <OwnTakesList items={takes} />

          <Link
            href="/account"
            className="text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            ← Wróć do studia
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
