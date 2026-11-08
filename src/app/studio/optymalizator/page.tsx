import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { StudioOptimizerPanel } from "@/components/studio/studio-optimizer-panel";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listStudioProjects } from "@/lib/studio/studio-service";

export const metadata = { title: "Optymalizator bitu" };

export default async function StudioBeatOptimizerPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext("/studio/optymalizator"));
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
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">Optymalizator bitu</h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              Mierzy szczyt, RMS i jasność zatwierdzonego mastera albo bitu. Nie zmienia pliku.
            </p>
          </header>
          <StudioOptimizerPanel projects={(await listStudioProjects()).map((project) => ({ id: project.id, title: project.title }))} />
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/studio"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline"
            >
              Studio
            </Link>
            <Link
              href="/studio/separator"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline"
            >
              Separator
            </Link>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
