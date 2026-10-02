"use client";

import Link from "next/link";

import { BeatArtwork } from "@/components/brand/beat-artwork";
import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { BrdAudioMeta } from "@/components/brand/brd-audio-meta";
import { Waveform } from "@/components/brand/waveform";
import { usePlayer } from "@/components/player/player-provider";
import type { PresentedBeat } from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

type BeatCatalogRowProps = {
  beat: PresentedBeat;
  featured?: boolean;
  className?: string;
};

/**
 * Marketplace BeatRow — Catalog Audio (BRD Audio Language).
 * Layout from Fala 3.1; Fala 3.5 swaps shared audio controls only.
 */
export function BeatCatalogRow({
  beat,
  featured = false,
  className,
}: BeatCatalogRowProps) {
  const { track, phase, currentTime, duration, playTrack, toggle, seek } =
    usePlayer();
  const isCurrent = track?.beatId === beat.id;
  const playing = isCurrent && phase === "playing";
  const loading = isCurrent && phase === "loading";
  const total = duration > 0 && isCurrent ? duration : beat.durationSeconds;
  const progress =
    isCurrent && total > 0 ? Math.min(1, currentTime / total) : featured ? 0.1 : 0.06;

  async function onPlay(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrent) {
      toggle();
      return;
    }
    await playTrack({
      beatId: beat.id,
      title: beat.title,
      producer: beat.producer,
      durationSeconds: beat.durationSeconds,
      artworkVariant: beat.artworkVariant,
    });
  }

  function onFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <li
      className={cn(
        "border-b border-[var(--brd-audio-line)] transition-colors",
        featured && "border-t border-t-[var(--brd-audio-line)]",
        isCurrent &&
          "bg-[color-mix(in_srgb,var(--brd-green-mist)_38%,transparent)]",
        !isCurrent &&
          "hover:bg-[color-mix(in_srgb,var(--brd-paper-deep)_32%,transparent)]",
        className,
      )}
    >
      {/* Desktop / tablet */}
      <div
        className={cn(
          "hidden items-center gap-3 md:grid md:grid-cols-[auto_minmax(10.5rem,1.15fr)_minmax(0,0.95fr)_auto] md:gap-4 lg:gap-5",
          featured ? "py-3" : "py-2.5",
        )}
      >
        <BeatArtwork
          variant={beat.artworkVariant}
          title={beat.title}
          size="sm"
          className={cn(
            featured ? "!size-[4.75rem]" : "!size-[4.25rem]",
            isCurrent && "ring-1 ring-[var(--brd-green)]",
          )}
        />

        <Link href={`/beat/${beat.id}`} className="min-w-0 space-y-0.5">
          {featured ? (
            <p className="brd-meta text-[9px] uppercase tracking-[0.16em] text-[var(--brd-green)]">
              Polecane
            </p>
          ) : null}
          <h2
            className={cn(
              "brd-display truncate font-semibold tracking-tight text-[var(--brd-ink)]",
              featured
                ? "text-[1.125rem] leading-snug"
                : "text-base leading-snug",
            )}
          >
            {beat.title}
          </h2>
          <p className="truncate text-[13px] text-[var(--brd-ink-soft)]">
            {beat.producer}
          </p>
          <BrdAudioMeta
            bpm={beat.bpm}
            keyLabel={beat.key}
            genre={beat.genre}
            mood={beat.mood}
          />
        </Link>

        <div className="min-w-0 self-center">
          <Waveform
            seed={beat.id}
            progress={progress}
            density="catalog"
            bars={featured ? 52 : 44}
            heightClassName={featured ? "h-8" : "h-7"}
            showPlayhead={isCurrent}
            interactive={isCurrent}
            onSeekRatio={
              isCurrent ? (ratio) => seek(ratio * total) : undefined
            }
            aria-label={`Przebieg: ${beat.title}`}
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onFavorite}
            className="inline-flex size-11 items-center justify-center text-[var(--brd-mute)] transition-colors hover:text-[var(--brd-ink)]"
            aria-label="Dodaj do ulubionych (wkrótce)"
            title="Ulubione — wkrótce"
          >
            ♡
          </button>
          <BrdAudioPlayButton
            playing={playing}
            loading={loading}
            title={beat.title}
            onClick={onPlay}
          />
        </div>
      </div>

      {/* Mobile */}
      <div className="space-y-2 py-2.5 md:hidden">
        <div className="flex items-center gap-3">
          <BeatArtwork
            variant={beat.artworkVariant}
            title={beat.title}
            size="sm"
            className={cn(
              featured ? "!size-[4.25rem]" : "!size-14",
              isCurrent && "ring-1 ring-[var(--brd-green)]",
            )}
          />
          <Link href={`/beat/${beat.id}`} className="min-w-0 flex-1 space-y-0.5">
            {featured ? (
              <p className="brd-meta text-[9px] uppercase tracking-[0.14em] text-[var(--brd-green)]">
                Polecane
              </p>
            ) : null}
            <h2 className="brd-display truncate text-[15px] font-semibold leading-snug">
              {beat.title}
            </h2>
            <p className="truncate text-[13px] text-[var(--brd-ink-soft)]">
              {beat.producer}
            </p>
            <BrdAudioMeta
              bpm={beat.bpm}
              keyLabel={beat.key}
              genre={beat.genre}
            />
          </Link>
          <BrdAudioPlayButton
            playing={playing}
            loading={loading}
            title={beat.title}
            onClick={onPlay}
          />
        </div>
        <div
          className={cn(
            "flex items-center gap-2",
            featured
              ? "pl-[calc(4.25rem+0.75rem)]"
              : "pl-[calc(3.5rem+0.75rem)]",
          )}
        >
          <div className="min-w-0 flex-1">
            <Waveform
              seed={beat.id}
              progress={progress}
              density="catalog"
              bars={36}
              heightClassName="h-6"
              showPlayhead={isCurrent}
              interactive={isCurrent}
              onSeekRatio={
                isCurrent ? (ratio) => seek(ratio * total) : undefined
              }
              aria-label={`Przebieg: ${beat.title}`}
            />
          </div>
          <button
            type="button"
            onClick={onFavorite}
            className="inline-flex size-11 shrink-0 items-center justify-center text-[var(--brd-mute)]"
            aria-label="Dodaj do ulubionych (wkrótce)"
            title="Ulubione — wkrótce"
          >
            ♡
          </button>
        </div>
      </div>
    </li>
  );
}
