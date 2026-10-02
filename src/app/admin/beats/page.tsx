import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatDurationSeconds } from "@/lib/beats/public";
import { listPlatformBeatsForAdmin } from "@/lib/beats/service";
import { cn } from "@/lib/utils";

export default async function AdminBeatsListPage() {
  const beats = await listPlatformBeatsForAdmin();

  return (
    <main className="mx-auto flex w-full max-w-[var(--brd-max-ops)] flex-col gap-8 px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--brd-line)] pb-6">
        <div className="space-y-2">
          <p className="brd-meta text-[11px] uppercase tracking-[0.2em] text-[var(--brd-mute)]">
            Panel Administracyjny
          </p>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            Bity
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Twórz, uzupełniaj dane, wgrywaj audio i publikuj.
          </p>
        </div>
        <Link href="/admin/beats/new" className={cn(buttonVariants())}>
          Nowy bit
        </Link>
      </header>

      {beats.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">Brak bitów platformy.</p>
      ) : (
        <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
          {beats.map((beat) => (
            <li key={beat.id}>
              <Link
                href={`/admin/beats/${beat.id}`}
                className="flex flex-col gap-2 py-4 outline-none transition-colors hover:bg-[var(--brd-paper-deep)]/40 focus-visible:bg-[var(--brd-paper-deep)]/40 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium tracking-tight">
                    {beat.title}
                  </p>
                  <p className="text-xs text-[var(--brd-mute)]">
                    {beat.status === "PUBLISHED"
                      ? "Opublikowany"
                      : beat.status === "DRAFT"
                        ? "Szkic"
                        : beat.status}{" "}
                    · audio{" "}
                    {beat.activeMasterReady ? "gotowe" : "brak"}
                  </p>
                </div>
                <dl className="flex flex-wrap gap-x-4 text-xs text-[var(--brd-mute)] tabular-nums">
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
