"use client";

import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { usePlayerOptional } from "@/components/player/player-provider";
import { artworkVariantForId } from "@/lib/ui/demo-beats";

/** Preview of a catalogue beat through the shared site player. */
export function AdminBeatPlayButton({
  beatId,
  title,
  producer,
  durationSeconds,
  disabled,
}: {
  beatId: string;
  title: string;
  producer: string;
  durationSeconds: number;
  disabled?: boolean;
}) {
  const player = usePlayerOptional();
  const isCurrent = player?.track?.beatId === beatId;
  const playing = isCurrent && player?.phase === "playing";
  const loading = isCurrent && player?.phase === "loading";

  return (
    <BrdAudioPlayButton
      playing={Boolean(playing)}
      loading={Boolean(loading)}
      disabled={disabled || !player}
      title={title}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        if (!player) return;
        if (isCurrent) {
          player.toggle();
          return;
        }
        void player.playTrack({
          beatId,
          title,
          producer,
          durationSeconds,
          artworkVariant: artworkVariantForId(beatId),
        });
      }}
    />
  );
}
