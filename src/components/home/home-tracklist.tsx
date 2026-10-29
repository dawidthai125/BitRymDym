"use client";


import { useTranslations } from "next-intl";

import Link from "next/link";

import { HomePlayButton } from "@/components/brand/home-play-button";
import { Waveform } from "@/components/brand/waveform";
import { usePlayer } from "@/components/player/player-provider";
import { formatDurationSeconds } from "@/lib/beats/public";
import { playbackProgressRatio } from "@/lib/player/playback-progress";
import type { PresentedBeat } from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

/** Catalog preview as a side-A tracklist (A1, A2 … = real list order). */
export function HomeTracklist({ beats }: { beats: PresentedBeat[] }) {
  const t = useTranslations("home.homeTracklist");
  if (beats.length === 0) {
    return (
      <p className="border-y border-tape-line py-6 text-tape-cream-soft">
        {t("jeszczeNieMaOpublikowanych")}
      </p>
    );
  }
  return (
    <ol className="border-t border-tape-line">
      {beats.map((beat, i) => (
        <TrackRow key={beat.id} beat={beat} index={i} />
      ))}
    </ol>
  );
}

function TrackRow({ beat, index }: { beat: PresentedBeat; index: number }) {
  const t = useTranslations("home.homeTracklist");
  const { track, currentTime, duration, seek, activateTrack, phase } =
    usePlayer();
  const isCurrent = track?.beatId === beat.id;
  const total = duration > 0 && isCurrent ? duration : beat.durationSeconds;
  const progress = playbackProgressRatio(currentTime, total, isCurrent);

  async function onSeekRatio(ratio: number) {
    const max = total > 0 ? total : beat.durationSeconds;
    if (!(max > 0)) return;
    if (!isCurrent) {
      await activateTrack(
        {
          beatId: beat.id,
          title: beat.title,
          producer: beat.producer,
          durationSeconds: beat.durationSeconds,
          artworkVariant: beat.artworkVariant,
        },
        { autoplay: false },
      );
    }
    seek(ratio * max);
  }

  const meta = [beat.bpm > 0 ? t("bpm", { v0: beat.bpm }) : null, beat.key, beat.genre]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn(
        "group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-tape-line py-3 transition-colors duration-[var(--tape-dur-base)] hover:bg-tape-deck sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_auto] sm:gap-x-5 sm:py-4",
        isCurrent && "bg-tape-deck",
      )}
    >
      <span
        className={cn(
          "font-poster text-2xl font-extrabold tabular-nums sm:text-3xl",
          isCurrent && phase === "playing" ? "text-tape-neon" : "text-tape-mute",
        )}
      >
        A{index + 1}
      </span>
      <Link
        href={`/beat/${beat.id}`}
        className="tape-focus min-w-0 underline-offset-4 hover:underline"
      >
        <span className="block truncate font-poster text-xl font-bold uppercase leading-none tracking-[0.02em] text-tape-cream sm:text-2xl">
          {beat.title}
        </span>
        <span className="mt-1 block truncate text-sm text-tape-cream-soft">
          {beat.producer}
          {meta ? (
            <span className="font-mono text-xs text-tape-mute"> · {meta}</span>
          ) : null}
        </span>
      </Link>
      <div className="col-span-3 col-start-2 row-start-2 mt-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0">
        <Waveform
          seed={beat.id}
          progress={progress}
          density="catalog"
          bars={56}
          heightClassName="h-6 sm:h-8"
          showPlayhead={isCurrent}
          interactive
          onSeekRatio={(r) => void onSeekRatio(r)}
          aria-label={t("przebieg", { v0: beat.title })}
        />
      </div>
      <span className="hidden text-right font-mono text-sm tabular-nums text-tape-cream-soft sm:block">
        {beat.durationSeconds > 0
          ? formatDurationSeconds(beat.durationSeconds)
          : "—"}
      </span>
      <HomePlayButton beat={beat} compact />
    </li>
  );
}
