import Link from "next/link";

import { listPendingReviewForModeration } from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";

export const metadata = {
  title: "Moderacja bitów · Admin",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function AdminModerationQueuePage() {
  const queue = await listPendingReviewForModeration();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Moderacja bitów
        </h1>
        <p className="text-sm text-muted-foreground">
          Kolejka PENDING_REVIEW. Zatwierdzenie nie publikuje beatu (Wave 4).
        </p>
      </header>

      {queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Brak bitów oczekujących na moderację.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {queue.map((beat) => (
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
                  {beat.activeMasterReady ? " · MASTER READY" : " · MASTER BRAK"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Zaktualizowano {new Date(beat.updatedAt).toLocaleString("pl-PL")}
                </p>
              </div>
              <Link
                href={`/admin/moderation/${beat.id}`}
                className="text-sm font-medium underline underline-offset-4"
              >
                Odtwórz / decyzja
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
