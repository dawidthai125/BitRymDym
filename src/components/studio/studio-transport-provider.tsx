"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePlayerOptional } from "@/components/player/player-provider";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import { PUBLIC_PLAYBACK_PURPOSE } from "@/lib/beats/public";
import {
  gainDbToLinearVolume,
  msToSeconds,
  projectPlayheadToSourceSeconds,
  sourceSecondsToProjectPlayheadMs,
} from "@/lib/studio/studio-beat-audio";
import type { StudioTransportPhase } from "@/lib/studio/studio-transport";
import { clampPlayheadMs, formatStudioTimeMs } from "@/lib/studio/studio-time";

export type StudioAudioLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error"
  | "no_beat";

type StudioTransportApi = {
  state: {
    phase: StudioTransportPhase;
    playheadMs: number;
    timelineLengthMs: number;
  };
  audioState: StudioAudioLoadState;
  timeLabel: string;
  error: string | null;
  hasBeat: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (playheadMs: number) => void;
};

const StudioTransportContext = createContext<StudioTransportApi | null>(null);

type BeatClipTiming = {
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
};

const PLAYBACK_ERROR_PL =
  "Nie udało się odtworzyć bitu. Sprawdź połączenie lub spróbuj ponownie.";

/**
 * Project timeline transport with optional BEAT_REF audio.
 * Distinct from PlayerProvider — uses a local HTMLAudioElement only.
 *
 * Remount when `beatId` changes (parent should set `key={beatId}`) so load
 * state resets without setState-in-effect.
 */
export function StudioTransportProvider({
  timelineLengthMs,
  beatId,
  beatGainDb = 0,
  beatMuted = false,
  beatClip,
  children,
}: {
  timelineLengthMs: number;
  beatId: string | null;
  beatGainDb?: number;
  beatMuted?: boolean;
  beatClip?: BeatClipTiming | null;
  children: ReactNode;
}) {
  const catalogPlayer = usePlayerOptional();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const expiresAtRef = useRef<string | null>(null);
  const urlReadyRef = useRef(false);

  const [phase, setPhase] = useState<StudioTransportPhase>("stopped");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [audioState, setAudioState] = useState<StudioAudioLoadState>(
    beatId ? "idle" : "no_beat",
  );
  const [error, setError] = useState<string | null>(null);

  const clip: BeatClipTiming = beatClip ?? {
    timelineStartMs: 0,
    sourceOffsetMs: 0,
    durationMs: timelineLengthMs,
  };

  useEffect(() => {
    catalogPlayer?.setSuppressed(true);
    return () => {
      catalogPlayer?.setSuppressed(false);
    };
  }, [catalogPlayer]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = beatMuted;
    audio.volume = beatMuted ? 0 : gainDbToLinearVolume(beatGainDb);
  }, [beatGainDb, beatMuted]);

  const syncFromAudio = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = sourceSecondsToProjectPlayheadMs({
      sourceSeconds: audio.currentTime,
      clipTimelineStartMs: clip.timelineStartMs,
      clipSourceOffsetMs: clip.sourceOffsetMs,
    });
    setPlayheadMs(clampPlayheadMs(next, timelineLengthMs));
  });

  const onPlay = useEffectEvent(() => {
    setPhase("playing");
    setAudioState("playing");
  });

  const onPause = useEffectEvent(() => {
    setPhase((p) => (p === "stopped" ? p : "paused"));
    setAudioState((s) => (s === "error" || s === "no_beat" ? s : "paused"));
  });

  const onEnded = useEffectEvent(() => {
    setPhase("stopped");
    setAudioState("ready");
    setPlayheadMs(
      clampPlayheadMs(
        clip.timelineStartMs + clip.durationMs,
        timelineLengthMs,
      ),
    );
  });

  const onErr = useEffectEvent(() => {
    setPhase("paused");
    setAudioState("error");
    setError(PLAYBACK_ERROR_PL);
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => syncFromAudio();
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErr);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErr);
    };
  }, []);

  async function ensureSource(): Promise<boolean> {
    if (!beatId) {
      setAudioState("no_beat");
      setError("Brak bitu w projekcie. Dodaj bit, aby odsłuchać.");
      return false;
    }
    const audio = audioRef.current;
    if (!audio) return false;

    const expiresAt = expiresAtRef.current
      ? Date.parse(expiresAtRef.current)
      : 0;
    const stillValid =
      urlReadyRef.current &&
      Number.isFinite(expiresAt) &&
      expiresAt - Date.now() > 15_000;

    if (stillValid && audio.src) {
      setAudioState((s) => (s === "error" ? "ready" : s));
      return true;
    }

    setAudioState("loading");
    setError(null);
    const result = await requestBeatAudioAccessAction({
      beatId,
      purpose: PUBLIC_PLAYBACK_PURPOSE,
    });
    if (!result.success || !result.url) {
      setAudioState("error");
      setError(PLAYBACK_ERROR_PL);
      return false;
    }
    audio.src = result.url;
    expiresAtRef.current = result.expiresAt ?? null;
    urlReadyRef.current = true;
    audio.load();
    setAudioState("ready");
    return true;
  }

  const play = () => {
    const headAtClick = playheadMs;
    void (async () => {
      const ok = await ensureSource();
      if (!ok) return;
      const audio = audioRef.current;
      if (!audio) return;
      const sourceSec = projectPlayheadToSourceSeconds({
        playheadMs: headAtClick,
        clipTimelineStartMs: clip.timelineStartMs,
        clipSourceOffsetMs: clip.sourceOffsetMs,
        clipDurationMs: clip.durationMs || timelineLengthMs,
      });
      const target = sourceSec ?? msToSeconds(clip.sourceOffsetMs);
      if (Math.abs(audio.currentTime - target) > 0.05) {
        audio.currentTime = target;
      }
      try {
        await audio.play();
      } catch {
        setAudioState("error");
        setError(PLAYBACK_ERROR_PL);
      }
    })();
  };

  const pause = () => {
    audioRef.current?.pause();
  };

  const stop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = msToSeconds(clip.sourceOffsetMs);
    }
    setPhase("stopped");
    setPlayheadMs(clip.timelineStartMs);
    setAudioState((s) =>
      s === "error" || s === "no_beat" || s === "idle" ? s : "ready",
    );
  };

  const seek = (ms: number) => {
    const clamped = clampPlayheadMs(ms, timelineLengthMs);
    setPlayheadMs(clamped);
    const audio = audioRef.current;
    if (!audio || !urlReadyRef.current) return;
    const sourceSec = projectPlayheadToSourceSeconds({
      playheadMs: clamped,
      clipTimelineStartMs: clip.timelineStartMs,
      clipSourceOffsetMs: clip.sourceOffsetMs,
      clipDurationMs: clip.durationMs || timelineLengthMs,
    });
    if (sourceSec == null) {
      audio.pause();
      setPhase("paused");
      return;
    }
    audio.currentTime = sourceSec;
  };

  const api: StudioTransportApi = {
    state: {
      phase,
      playheadMs: clampPlayheadMs(playheadMs, timelineLengthMs),
      timelineLengthMs,
    },
    audioState,
    timeLabel: formatStudioTimeMs(clampPlayheadMs(playheadMs, timelineLengthMs)),
    error,
    hasBeat: Boolean(beatId),
    play,
    pause,
    stop,
    seek,
  };

  return (
    <StudioTransportContext.Provider value={api}>
      <audio ref={audioRef} preload="metadata" className="hidden" />
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
