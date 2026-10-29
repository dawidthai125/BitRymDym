import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { StudioProjectList } from "@/components/studio/studio-project-list";
import { AppShell } from "@/components/site/app-shell";
import { maxProjectsForTier } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listStudioProjects } from "@/lib/studio/studio-service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("studio.studioPage");
  return {
  title: t("metaTitle"),
};
}

type PageProps = {
  searchParams?: Promise<{ beatId?: string }>;
};

/** OD-P5-03 — Studio hub = project list (Quick Record remains on beat detail). */
export default async function StudioProjectsPage({ searchParams }: PageProps) {
  const t = await getTranslations("studio.studioPage");
  let auth: Awaited<ReturnType<typeof requireUser>>;
  try {
    auth = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const projects = await listStudioProjects();
  const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
  const params = searchParams ? await searchParams : {};
  const seedBeatId =
    typeof params.beatId === "string" && params.beatId.length > 0
      ? params.beatId
      : null;

  return (
    <AppShell tone="studio">
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">
              {t("twojeProjekty")}
            </h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              {t("nocnaDeskaOtworzProjekt")}
            </p>
          </header>

          <StudioProjectList
            initialProjects={projects}
            seedBeatId={seedBeatId}
            plan={{ tier, maxProjects: maxProjectsForTier(tier) }}
          />

          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/account/takes"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("archiwumNagran")}
            </Link>
            <Link
              href="/account"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("konto")}
            </Link>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
