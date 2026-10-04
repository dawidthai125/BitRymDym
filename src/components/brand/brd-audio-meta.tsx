import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BrdAudioMetaProps = {
  bpm?: number | string | null;
  keyLabel?: string | null;
  genre?: string | null;
  mood?: string | null;
  className?: string;
};

/**
 * BRD Audio Language — mono metadata rail.
 * BPM · KEY · GENRE · MOOD
 */
export function BrdAudioMeta({
  bpm,
  keyLabel,
  genre,
  mood,
  className,
}: BrdAudioMetaProps) {
  const parts: ReactNode[] = [];

  if (bpm != null && bpm !== "") {
    parts.push(
      <span key="bpm" className="brd-meta text-[var(--brd-ink-soft)]">
        {bpm} BPM
      </span>,
    );
  }
  if (keyLabel) {
    parts.push(
      <span key="key" className="brd-meta">
        {keyLabel}
      </span>,
    );
  }
  if (genre) {
    parts.push(
      <span key="genre" className="truncate">
        {genre}
      </span>,
    );
  }
  if (mood) {
    parts.push(
      <span key="mood" className="truncate">
        {mood}
      </span>,
    );
  }

  if (parts.length === 0) return null;

  return (
    <p
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-0 truncate text-[11px] leading-relaxed text-[var(--brd-mute)]",
        className,
      )}
    >
      {parts.map((part, i) => (
        <span key={i} className="inline-flex min-w-0 items-center">
          {i > 0 ? (
            <span className="mx-1.5 text-[var(--brd-audio-line)]" aria-hidden>
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </p>
  );
}

type BrdAudioTimeProps = {
  current: number;
  total: number;
  format: (seconds: number) => string;
  className?: string;
};

/**
 * BRD Audio Language — mono time.
 */
export function BrdAudioTime({
  current,
  total,
  format,
  className,
}: BrdAudioTimeProps) {
  return (
    <span
      className={cn(
        "brd-meta shrink-0 text-[10px] tabular-nums text-[var(--brd-mute)]",
        className,
      )}
    >
      {format(current)} / {format(total)}
    </span>
  );
}

type BrdAudioStateProps = {
  state: "idle" | "playing" | "paused" | "loading" | "error" | "recording";
  className?: string;
};

export function BrdAudioStateLabel({ state, className }: BrdAudioStateProps) {
  const label =
    state === "playing"
      ? "Odtwarzanie"
      : state === "paused"
        ? "Pauza"
        : state === "loading"
          ? "Ładowanie"
          : state === "error"
            ? "Błąd"
            : state === "recording"
              ? "Rec"
              : null;

  if (!label) return null;

  return (
    <span
      className={cn(
        "brd-meta text-[9px] uppercase tracking-[0.14em]",
        state === "recording"
          ? "text-[var(--brd-audio-rec)]"
          : state === "error"
            ? "text-[var(--brd-danger)]"
            : "text-[var(--brd-mute)]",
        className,
      )}
    >
      {label}
    </span>
  );
}
