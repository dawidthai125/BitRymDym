import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { StudioEditor } from "@/components/studio/studio-editor";
import { AppShell } from "@/components/site/app-shell";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getStudioProjectDocument } from "@/lib/studio/studio-service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("studio.studioPPage");
  return {
  title: t("metaTitle"),
};
}

type PageProps = { params: Promise<{ projectId: string }> };

export default async function StudioProjectPage({ params }: PageProps) {
  const t = await getTranslations("studio.studioPPage");
  let auth;
  try {
    auth = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/studio");
  }

  const { projectId } = await params;
  let document;
  try {
    document = await getStudioProjectDocument(projectId);
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/studio");
    }
    throw error;
  }

  const product = await resolveProductEntitlementForAuthContext(auth);

  return (
    <AppShell tone="studio">
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4"
      >
        <PageFrame
          width="full"
          className="flex min-h-[calc(100dvh-4.5rem)] flex-col gap-2 overflow-x-hidden py-2 sm:py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/studio"
              className="min-h-11 text-sm text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("wszystkieProjekty")}
            </Link>
          </div>
          <StudioEditor
            initialDocument={document}
            trackCapacity={{
              maxTracks: product.limits.studioMaxTracks,
              premiumTier: product.premiumTier,
            }}
          />
        </PageFrame>
      </main>
    </AppShell>
  );
}
