import Link from "next/link";
import { redirect } from "next/navigation";

import { AutoCheckBadge } from "@/components/beats/auto-check-card";
import { checkAccess } from "@/lib/auth/access-denial";
import { getCurrentProfile } from "@/lib/auth/session";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { loadAdminProfileIdentities } from "@/lib/auth/user-number";
import { loadLatestAutoChecks, type AutoCheckRow } from "@/lib/beats/auto-check/records";
import {
  listApprovedForModeration,
  listAutoRejectedForModeration,
  listPendingReviewForModeration,
  requireModerationAccess,
} from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";

export const metadata = {
  title: "Moderacja bitów · Administrator",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ownerLabel(
  ownerId: string | null,
  identities: Map<string, { displayName: string | null; userNumber: number | null }>,
  isAdmin: boolean,
): string {
  if (!ownerId) return "—";
  if (!isAdmin) {
    return `${ownerId.slice(0, 8)}…`;
  }
  const identity = identities.get(ownerId);
  if (!identity) {
    return `${ownerId.slice(0, 8)}…`;
  }
  return formatProfileWithUserNumber(identity.displayName, identity.userNumber);
}

function QueueSection({
  title,
  empty,
  items,
  actionLabel,
  identities,
  isAdmin,
  checks,
}: {
  title: string;
  empty: string;
  items: Awaited<ReturnType<typeof listPendingReviewForModeration>>;
  actionLabel: string;
  identities: Map<string, { displayName: string | null; userNumber: number | null }>;
  isAdmin: boolean;
  checks: Map<string, AutoCheckRow>;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((beat) => (
            <li
              key={beat.id}
              className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium tracking-tight">{beat.title}</p>
                  <AutoCheckBadge check={checks.get(beat.id)} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {beat.producer ?? "—"} · owner{" "}
                  <span className={isAdmin ? undefined : "font-mono text-xs"}>
                    {ownerLabel(beat.ownerId, identities, isAdmin)}
                  </span>
                  {" · "}
                  {formatDuration(beat.durationSeconds)} · {beat.bpm} BPM
                  {" · "}
                  {beatStatusLabelPl(beat.status)}
                  {beat.activeMasterReady ? " · audio gotowe" : " · brak audio"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Zaktualizowano {new Date(beat.updatedAt).toLocaleString("pl-PL")}
                </p>
              </div>
              <Link
                href={`/admin/moderation/${beat.id}`}
                className="text-sm font-medium underline underline-offset-4"
              >
                {actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminModerationQueuePage() {
  // The /admin layout renders the same denial (identical role set) but does not
  // stop this page from rendering, so the page must not throw it.
  const denial = await checkAccess(requireModerationAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") return null;

  const [pending, approved, autoRejected, context] = await Promise.all([
    listPendingReviewForModeration(),
    listApprovedForModeration(),
    listAutoRejectedForModeration(),
    getCurrentProfile(),
  ]);

  const isAdmin = context?.profile.role === "ADMIN";
  const checks = await loadLatestAutoChecks(
    [...pending, ...approved, ...autoRejected].map((b) => b.id),
  );
  const ownerIds = [...pending, ...approved, ...autoRejected]
    .map((b) => b.ownerId)
    .filter((id): id is string => Boolean(id));
  const identities = isAdmin
    ? await loadAdminProfileIdentities(ownerIds)
    : new Map();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Moderacja bitów
        </h1>
        <p className="text-sm text-muted-foreground">
          W moderacji → zatwierdź lub odrzuć. Zatwierdzone → opublikuj do
          katalogu publicznego.
        </p>
      </header>

      <QueueSection
        title="W moderacji"
        empty="Brak bitów oczekujących na moderację."
        items={pending}
        actionLabel="Odtwórz / decyzja"
        identities={identities}
        isAdmin={Boolean(isAdmin)}
        checks={checks}
      />

      <QueueSection
        title="Zatwierdzone"
        empty="Brak zatwierdzonych bitów do publikacji."
        items={approved}
        actionLabel="Opublikuj"
        identities={identities}
        isAdmin={Boolean(isAdmin)}
        checks={checks}
      />

      <QueueSection
        title="Odrzucone przez filtr"
        empty="Brak automatycznie odrzuconych bitów."
        items={autoRejected}
        actionLabel="Szczegóły / uchyl"
        identities={identities}
        isAdmin={Boolean(isAdmin)}
        checks={checks}
      />
    </main>
  );
}
