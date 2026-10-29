import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { UserUploadBeatForm } from "@/components/beats/user-upload-beat-form";
import { SiteHeader } from "@/components/site/site-header";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getOwnUserBeat } from "@/lib/beats/service";
import { canUserEditBeatStatus } from "@/lib/beats/status-labels";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ beatId?: string }>;
};

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("beats.beatsUploadPage");
  return {
  title: t("metaTitle"),
  description: t("metaDescription"),
};
}

export default async function BeatsUploadPage({ searchParams }: PageProps) {
  const t = await getTranslations("beats.beatsUploadPage");
  // Community upload is USER-role only (see createUserBeat / audio-transport).
  // Authenticated non-USER (e.g. ADMIN) must not land on a silent /account bounce
  // when hitting this route via bookmark or stale link — send ADMIN to PLATFORM create.
  //
  // Auth resolution stays in try/catch. Role redirects MUST run outside it:
  // Next.js redirect() throws NEXT_REDIRECT, which a catch would swallow into /account.
  let context;
  try {
    context = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  if (context.profile.role !== "USER") {
    if (context.profile.role === "ADMIN") {
      redirect("/admin/beats/new");
    }
    redirect("/account");
  }

  const { beatId } = await searchParams;
  let existing:
    | {
        id: string;
        title: string;
        producer: string | null;
        activeMasterReady: boolean;
      }
    | undefined;

  if (beatId) {
    try {
      const beat = await getOwnUserBeat(beatId);
      if (!canUserEditBeatStatus(beat.status)) {
        redirect("/account/beats");
      }
      existing = {
        id: beat.id,
        title: beat.title,
        producer: beat.producer,
        activeMasterReady: beat.activeMasterReady,
      };
    } catch {
      redirect("/account/beats");
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12",
          MAIN_CONTENT_LANDMARK_CLASS,
        )}
      >
        <header className="space-y-2">
          <Link
            href="/account/beats"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("mojeBity")}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {existing ? t("edytujBit") : t("dodajBit")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("wgrajAudioSprawdzBpm")}
          </p>
        </header>

        <UserUploadBeatForm
          existingBeatId={existing?.id}
          initialTitle={existing?.title}
          initialProducer={existing?.producer}
          masterAlreadyReady={existing?.activeMasterReady}
        />
      </main>
    </div>
  );
}
