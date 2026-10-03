import Link from "next/link";
import { notFound } from "next/navigation";

import { ModerationDecisionControls } from "@/components/beats/moderation-decision-controls";
import { PlaybackShell } from "@/components/player/playback-shell";
import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { loadAdminProfileIdentities } from "@/lib/auth/user-number";
import { getStaffCommunityBeatForModeration } from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminModerationDetailPage({ params }: PageProps) {
  const { id } = await params;

  let beat;
  try {
    beat = await getStaffCommunityBeatForModeration(id);
  } catch (error) {
    if (error instanceof AuthError) {
      notFound();
    }
    throw error;
  }

  const isApproved = beat.status === "APPROVED";
  const context = await getCurrentProfile();
  const isAdmin = context?.profile.role === "ADMIN";
  let ownerLabel = beat.ownerId ? `${beat.ownerId.slice(0, 8)}…` : "—";
  if (isAdmin && beat.ownerId) {
    const identities = await loadAdminProfileIdentities([beat.ownerId]);
    const identity = identities.get(beat.ownerId);
    if (identity) {
      ownerLabel = formatProfileWithUserNumber(
        identity.displayName,
        identity.userNumber,
      );
    }
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
          {beat.activeMasterReady ? " · audio gotowe" : " · brak audio"}
        </p>
        <p className="text-xs text-muted-foreground">
          Owner{" "}
          <span className={isAdmin ? undefined : "font-mono"}>{ownerLabel}</span>
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
            Brak gotowego audio —{" "}
            {isApproved ? "nie publikuj." : "nie zatwierdzaj."}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">
          {isApproved ? "Publikacja" : "Decyzja"}
        </h2>
        {!isApproved ? (
          <p className="text-sm text-muted-foreground">
            Zatwierdzenie ustawia status Zaakceptowany. Opublikowanie jest
            osobnym krokiem.
          </p>
        ) : null}
        <ModerationDecisionControls
          beatId={beat.id}
          status={beat.status}
          activeMasterReady={beat.activeMasterReady}
        />
      </section>
    </main>
  );
}
