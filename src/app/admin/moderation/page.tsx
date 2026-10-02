import Link from "next/link";

import {
  listApprovedForModeration,
  listPendingReviewForModeration,
} from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";

export const metadata = {
  title: "Moderacja bitów · Admin",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function QueueSection({
  title,
  empty,
  items,
  actionLabel,
}: {
  title: string;
  empty: string;
  items: Awaited<ReturnType<typeof listPendingReviewForModeration>>;
  actionLabel: string;
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
                <p className="font-medium tracking-tight">{beat.title}</p>
                <p className="text-sm text-muted-foreground">
                  {beat.producer ?? "—"} · owner{" "}
                  <span className="font-mono text-xs">
                    {beat.ownerId?.slice(0, 8)}…
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
  const [pending, approved] = await Promise.all([
    listPendingReviewForModeration(),
    listApprovedForModeration(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Moderacja bitów
        </h1>
        <p className="text-sm text-muted-foreground">
          W moderacji → zatwierdź lub odrzuć. Zaakceptowane → opublikuj do
          katalogu publicznego.
        </p>
      </header>

      <QueueSection
        title="W moderacji"
        empty="Brak bitów oczekujących na moderację."
        items={pending}
        actionLabel="Odtwórz / decyzja"
      />

      <QueueSection
        title="Zaakceptowane"
        empty="Brak zaakceptowanych bitów do publikacji."
        items={approved}
        actionLabel="Opublikuj"
      />
    </main>
  );
}
