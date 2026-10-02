"use client";

import { cn } from "@/lib/utils";

type BrdAudioPlayButtonProps = {
  playing: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** sm = 44px (catalog/mobile) · md = 48px (detail) */
  size?: "sm" | "md";
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Track title used in aria-label when provided */
  title?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * BRD Audio Language — square PLAY / PAUSE.
 * No circle, no pill, no glow. Logic stays in PlayerProvider / parent.
 */
export function BrdAudioPlayButton({
  playing,
  loading = false,
  disabled = false,
  size = "sm",
  onClick,
  title,
  className,
  "aria-label": ariaLabel,
}: BrdAudioPlayButtonProps) {
  const label =
    ariaLabel ??
    (playing
      ? title
        ? `Pauza: ${title}`
        : "Pauza"
      : title
        ? `Odtwórz: ${title}`
        : "Odtwórz");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      aria-pressed={playing}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-[var(--brd-paper)] transition-colors",
        "bg-[var(--brd-audio-play)] hover:bg-[var(--brd-audio-play-hover)]",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "md" ? "size-12" : "size-11",
        playing && "bg-[var(--brd-audio-play-hover)]",
        className,
      )}
    >
      {loading ? "…" : playing ? "❚❚" : "▶"}
    </button>
  );
}
