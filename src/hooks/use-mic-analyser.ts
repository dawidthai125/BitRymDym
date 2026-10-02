"use client";

import { useEffect, useRef, useState } from "react";

export type MicLevelState =
  | "silent"
  | "quiet"
  | "good"
  | "hot"
  | "clip";

export type MicAnalyserSnapshot = {
  peak: number;
  peakDb: number;
  level: MicLevelState;
  /** Rolling peak bars 0..1 for live waveform */
  bars: number[];
};

const EMPTY: MicAnalyserSnapshot = {
  peak: 0,
  peakDb: -100,
  level: "silent",
  bars: [],
};

function classifyLevel(peak: number): MicLevelState {
  if (peak < 0.003) return "silent";
  if (peak < 0.03) return "quiet";
  if (peak < 0.5) return "good";
  if (peak < 0.9) return "hot";
  return "clip";
}

/**
 * Local mic monitoring via AnalyserNode.
 * Does not own MediaStream tracks — caller owns recorder lifecycle.
 */
export function useMicAnalyser(
  stream: MediaStream | null,
  options?: { barCount?: number; hz?: number },
): MicAnalyserSnapshot {
  const barCount = options?.barCount ?? 48;
  const hz = options?.hz ?? 15;
  const [snap, setSnap] = useState<MicAnalyserSnapshot>({
    ...EMPTY,
    bars: Array.from({ length: barCount }, () => 0.04),
  });

  const ringRef = useRef<number[]>(
    Array.from({ length: barCount }, () => 0.04),
  );

  useEffect(() => {
    if (!stream) {
      ringRef.current = Array.from({ length: barCount }, () => 0.04);
      setSnap({
        ...EMPTY,
        bars: [...ringRef.current],
      });
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let raf = 0;
    let lastEmit = 0;
    const intervalMs = 1000 / hz;

    async function start() {
      try {
        ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        if (cancelled || !stream) return;

        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        // Do NOT connect to destination (no monitor speakers unless wanted)

        const buffer = new Float32Array(analyser.fftSize);

        const tick = (now: number) => {
          if (cancelled || !analyser) return;
          raf = requestAnimationFrame(tick);

          analyser.getFloatTimeDomainData(buffer);
          let peak = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const v = Math.abs(buffer[i]!);
            if (v > peak) peak = v;
            if (v >= 0.99) peak = 1;
          }

          const ring = ringRef.current;
          ring.push(Math.max(0.04, Math.min(1, peak)));
          if (ring.length > barCount) ring.shift();

          if (now - lastEmit < intervalMs) return;
          lastEmit = now;

          const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
          setSnap({
            peak,
            peakDb,
            level: classifyLevel(peak),
            bars: [...ring],
          });
        };

        raf = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setSnap({
            ...EMPTY,
            bars: Array.from({ length: barCount }, () => 0.04),
          });
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch {
        // ignore
      }
      try {
        analyser?.disconnect();
      } catch {
        // ignore
      }
      if (ctx) {
        void ctx.close().catch(() => undefined);
      }
      source = null;
      analyser = null;
      ctx = null;
    };
  }, [stream, barCount, hz]);

  return snap;
}

export function micLevelLabelPl(level: MicLevelState): string {
  switch (level) {
    case "silent":
      return "Brak sygnału";
    case "quiet":
      return "Za cicho";
    case "good":
      return "Dobry poziom";
    case "hot":
      return "Uwaga";
    case "clip":
      return "Za głośno";
  }
}
