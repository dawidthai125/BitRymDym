"use client";

import { Waveform } from "@/components/brand/waveform";
import { cn } from "@/lib/utils";

type BrdLiveMicWaveformProps = {
  bars: number[];
  /** Shared REC playhead 0..1 */
  progress: number;
  className?: string;
};

/**
 * Live microphone waveform — real AnalyserNode peaks only.
 */
export function BrdLiveMicWaveform({
  bars,
  progress,
  className,
}: BrdLiveMicWaveformProps) {
  return (
    <Waveform
      seed="live-mic"
      peaks={bars.length ? bars : undefined}
      bars={bars.length || 48}
      progress={progress}
      showPlayhead
      density="studio"
      heightClassName="h-10 sm:h-12"
      tone="take"
      className={cn(className)}
      aria-label="Poziom mikrofonu na żywo"
    />
  );
}
