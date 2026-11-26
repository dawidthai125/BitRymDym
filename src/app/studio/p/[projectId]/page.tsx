import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { PageFrame } from "@/components/brand/chrome";
import { StudioEditor } from "@/components/studio/studio-editor";
import { StudioTakeExpiryBanner } from "@/components/studio/studio-take-expiry-banner";
import { StudioUnplacedTakeBanner } from "@/components/studio/studio-unplaced-take-banner";
import { AppShell } from "@/components/site/app-shell";
import { maxRecordingTracksForTier } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prewarmListenCopy } from "@/lib/beats/listen-copy/listen-copy-server";
import { getStudioProjectDocument } from "@/lib/studio/studio-service";
import { loadStudioBeatDurationMs, loadStudioBeatTitle } from "@/lib/studio/studio-beat-title";
import { loadStudioTakeExpiryNotice } from "@/lib/studio/studio-take-expiry-server";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("studio.studioPPage");
  return {
  title: t("metaTitle"),
};
}

type PageProps = { params: Promise<{ projectId: string }> };

export default async function StudioProjectPage({ params }: PageProps) {
  const t = await getTranslations("studio.studioPPage");
  const { projectId } = await params;
  let auth;
  try {
    auth = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext(`/studio/p/${encodeURIComponent(projectId)}`));
    }
    redirect("/studio");
  }

  let document;
  try {
    document = await getStudioProjectDocument(projectId);
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/studio?notice=project-missing");
    }
    throw error;
  }

  // Personal marked copy of the project's beat: start rendering now so the transport does not wait for it.
  const projectBeatId = document.project.beatId;
  if (projectBeatId) {
    const warmFor = auth.userId;
    after(() => prewarmListenCopy({ beatId: projectBeatId, userId: warmFor }));
  }

  const [product, beatTitle, beatDurationMs, takeExpiry] = await Promise.all([
    resolveProductEntitlementForAuthContext(auth),
    loadStudioBeatTitle(document.project.beatId),
    loadStudioBeatDurationMs(document.project.beatId),
    loadStudioTakeExpiryNotice(auth.userId, document.clips),
  ]);

  return (
    <AppShell tone="studio" compactFooter>
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] overflow-x-clip pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4"
      >
        <PageFrame
          width="full"
          className="flex min-h-[calc(100dvh-4.5rem)] flex-col gap-2 overflow-x-clip py-2 sm:py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/studio"
              className="-my-1 inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] sm:min-h-8 underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("wszystkieProjekty")}
            </Link>
          </div>
          <StudioTakeExpiryBanner notice={takeExpiry} />
          <StudioUnplacedTakeBanner
            projectId={document.project.id}
            documentVersion={document.project.documentVersion}
            trackIds={document.tracks.filter((tr) => tr.trackType !== "BEAT").map((tr) => tr.id)}
            placedTakeIds={document.clips.map((c) => c.sourceTakeId).filter((id): id is string => !!id)}
          />
          <StudioEditor
            initialDocument={document}
            initialBeatTitle={beatTitle}
            initialBeatDurationMs={beatDurationMs}
            trackCapacity={{
              maxTracks: maxRecordingTracksForTier(product.premiumTier),
              premiumTier: product.premiumTier,
            }}
          />
        </PageFrame>
      </main>
    </AppShell>
  );
}
