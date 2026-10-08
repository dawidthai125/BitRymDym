import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { StudioEditor } from "@/components/studio/studio-editor";
import { AppShell } from "@/components/site/app-shell";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getStudioProjectDocument } from "@/lib/studio/studio-service";

export const metadata = {
  title: "Projekt Studio · BitRymDym",
};

type PageProps = { params: Promise<{ projectId: string }> };

export default async function StudioProjectPage({ params }: PageProps) {
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
      <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4">
        <PageFrame
          width="full"
          className="flex min-h-[calc(100dvh-4.5rem)] flex-col gap-2 py-2 sm:py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/studio"
              className="min-h-11 text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
            >
              ← Wszystkie projekty
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
