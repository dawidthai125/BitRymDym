"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { clampPlaybackGain, nextBrdPlaybackRate } from "@/lib/player/playback-tools";
import { cn } from "@/lib/utils";

type BrdPlaybackToolsProps = {
  volume: number;
  muted: boolean;
  loop: boolean;
  rate: number;
  disabled?: boolean;
  onVolume: (volume: number) => void;
  onMuted: (muted: boolean) => void;
  onLoop: (loop: boolean) => void;
  onRate: (rate: number) => void;
  className?: string;
  children?: ReactNode;
};

/**
 * Shared listen controls: level, mute, loop, speed.
 * No download. Used by the catalog rail, the beat shell, and direct-source decks.
 */
export function BrdPlaybackTools({
  volume,
  muted,
  loop,
  rate,
  disabled = false,
  onVolume,
  onMuted,
  onLoop,
  onRate,
  className,
  children,
}: BrdPlaybackToolsProps) {
  const t = useTranslations("common.playbackTools");
  const rateLabel = Number.isInteger(rate) ? `${rate}` : rate.toFixed(2).replace(/0$/, "");

  return (
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={muted}
        aria-label={muted ? t("wlacz") : t("wycisz")}
        onClick={() => onMuted(!muted)}
        className="inline-flex min-h-11 items-center border border-[var(--brd-audio-line)] px-3 text-sm text-[var(--brd-ink-soft)] outline-none hover:border-[var(--brd-ink)] hover:text-[var(--brd-ink)] focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] disabled:opacity-45"
      >
        {muted ? t("wlacz") : t("wycisz")}
      </button>
      <label className="flex min-w-[7.5rem] max-w-[12rem] flex-1 flex-col gap-1 text-[var(--brd-mute)]">
        <span className="brd-meta text-[10px] uppercase tracking-[0.14em]">{t("glosnosc")}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          disabled={disabled}
          aria-label={t("glosnosc")}
          onChange={(event) => onVolume(clampPlaybackGain(Number(event.target.value)))}
          className="brd-scrub h-11"
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={loop}
        aria-label={loop ? t("petlaOn") : t("petla")}
        onClick={() => onLoop(!loop)}
        className={cn(
          "inline-flex min-h-11 items-center border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] disabled:opacity-45",
          loop
            ? "border-[var(--brd-green)] text-[var(--brd-ink)]"
            : "border-[var(--brd-audio-line)] text-[var(--brd-ink-soft)] hover:border-[var(--brd-ink)] hover:text-[var(--brd-ink)]",
        )}
      >
        {t("petla")}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label={t("tempo", { rate: rateLabel })}
        onClick={() => onRate(nextBrdPlaybackRate(rate))}
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[var(--brd-audio-line)] px-3 font-mono text-sm text-[var(--brd-ink-soft)] outline-none hover:border-[var(--brd-ink)] hover:text-[var(--brd-ink)] focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] disabled:opacity-45"
      >
        {rateLabel}×
      </button>
      {children}
    </div>
  );
}
