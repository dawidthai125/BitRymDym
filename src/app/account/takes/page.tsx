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
      <main
        data-brd-surface="control-room"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <SectionLabel className="text-[var(--brd-amber)]">
              Archiwum sesji
            </SectionLabel>
            <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Moje nagrania
            </h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              Podgląd, pobieranie, usuwanie — tylko to, co już nagrałeś.
            </p>
          </header>

          <OwnTakesList items={takes} />

          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/studio"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              ← Studio
            </Link>
            <Link
              href="/account"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              Konto
            </Link>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
