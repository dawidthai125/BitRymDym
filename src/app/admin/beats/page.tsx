import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatDurationSeconds } from "@/lib/beats/public";
import { listPlatformBeatsForAdmin } from "@/lib/beats/service";
import { cn } from "@/lib/utils";

export default async function AdminBeatsListPage() {
  const beats = await listPlatformBeatsForAdmin();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Phase 1.7 · PLATFORM ops
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Bity PLATFORM</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Minimalna lista operacyjna — create, metadata, audio MASTER, publish.
          </p>
        </div>
        <Link href="/admin/beats/new" className={cn(buttonVariants())}>
          Nowy beat
        </Link>
      </header>

      {beats.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak bitów PLATFORM.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {beats.map((beat) => (
            <li key={beat.id}>
              <Link
                href={`/admin/beats/${beat.id}`}
                className="flex flex-col gap-2 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium tracking-tight">
                    {beat.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {beat.status} · audio{" "}
                    {beat.activeMasterReady ? "READY" : "brak READY"}
                  </p>
                </div>
                <dl className="flex flex-wrap gap-x-4 text-xs text-muted-foreground tabular-nums">
                  <div>
                    <dt className="sr-only">BPM</dt>
                    <dd>{beat.bpm} BPM</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Czas</dt>
                    <dd>{formatDurationSeconds(beat.durationSeconds)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
