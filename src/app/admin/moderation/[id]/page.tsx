import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AutoCheckCard } from "@/components/beats/auto-check-card";
import { AutoCheckOverrideControls } from "@/components/beats/auto-check-override-controls";
import { ModerationDecisionControls } from "@/components/beats/moderation-decision-controls";
import { PlaybackShell } from "@/components/player/playback-shell";
import { checkAccess } from "@/lib/auth/access-denial";
import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { loadAdminProfileIdentities } from "@/lib/auth/user-number";
import { loadLatestAutoChecks } from "@/lib/beats/auto-check/records";
import {
  getStaffCommunityBeatForModeration,
  requireModerationAccess,
} from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";
import { labelBeatOwnership } from "@/lib/ui/labels";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminModerationDetailPage({ params }: PageProps) {
  const { id } = await params;

  // The loader also throws FORBIDDEN for content reasons (not a USER beat, not
  // in a moderation status), so the viewer denial comes from the guard alone.
  const denial = await checkAccess(requireModerationAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") return null;

  let beat;
  try {
    beat = await getStaffCommunityBeatForModeration(id);
  } catch (error) {
    // Hide beats that are missing or outside the moderation queue.
    if (
      error instanceof AuthError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
    ) {
      notFound();
    }
    throw error;
  }

  const isApproved = beat.status === "APPROVED";
  const isAutoRejected = beat.status === "REJECTED";
  const autoCheck = (await loadLatestAutoChecks([beat.id])).get(beat.id) ?? null;
  const context = await getCurrentProfile();
  const isAdmin = context?.profile.role === "ADMIN";
  let ownerLabel = beat.ownerId ? `${beat.ownerId.slice(0, 8)}…` : "—";
  if (isAdmin && beat.ownerId) {
    try {
      const identities = await loadAdminProfileIdentities([beat.ownerId]);
      const identity = identities.get(beat.ownerId);
      if (identity) {
        ownerLabel = formatProfileWithUserNumber(
          identity.displayName,
          identity.userNumber,
        );
      }
    } catch (error) {
      // Role lost since the guard: keep the masked id instead of failing the page.
      if (!(error instanceof AuthError && error.code === "FORBIDDEN")) {
        throw error;
      }
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
          {beatStatusLabelPl(beat.status)} · {labelBeatOwnership("USER")} ·{" "}
          {beat.producer ?? "bez producenta"} · {beat.bpm} BPM ·{" "}
          {beat.durationSeconds}s
          {beat.activeMasterReady ? " · audio gotowe" : " · brak audio"}
        </p>
        <p className="text-xs text-muted-foreground">
          Właściciel{" "}
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
        <h2 className="text-lg font-medium tracking-tight">Automatyczne sprawdzenie</h2>
        <AutoCheckCard check={autoCheck} />
        {beat.status === "PENDING_REVIEW" && (!autoCheck || autoCheck.status === "error") ? (
          <AutoCheckOverrideControls beatId={beat.id} mode="retry" />
        ) : null}
      </section>

      {isAutoRejected ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium tracking-tight">Uchylenie odrzucenia</h2>
          <AutoCheckOverrideControls beatId={beat.id} mode="override" />
        </section>
      ) : (
      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">
          {isApproved ? "Publikacja" : "Decyzja"}
        </h2>
        {!isApproved ? (
          <p className="text-sm text-muted-foreground">
            Zatwierdzenie ustawia status Zatwierdzone. Opublikowanie jest
            osobnym krokiem.
          </p>
        ) : null}
        <ModerationDecisionControls
          beatId={beat.id}
          status={beat.status}
          activeMasterReady={beat.activeMasterReady}
          openReviews={beat.openRightsReviews ?? []}
        />
      </section>
      )}
    </main>
  );
}
