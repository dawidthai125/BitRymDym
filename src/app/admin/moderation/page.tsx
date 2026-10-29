import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusPill } from "@/components/brand/chrome";
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
import { beatStatusLabelPl, beatStatusTone } from "@/lib/beats/status-labels";

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
    <section className="space-y-3" aria-labelledby={`queue-${title}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--brd-line)] pb-2">
        <h2 id={`queue-${title}`} className="text-lg font-medium tracking-tight">
          {title}
        </h2>
        <span className="brd-data text-sm text-[var(--brd-mute)]" aria-label={`Liczba pozycji: ${items.length}`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="brd-data-table w-full table-fixed text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-[34%]">Bit</th>
              <th scope="col" className="w-[18%]">Właściciel</th>
              <th scope="col" className="w-[7%] text-right">Czas</th>
              <th scope="col" className="w-[6%] text-right">BPM</th>
              <th scope="col" className="w-[8%]">Audio</th>
              <th scope="col" className="w-[13%]">Zaktualizowano</th>
              <th scope="col"><span className="sr-only">Akcja</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((beat) => (
              <tr key={beat.id}>
                <td data-label="Bit">
                  <span className="block font-medium tracking-tight text-[var(--brd-ink)]">
                    {beat.title}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusPill tone={beatStatusTone(beat.status)}>
                      {beatStatusLabelPl(beat.status)}
                    </StatusPill>
                    <AutoCheckBadge check={checks.get(beat.id)} />
                  </span>
                  {beat.producer ? (
                    <span className="mt-1 block text-xs text-muted-foreground">{beat.producer}</span>
                  ) : null}
                </td>
                <td data-label="Właściciel" className={isAdmin ? undefined : "brd-data text-xs"}>
                  {ownerLabel(beat.ownerId, identities, isAdmin)}
                </td>
                <td data-label="Czas" className="brd-data text-right">
                  {formatDuration(beat.durationSeconds)}
                </td>
                <td data-label="BPM" className="brd-data text-right">
                  {beat.bpm}
                </td>
                <td data-label="Audio">
                  {beat.activeMasterReady ? "gotowe" : (
                    <span className="text-[var(--brd-warn)]">brak</span>
                  )}
                </td>
                <td data-label="Zaktualizowano" className="brd-data text-xs text-muted-foreground">
                  {new Date(beat.updatedAt).toLocaleString("pl-PL")}
                </td>
                <td className="text-right">
                  <Link
                    href={`/admin/moderation/${beat.id}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    {actionLabel}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 sm:px-6">
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
