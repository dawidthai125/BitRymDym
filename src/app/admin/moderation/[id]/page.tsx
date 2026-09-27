import Link from "next/link";
import { notFound } from "next/navigation";

import { ModerationDecisionControls } from "@/components/beats/moderation-decision-controls";
import { PlaybackShell } from "@/components/player/playback-shell";
import { AuthError } from "@/lib/auth/session";
import { getPendingReviewBeatForModeration } from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminModerationDetailPage({ params }: PageProps) {
  const { id } = await params;

  let beat;
  try {
    beat = await getPendingReviewBeatForModeration(id);
  } catch (error) {
    if (error instanceof AuthError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16">
      <header className="space-y-2">
        <Link
          href="/admin/moderation"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Moderacja bitów
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {beat.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {beatStatusLabelPl(beat.status)} · USER ·{" "}
          {beat.producer ?? "bez producenta"} · {beat.bpm} BPM ·{" "}
          {beat.durationSeconds}s
          {beat.activeMasterReady ? " · MASTER READY" : " · MASTER BRAK"}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">Odtwórz</h2>
        {beat.activeMasterReady ? (
          <PlaybackShell
            beatId={beat.id}
            title={beat.title}
            durationSeconds={beat.durationSeconds}
          />
        ) : (
          <p className="text-sm text-destructive">
            Brak aktywnego MASTER READY — nie zatwierdzaj.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">Decyzja</h2>
        <p className="text-sm text-muted-foreground">
          Zatwierdzenie ustawia status Zaakceptowany. Publikacja (katalog
          publiczny) jest poza Wave 3.
        </p>
        <ModerationDecisionControls beatId={beat.id} />
      </section>
    </main>
  );
}
