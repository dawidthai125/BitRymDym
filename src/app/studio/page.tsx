import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { StudioProjectList } from "@/components/studio/studio-project-list";
import { AppShell } from "@/components/site/app-shell";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listStudioProjects } from "@/lib/studio/studio-service";

export const metadata = {
  title: "Studio · BitRymDym",
};

type PageProps = {
  searchParams?: Promise<{ beatId?: string }>;
};

/** OD-P5-03 — Studio hub = project list (Quick Record remains on beat detail). */
export default async function StudioProjectsPage({ searchParams }: PageProps) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const projects = await listStudioProjects();
  const params = searchParams ? await searchParams : {};
  const seedBeatId =
    typeof params.beatId === "string" && params.beatId.length > 0
      ? params.beatId
      : null;

  return (
    <AppShell tone="studio">
      <main className="pb-16">
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <SectionLabel>Studio</SectionLabel>
            <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Twoje projekty
            </h1>
            <p className="text-sm text-[var(--brd-ink-soft)]">
              Otwórz projekt, wróć do edycji albo usuń stare projekty testowe.
              Szybkie nagranie nadal znajdziesz na stronie bitu.
            </p>
          </header>

          <StudioProjectList
            initialProjects={projects}
            seedBeatId={seedBeatId}
          />

          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/account/takes"
              className="text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
            >
              Moje nagrania
            </Link>
            <Link
              href="/account"
              className="text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
            >
              ← Konto
            </Link>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
