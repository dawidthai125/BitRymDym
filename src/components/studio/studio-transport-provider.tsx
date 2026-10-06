"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";

import {
  reduceStudioTransport,
  type StudioTransportPhase,
} from "@/lib/studio/studio-transport";
import { clampPlayheadMs, formatStudioTimeMs } from "@/lib/studio/studio-time";

type StudioTransportApi = {
  state: {
    phase: StudioTransportPhase;
    playheadMs: number;
    timelineLengthMs: number;
  };
  timeLabel: string;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (playheadMs: number) => void;
};

const StudioTransportContext = createContext<StudioTransportApi | null>(null);

type LocalState = {
  phase: StudioTransportPhase;
  playheadMs: number;
};

/**
 * Project timeline transport — NOT PlayerProvider.
 * Advances playhead in integer ms while playing.
 */
export function StudioTransportProvider({
  timelineLengthMs,
  children,
}: {
  timelineLengthMs: number;
  children: ReactNode;
}) {
  const [local, setLocal] = useState<LocalState>({
    phase: "stopped",
    playheadMs: 0,
  });

  const playheadMs = clampPlayheadMs(local.playheadMs, timelineLengthMs);

  const onFrame = useEffectEvent((deltaMs: number) => {
    setLocal((prev) => {
      const next = reduceStudioTransport(
        {
          phase: prev.phase,
          playheadMs: prev.playheadMs,
          timelineLengthMs,
        },
        { type: "TICK", deltaMs: Math.max(0, Math.round(deltaMs)) },
      );
      return { phase: next.phase, playheadMs: next.playheadMs };
    });
  });

  useEffect(() => {
    if (local.phase !== "playing") return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const delta = now - last;
      last = now;
      onFrame(delta);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [local.phase]);

  const api: StudioTransportApi = {
    state: {
      phase: local.phase,
      playheadMs,
      timelineLengthMs,
    },
    timeLabel: formatStudioTimeMs(playheadMs),
    play: () => setLocal((prev) => ({ ...prev, phase: "playing" })),
    pause: () =>
      setLocal((prev) =>
        prev.phase === "stopped" ? prev : { ...prev, phase: "paused" },
      ),
    stop: () => setLocal({ phase: "stopped", playheadMs: 0 }),
    seek: (ms) =>
      setLocal((prev) => ({
        ...prev,
        playheadMs: clampPlayheadMs(ms, timelineLengthMs),
      })),
  };

  return (
    <StudioTransportContext.Provider value={api}>
      {children}
    </StudioTransportContext.Provider>
  );
}

export function useStudioTransport(): StudioTransportApi {
  const ctx = useContext(StudioTransportContext);
  if (!ctx) {
    throw new Error("useStudioTransport must be used within StudioTransportProvider");
  }
  return ctx;
}
