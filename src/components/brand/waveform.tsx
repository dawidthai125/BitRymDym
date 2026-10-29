"use client";

import { useTranslations } from "next-intl";

import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { seekRatioFromClientX } from "@/lib/player/playback-progress";
import { cn } from "@/lib/utils";

/** Deterministic peak heights from a string seed — visual identity, not DSP. */
export function peaksFromSeed(seed: string, count = 64): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const peaks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const n = (h >>> 0) % 1000;
    const envelope =
      0.35 + 0.65 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    peaks.push(Math.max(0.12, Math.min(1, (0.2 + n / 1000) * envelope)));
  }
  return peaks;
}

export type WaveformDensity =
  | "catalog"
  | "detail"
  | "sticky"
  | "studio"
  | "default";

const DENSITY_PRESETS: Record<
  WaveformDensity,
  { bars: number; heightClassName: string }
> = {
  catalog: { bars: 44, heightClassName: "h-7" },
  detail: { bars: 96, heightClassName: "h-16 sm:h-20" },
  sticky: { bars: 40, heightClassName: "h-5" },
  studio: { bars: 72, heightClassName: "h-14 sm:h-16" },
  default: { bars: 72, heightClassName: "h-12" },
};

/**
 * Sticky mini-player seek: visual bars stay h-5 (20px); interactive hit target
 * is min-h-11 (44px). Used when density="sticky" && interactive && no heightClassName.
 *
 * Catalog/home seek: outer hit min-h-11 (44px); inner visual uses heightClassName
 * or preset (h-5–h-10). Used when density="catalog" && interactive (even with heightClassName).
 * Detail / studio densities unchanged.
 */
export const STICKY_SEEK_HIT_CLASS =
  "relative flex min-h-11 w-full select-none items-center";
export const CATALOG_SEEK_HIT_CLASS = STICKY_SEEK_HIT_CLASS;
export const STICKY_SEEK_VISUAL_CLASS = "h-5";

const SEEK_KEYBOARD_STEP = 0.03;

type WaveformProps = {
  seed: string;
  progress?: number;
  bars?: number;
  /** Real peaks override seed-based peaks (live mic / take decode). */
  peaks?: number[];
  className?: string;
  heightClassName?: string;
  interactive?: boolean;
  onSeekRatio?: (ratio: number) => void;
  /** paper | inverted | take (recording lane) */
  tone?: "paper" | "inverted" | "take";
  density?: WaveformDensity;
  showPlayhead?: boolean;
  "aria-label"?: string;
};

/**
 * BitRymDym Waveform v2 — BRD Audio Language.
 * Optional `peaks` for real audio; otherwise peaksFromSeed(seed).
 * Progress is presentation-only; seek never starts playback.
 */
export function Waveform({
  seed,
  progress = 0,
  bars,
  peaks: peaksProp,
  className,
  heightClassName,
  interactive = false,
  onSeekRatio,
  tone = "paper",
  density = "default",
  showPlayhead,
  "aria-label": ariaLabelProp,
}: WaveformProps) {
  const t = useTranslations("common.waveform");
  const ariaLabel = ariaLabelProp ?? t("przebiegAudio");
  const preset = DENSITY_PRESETS[density];
  const barCount = peaksProp?.length || bars || preset.bars;
  const height = heightClassName ?? preset.heightClassName;
  const stickySeekHit =
    density === "sticky" && interactive && !heightClassName;
  const catalogSeekHit = density === "catalog" && interactive;
  const expandedSeekHit = stickySeekHit || catalogSeekHit;
  const catalogVisualHeight = heightClassName ?? preset.heightClassName;
  const peaks =
    peaksProp && peaksProp.length > 0
      ? peaksProp
      : peaksFromSeed(seed, barCount);
  const clamped = Math.max(0, Math.min(1, progress));
  const playheadVisible =
    showPlayhead ?? (interactive || clamped > 0.02);
  const draggingRef = useRef(false);

  /* Prefer solid/rgba for inline backgroundColor — color-mix in CSS vars can
     resolve to transparent in WebKit when set via style={{}}, wiping the BIT rail. */
  const activeColor =
    tone === "inverted"
      ? "var(--brd-audio-wave-inverted-played)"
      : tone === "take"
        ? "var(--brd-graphite-soft)"
        : "var(--brd-audio-wave-played)";
  const idleColor =
    tone === "inverted"
      ? "var(--brd-audio-wave-inverted-rest)"
      : tone === "take"
        ? "var(--brd-audio-wave-take-rest)"
        : "var(--brd-audio-wave-rest)";
  const playheadColor =
    tone === "inverted"
      ? "var(--brd-audio-wave-inverted-playhead)"
      : "var(--brd-audio-playhead)";

  function ratioFromPointer(
    event: ReactPointerEvent<HTMLDivElement>,
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return seekRatioFromClientX(event.clientX, rect.left, rect.width);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || !onSeekRatio) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeekRatio(ratioFromPointer(event));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || !onSeekRatio || !draggingRef.current) return;
    onSeekRatio(ratioFromPointer(event));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || !onSeekRatio || !draggingRef.current) return;
    draggingRef.current = false;
    onSeekRatio(ratioFromPointer(event));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleSeekKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!interactive || !onSeekRatio) return;

    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(1, clamped + SEEK_KEYBOARD_STEP);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, clamped - SEEK_KEYBOARD_STEP);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSeekRatio(next);
  }

  return (
    <div
      className={cn(
        stickySeekHit
          ? STICKY_SEEK_HIT_CLASS
          : catalogSeekHit
            ? CATALOG_SEEK_HIT_CLASS
            : cn("relative w-full select-none", height),
        className,
      )}
      role={interactive ? "slider" : "img"}
      aria-label={ariaLabel}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(clamped * 100) : undefined}
      aria-valuetext={
        interactive ? `${Math.round(clamped * 100)}%` : undefined
      }
      aria-orientation={interactive ? "horizontal" : undefined}
      data-seek-hit={stickySeekHit ? "sticky" : catalogSeekHit ? "catalog" : undefined}
      style={interactive ? { touchAction: "none" } : undefined}
      onPointerDown={interactive && onSeekRatio ? handlePointerDown : undefined}
      onPointerMove={interactive && onSeekRatio ? handlePointerMove : undefined}
      onPointerUp={interactive && onSeekRatio ? handlePointerUp : undefined}
      onPointerCancel={
        interactive && onSeekRatio ? handlePointerCancel : undefined
      }
      onKeyDown={interactive && onSeekRatio ? handleSeekKeyDown : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div
        className={cn(
          "relative flex w-full items-center gap-px",
          stickySeekHit
            ? STICKY_SEEK_VISUAL_CLASS
            : catalogSeekHit
              ? catalogVisualHeight
              : "h-full",
        )}
        aria-hidden={expandedSeekHit ? true : undefined}
      >
        {peaks.map((peak, index) => {
          const ratio = (index + 0.5) / peaks.length;
          const active = ratio <= clamped;
          return (
            <span
              key={`${seed}-${index}`}
              className="block min-w-px flex-1 self-center"
              style={{
                height: `${Math.round(Math.min(1, Math.max(0.08, peak)) * 100)}%`,
                minHeight: 4,
                backgroundColor: active ? activeColor : idleColor,
              }}
            />
          );
        })}
        {playheadVisible && expandedSeekHit ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-[8%] w-px"
            style={{
              left: `${clamped * 100}%`,
              backgroundColor: playheadColor,
              opacity: 0.85,
            }}
          />
        ) : null}
      </div>
      {playheadVisible && !expandedSeekHit ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[8%] w-px"
          style={{
            left: `${clamped * 100}%`,
            backgroundColor: playheadColor,
            opacity: 0.85,
          }}
        />
      ) : null}
    </div>
  );
}
