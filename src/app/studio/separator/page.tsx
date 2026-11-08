import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { StudioSeparatorPanel } from "@/components/studio/studio-separator-panel";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listStudioProjects } from "@/lib/studio/studio-service";

export const metadata = { title: "Rozetnij bit" };

export default async function StudioSeparatorPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext("/studio/separator"));
    }
    redirect("/account");
  }

  const projects = await listStudioProjects();

  return (
    <AppShell tone="studio">
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">Rozetnij bit</h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              Dzieli bit na wokal, bębny, bas i resztę. Trwa to chwilę u nas.
              Samo kliknięcie jeszcze nie daje plików.
            </p>
          </header>
          <StudioSeparatorPanel
            projects={projects.map((project) => ({ id: project.id, title: project.title }))}
          />
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
