"use client";

import { BrdAudioDeck } from "@/components/player/brd-audio-deck";

/**
 * Share-link player. Branded deck, no native bar, no download.
 * Anything a browser can play can still be recorded — this only removes the easy button.
 */
export function ListenPlayer({ src, label }: { src: string; label: string }) {
  return <BrdAudioDeck src={src} title={label} testId="listen-player" />;
}
