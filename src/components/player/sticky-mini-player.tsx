"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BeatArtwork } from "@/components/brand/beat-artwork";
import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { BrdAudioTime } from "@/components/brand/brd-audio-meta";
import { Waveform } from "@/components/brand/waveform";
import { usePlayer } from "@/components/player/player-provider";
import { formatDurationSeconds } from "@/lib/beats/public";
import { playbackProgressRatio } from "@/lib/player/playback-progress";
import { cn } from "@/lib/utils";

/**
 * Sticky mini-player — BRD Audio Rail.
 * Appears after first Play. Hidden while recording suppresses it.
 */
export function StickyMiniPlayer() {
  const {
    track,
    phase,
    currentTime,
    duration,
    error,
    suppressed,
    toggle,
    seek,
    close,
  } = usePlayer();
  const pathname = usePathname();

  if (!track || suppressed || pathname.startsWith("/admin")) {
    return null;
  }

  const total = duration > 0 ? duration : track.durationSeconds;
  const progress = playbackProgressRatio(currentTime, total, true);
  const playing = phase === "playing";
  const loading = phase === "loading";

  return (
    <div
      className={cn(
        "fixed inset-x-0 z-30 border-t border-[var(--brd-audio-line)] bg-[var(--brd-audio-surface)]",
        "bottom-[calc(3.75rem+env(safe-area-inset-bottom))] md:bottom-0",
      )}
      role="region"
      aria-label="Odtwarzacz"
    >
      <div className="mx-auto flex max-w-[var(--brd-max-public)] items-center gap-2.5 px-[max(1rem,env(safe-area-inset-left))] py-2 pr-[max(1rem,env(safe-area-inset-right))] sm:gap-3">
        <BrdAudioPlayButton
          playing={playing}
          loading={loading}
          onClick={() => toggle()}
          title={track.title}
        />

        <BeatArtwork
          variant={track.artworkVariant}
          title={track.title}
          size="xs"
        />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <Link
              href={`/beat/${track.beatId}`}
              className="brd-display min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--brd-ink)] hover:text-[var(--brd-green)]"
            >
              {track.title}
            </Link>
            <p className="hidden truncate text-xs text-[var(--brd-mute)] sm:block">
              {track.producer}
            </p>
          </div>
          <Waveform
            seed={track.beatId}
            progress={progress}
            density="sticky"
            showPlayhead
            interactive
            onSeekRatio={(ratio) => seek(ratio * total)}
            aria-label="Przebieg — przewiń bit"
          />
          <div className="flex items-center justify-between gap-2 sm:hidden">
            <p className="truncate text-[11px] text-[var(--brd-mute)]">
              {track.producer}
            </p>
            <BrdAudioTime
              current={currentTime}
              total={total}
              format={formatDurationSeconds}
            />
          </div>
        </div>

        <BrdAudioTime
          current={currentTime}
          total={total}
          format={formatDurationSeconds}
          className="hidden sm:inline"
        />

        <button
          type="button"
          onClick={close}
          className="inline-flex size-11 shrink-0 items-center justify-center text-[var(--brd-mute)] outline-none hover:text-[var(--brd-ink)] focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)]"
          aria-label="Zamknij odtwarzacz"
        >
          ✕
        </button>
      </div>
      {error ? (
        <p className="px-4 pb-2 text-xs text-[var(--brd-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
