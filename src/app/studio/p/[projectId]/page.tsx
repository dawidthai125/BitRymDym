import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { StudioEditor } from "@/components/studio/studio-editor";
import { AppShell } from "@/components/site/app-shell";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getStudioProjectDocument } from "@/lib/studio/studio-service";

export const metadata = {
  title: "Projekt Studio · BitRymDym",
};

type PageProps = { params: Promise<{ projectId: string }> };

export default async function StudioProjectPage({ params }: PageProps) {
  try {
    await requireUser();
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

  return (
    <AppShell tone="studio">
      <main className="pb-16">
        <PageFrame className="flex flex-col gap-6 py-8 sm:py-10">
          <StudioEditor initialDocument={document} />
          <Link
            href="/studio"
            className="text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            ← Wszystkie projekty
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
