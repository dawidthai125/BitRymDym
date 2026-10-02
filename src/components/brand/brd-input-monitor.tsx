"use client";

import { cn } from "@/lib/utils";
import {
  micLevelLabelPl,
  type MicLevelState,
} from "@/hooks/use-mic-analyser";

type BrdInputMonitorProps = {
  level: MicLevelState;
  peak: number;
  className?: string;
};

/**
 * BRD Input Monitor — compact mic level status (not a mixer).
 */
export function BrdInputMonitor({
  level,
  peak,
  className,
}: BrdInputMonitorProps) {
  const label = micLevelLabelPl(level);
  const fill = Math.min(1, Math.max(0, peak));
  const danger = level === "clip" || level === "hot";

  return (
    <div
      className={cn("space-y-1.5", className)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          Mikrofon
        </p>
        <p
          className={cn(
            "brd-meta text-[11px] uppercase tracking-[0.12em]",
            danger
              ? "text-[var(--brd-audio-rec)]"
              : level === "good"
                ? "text-[var(--brd-green)]"
                : "text-[var(--brd-mute)]",
          )}
        >
          {label}
        </p>
      </div>
      <div
        className="h-1.5 w-full border border-[var(--brd-audio-line)] bg-[var(--brd-paper-deep)]"
        aria-hidden
      >
        <div
          className={cn(
            "h-full transition-[width] duration-75",
            danger
              ? "bg-[var(--brd-audio-rec)]"
              : level === "good"
                ? "bg-[var(--brd-audio-play)]"
                : "bg-[var(--brd-ink-soft)]",
          )}
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </div>
    </div>
  );
}
