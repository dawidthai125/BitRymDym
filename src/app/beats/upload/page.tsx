import Link from "next/link";
import { redirect } from "next/navigation";

import { UserUploadBeatForm } from "@/components/beats/user-upload-beat-form";
import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireRole, requireUser } from "@/lib/auth/session";
import { getOwnUserBeat } from "@/lib/beats/service";
import { canUserEditBeatStatus } from "@/lib/beats/status-labels";

type PageProps = {
  searchParams: Promise<{ beatId?: string }>;
};

export const metadata = {
  title: "Dodaj bit · BitRymDym",
  description: "Prześlij własny bit do moderacji",
};

export default async function BeatsUploadPage({ searchParams }: PageProps) {
  try {
    await requireUser();
    await requireRole(["USER"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
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
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <Link
            href="/account/beats"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Moje bity
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {existing ? "Edytuj bit" : "Dodaj bit"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Wgraj audio, sprawdź BPM i czas, zapisz szkic, potem wyślij do
            moderacji. Publikacja jest tylko po decyzji moderatora (Wave 4).
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
