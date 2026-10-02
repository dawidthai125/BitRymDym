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
  "aria-label": ariaLabel = "Przebieg audio",
}: WaveformProps) {
  const preset = DENSITY_PRESETS[density];
  const barCount = peaksProp?.length || bars || preset.bars;
  const height = heightClassName ?? preset.heightClassName;
  const peaks =
    peaksProp && peaksProp.length > 0
      ? peaksProp
      : peaksFromSeed(seed, barCount);
  const clamped = Math.max(0, Math.min(1, progress));
  const playheadVisible =
    showPlayhead ?? (interactive || clamped > 0.02);

  /* Prefer solid/rgba for inline backgroundColor — color-mix in CSS vars can
     resolve to transparent in WebKit when set via style={{}}, wiping the BIT rail. */
  const activeColor =
    tone === "inverted"
      ? "rgba(242, 235, 224, 0.88)"
      : tone === "take"
        ? "var(--brd-graphite-soft)"
        : "var(--brd-audio-wave-played)";
  const idleColor =
    tone === "inverted"
      ? "rgba(242, 235, 224, 0.28)"
      : tone === "take"
        ? "rgba(16, 20, 18, 0.28)"
        : "var(--brd-audio-wave-rest)";
  const playheadColor =
    tone === "inverted"
      ? "rgba(242, 235, 224, 0.92)"
      : "var(--brd-audio-playhead)";

  return (
    <div
      className={cn("relative w-full select-none", height, className)}
      role={interactive ? "slider" : "img"}
      aria-label={ariaLabel}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(clamped * 100) : undefined}
      onClick={
        interactive && onSeekRatio
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              onSeekRatio(Math.max(0, Math.min(1, ratio)));
            }
          : undefined
      }
      onKeyDown={
        interactive && onSeekRatio
          ? (event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                onSeekRatio(Math.min(1, clamped + 0.03));
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                onSeekRatio(Math.max(0, clamped - 0.03));
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="flex h-full w-full items-center gap-px">
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
      </div>
      {playheadVisible ? (
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
