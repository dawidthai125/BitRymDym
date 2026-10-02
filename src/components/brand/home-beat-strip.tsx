"use client";

import Link from "next/link";

import { BeatArtwork } from "@/components/brand/beat-artwork";
import { HomePlayButton } from "@/components/brand/home-play-button";
import { Waveform } from "@/components/brand/waveform";
import { usePlayer } from "@/components/player/player-provider";
import type { PresentedBeat } from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

/**
 * Beat marketplace preview — dense catalog rhythm, not file list.
 */
export function HomeBeatStrip({ beats }: { beats: PresentedBeat[] }) {
  if (beats.length === 0) {
    return (
      <p className="text-sm text-[var(--brd-mute)]">
        Jeszcze nie ma opublikowanych bitów.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
      {beats.map((beat, index) => (
        <HomeBeatRow key={beat.id} beat={beat} featured={index === 0} />
      ))}
    </ul>
  );
}

function HomeBeatRow({
  beat,
  featured,
}: {
  beat: PresentedBeat;
  featured?: boolean;
}) {
  const { track, phase } = usePlayer();
  const playing = track?.beatId === beat.id && phase === "playing";

  return (
    <li
      className={cn(
        featured && "bg-[color-mix(in_srgb,var(--brd-green-mist)_55%,transparent)]",
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[auto_minmax(0,1.05fr)_minmax(0,1.15fr)_auto] sm:gap-4",
          featured ? "py-3.5 sm:py-4" : "py-2.5 sm:py-3",
        )}
      >
        <BeatArtwork
          variant={beat.artworkVariant}
          title={beat.title}
          size="sm"
          className={cn(
            featured
              ? "size-[4.75rem] sm:size-[5.5rem]"
              : "size-[3.75rem] sm:size-[4.35rem]",
          )}
        />

        <Link href={`/beat/${beat.id}`} className="min-w-0 space-y-0.5">
          {featured ? (
            <p className="brd-meta text-[9px] uppercase tracking-[0.14em] text-[var(--brd-green)]">
              Polecane
            </p>
          ) : null}
          <p
            className={cn(
              "brd-display truncate font-semibold leading-tight text-[var(--brd-ink)]",
              featured ? "text-lg sm:text-xl" : "text-base sm:text-lg",
            )}
          >
            {beat.title}
          </p>
          <p className="truncate text-sm text-[var(--brd-ink-soft)]">
            {beat.producer}
          </p>
          <p className="brd-meta truncate text-[10px] text-[var(--brd-mute)]">
            <span className="text-[var(--brd-ink-soft)]">{beat.bpm} BPM</span>
            {" · "}
            {beat.key}
            {" · "}
            {beat.genre}
            {" · "}
            {beat.mood}
          </p>
        </Link>

        <div className="hidden min-w-0 sm:block">
          <Waveform
            seed={beat.id}
            progress={playing ? 0.48 : featured ? 0.28 : 0.16}
            bars={featured ? 64 : 48}
            heightClassName={featured ? "h-10" : "h-7"}
          />
        </div>

        <HomePlayButton beat={beat} compact />
      </div>

      <div
        className={cn(
          "sm:hidden",
          featured ? "px-[calc(4.75rem+0.75rem)] pb-3" : "px-[calc(3.75rem+0.75rem)] pb-2.5",
        )}
      >
        <Waveform
          seed={beat.id}
          progress={playing ? 0.48 : featured ? 0.28 : 0.16}
          bars={featured ? 44 : 34}
          heightClassName={featured ? "h-7" : "h-5"}
        />
      </div>
    </li>
  );
}
