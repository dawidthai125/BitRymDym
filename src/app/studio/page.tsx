import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { RecorderSessionCard } from "@/components/studio/recorder-session-card";
import { StudioFirstStepsCard } from "@/components/studio/studio-first-steps-card";
import { StudioProjectList } from "@/components/studio/studio-project-list";
import { AppShell } from "@/components/site/app-shell";
import { maxProjectsForTier } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { pathWithKeptQuery, signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";
import { planFirstSteps } from "@/lib/studio/first-steps";
import { listStudioProjects } from "@/lib/studio/studio-service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("studio.studioPage");
  return {
  title: t("metaTitle"),
};
}

type PageProps = {
  searchParams?: Promise<{ beatId?: string; notice?: string }>;
};

/** OD-P5-03 — Studio hub = project list (Quick Record remains on beat detail). */
export default async function StudioProjectsPage({ searchParams }: PageProps) {
  const t = await getTranslations("studio.studioPage");
  const params: { beatId?: string; notice?: string } = searchParams ? await searchParams : {};
  let auth: Awaited<ReturnType<typeof requireUser>>;
  try {
    auth = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      // Keep the chosen beat through sign-in / sign-up (+ e-mail confirmation).
      redirect(signInPathWithNext(pathWithKeptQuery("/studio", params, ["beatId"])));
    }
    redirect("/account");
  }

  const [projects, entitlement] = await Promise.all([
    listStudioProjects(),
    resolveProductEntitlementForAuthContext(auth),
  ]);
  const tier = entitlement.premiumTier;
  const seedBeatId =
    typeof params.beatId === "string" && params.beatId.length > 0
      ? params.beatId
      : null;
  const firstSteps = planFirstSteps(projects);

  return (
    <AppShell tone="studio">
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          {params.notice === "project-missing" ? (
            <p role="alert" data-testid="studio-project-missing" className="border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper)] px-3 py-2 text-sm">
              {t("projektNieZnaleziony")}
            </p>
          ) : null}
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">
              {t("twojeProjekty")}
            </h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              {t("nocnaDeskaOtworzProjekt")}
            </p>
          </header>

          {firstSteps.show ? <StudioFirstStepsCard steps={firstSteps.steps} /> : null}

          <RecorderSessionCard tier={tier} />

          <StudioProjectList
            initialProjects={projects}
            seedBeatId={seedBeatId}
            plan={{ tier, maxProjects: maxProjectsForTier(tier) }}
          />

          <div className="flex flex-wrap gap-x-4 gap-y-0 text-sm">
            <Link
              href="/studio/sample"
              prefetch
              className="inline-flex min-h-10 items-center font-semibold text-[var(--brd-amber)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("pracowniaSampli")}
            </Link>
            <Link
              href="/studio/separator"
              prefetch
              className="inline-flex min-h-10 items-center text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("rozetnijBit")}
            </Link>
            <Link
              href="/studio/optymalizator"
              prefetch
              className="inline-flex min-h-10 items-center text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("sprawdzGlosnosc")}
            </Link>
            <Link
              href="/nagrywarka"
              prefetch
              className="inline-flex min-h-10 items-center text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("programWindows")}
            </Link>
            <Link
              href="/account/takes"
              prefetch
              className="inline-flex min-h-10 items-center text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("archiwumNagran")}
            </Link>
            <Link
              href="/account"
              prefetch
              className="inline-flex min-h-10 items-center text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("konto")}
            </Link>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
