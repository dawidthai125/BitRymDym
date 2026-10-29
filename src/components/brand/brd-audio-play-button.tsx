"use client";

import { useTranslations } from "next-intl";

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
 * Design v3: amber transport key with SVG glyphs. No circle, no pill, no glow. Logic stays in PlayerProvider / parent.
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
  const t = useTranslations("common.brdAudioPlayButton");
  const label =
    ariaLabel ??
    (playing
      ? title
        ? t("pauza", { v0: title })
        : "Pauza"
      : title
        ? t("odtworz", { v0: title })
        : t("odtworz2"));

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      aria-pressed={playing}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--tape-r-panel)] text-[var(--tape-on-amber)] shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.22)] transition-colors",
        "bg-[var(--brd-audio-play)] hover:bg-[var(--brd-audio-play-hover)]",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "md" ? "size-12" : "size-11",
        playing && "bg-[var(--brd-audio-play-hover)]",
        className,
      )}
    >
      {loading ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
          <circle cx="3" cy="8" r="1.6" fill="currentColor" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" />
          <circle cx="13" cy="8" r="1.6" fill="currentColor" />
        </svg>
      ) : playing ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
          <path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" fill="currentColor" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-0.5 size-4">
          <path d="M3 1.5v13l11-6.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
