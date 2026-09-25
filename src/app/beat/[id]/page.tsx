import Link from "next/link";
import { notFound } from "next/navigation";

import { PlaybackShell } from "@/components/player/playback-shell";
import { SiteHeader } from "@/components/site/site-header";
import {
  formatDurationSeconds,
  toPublicBeatDetail,
} from "@/lib/beats/public";
import { getPublishedBeat } from "@/lib/beats/service";
import { getBeatAudioPublicInfo } from "@/lib/beats/audio-service";

type BeatDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: BeatDetailPageProps) {
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) {
    return { title: "Bit niedostępny" };
  }
  return {
    title: beat.title,
    description: beat.description ?? `Odsłuch: ${beat.title}`,
  };
}

export default async function BeatDetailPage({ params }: BeatDetailPageProps) {
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) {
    notFound();
  }

  const detail = toPublicBeatDetail(beat);
  const audioInfo = await getBeatAudioPublicInfo(beat.id);

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_95)_0%,_var(--background)_55%)]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <Link
          href="/beats"
          className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Wszystkie bity
        </Link>

        <header className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              PUBLISHED
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {detail.title}
            </h1>
            {detail.producer ? (
              <p className="text-base text-muted-foreground">{detail.producer}</p>
            ) : null}
          </div>

          {detail.coverRef ? (
            <p className="text-xs text-muted-foreground">
              Okładka: {detail.coverRef}
            </p>
          ) : null}

          {detail.description ? (
            <p className="max-w-prose text-sm leading-relaxed text-foreground/90 text-pretty">
              {detail.description}
            </p>
          ) : null}

          <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <div>
              <dt className="sr-only">BPM</dt>
              <dd>{detail.bpm} BPM</dd>
            </div>
            {(detail.key || detail.scale) && (
              <div>
                <dt className="sr-only">Tonacja</dt>
                <dd>{[detail.key, detail.scale].filter(Boolean).join(" ")}</dd>
              </div>
            )}
            {(detail.genre || detail.style) && (
              <div>
                <dt className="sr-only">Styl</dt>
                <dd>
                  {[detail.genre, detail.style].filter(Boolean).join(" · ")}
                </dd>
              </div>
            )}
            <div>
              <dt className="sr-only">Czas</dt>
              <dd>{formatDurationSeconds(detail.durationSeconds)}</dd>
            </div>
          </dl>
        </header>

        {audioInfo.hasAudio ? (
          <PlaybackShell
            beatId={detail.id}
            title={detail.title}
            durationSeconds={detail.durationSeconds}
          />
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Ten bit nie ma jeszcze dostępnego audio do odsłuchu.
          </p>
        )}
      </main>
    </div>
  );
}
