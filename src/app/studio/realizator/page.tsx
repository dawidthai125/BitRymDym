import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { StudioEngineerForm } from "@/components/studio/studio-engineer-form";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";

export const metadata = { title: "Napisz do realizatora" };

export default async function StudioEngineerPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext("/studio/realizator"));
    }
    redirect("/account");
  }

  return (
    <AppShell tone="studio">
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">Napisz do realizatora</h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              Piszesz do żywego człowieka. Nikt tu nie odpowiada z automatu.
            </p>
          </header>
          <StudioEngineerForm />
          <Link
            href="/studio"
            className="text-sm text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline"
          >
            Studio
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
