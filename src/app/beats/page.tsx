import Link from "next/link";

import { SiteHeader } from "@/components/site/site-header";
import {
  formatDurationSeconds,
  toPublicCatalogItem,
} from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";

export const metadata = {
  title: "Bity",
  description: "Publiczny katalog opublikowanych bitów BitRymDym.",
};

export default async function BeatsCatalogPage() {
  const beats = (await listPublishedBeats()).map(toPublicCatalogItem);

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_95)_0%,_var(--background)_55%)]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Phase 1.6 · Published surface
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Bity
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">
            Publiczna lista wyłącznie opublikowanych bitów. Odsłuch bez
            logowania — przez Access Gate (PLAYBACK).
          </p>
        </header>

        {beats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak opublikowanych bitów.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {beats.map((beat) => (
              <li key={beat.id}>
                <Link
                  href={`/beat/${beat.id}`}
                  className="flex flex-col gap-1 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-base font-medium tracking-tight text-foreground">
                      {beat.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[beat.producer, beat.genre, beat.style]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <div>
                      <dt className="sr-only">BPM</dt>
                      <dd>{beat.bpm} BPM</dd>
                    </div>
                    {(beat.key || beat.scale) && (
                      <div>
                        <dt className="sr-only">Tonacja</dt>
                        <dd>
                          {[beat.key, beat.scale].filter(Boolean).join(" ")}
                        </dd>
                      </div>
                    )}
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
    </div>
  );
}
