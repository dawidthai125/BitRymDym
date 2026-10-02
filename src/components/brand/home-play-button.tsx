"use client";

import { usePlayer } from "@/components/player/player-provider";
import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import type { PresentedBeat } from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

/**
 * Home play control — thin wrapper over BrdAudioPlayButton.
 * Home layout remains DESIGN FROZEN; only audio control swap.
 */
export function HomePlayButton({
  beat,
  compact,
}: {
  beat: PresentedBeat;
  compact?: boolean;
}) {
  const { track, phase, playTrack, toggle } = usePlayer();
  const isCurrent = track?.beatId === beat.id;
  const playing = isCurrent && phase === "playing";
  const loading = isCurrent && phase === "loading";

  return (
    <BrdAudioPlayButton
      playing={playing}
      loading={loading}
      size={compact ? "sm" : "md"}
      title={beat.title}
      className={cn(!compact && "min-w-12")}
      onClick={() => {
        if (isCurrent) toggle();
        else
          void playTrack({
            beatId: beat.id,
            title: beat.title,
            producer: beat.producer,
            durationSeconds: beat.durationSeconds,
            artworkVariant: beat.artworkVariant,
          });
      }}
    />
  );
}
