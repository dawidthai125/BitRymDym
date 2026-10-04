"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  PUBLIC_PLAYBACK_PURPOSE,
  toSafePlaybackErrorMessage,
} from "@/lib/beats/public";
import { shouldRestartFromStart } from "@/lib/player/playback-progress";

export type PlayerTrack = {
  beatId: string;
  title: string;
  producer: string;
  durationSeconds: number;
  artworkVariant: number;
};

type PlayerPhase = "idle" | "loading" | "playing" | "paused" | "error";

export type ActivateTrackOptions = {
  /** When false, load source and stay paused (seek-before-play). Default true. */
  autoplay?: boolean;
};

type PlayerContextValue = {
  track: PlayerTrack | null;
  phase: PlayerPhase;
  currentTime: number;
  duration: number;
  error: string | null;
  suppressed: boolean;
  activateTrack: (
    track: PlayerTrack,
    options?: ActivateTrackOptions,
  ) => Promise<void>;
  playTrack: (track: PlayerTrack) => Promise<void>;
  toggle: () => void;
  seek: (time: number) => void;
  close: () => void;
  setSuppressed: (value: boolean) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return ctx;
}

export function usePlayerOptional(): PlayerContextValue | null {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const expiresAtRef = useRef<string | null>(null);
  const durationRef = useRef(0);
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  // Keep ended/restart fallback in sync without writing refs during render.
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onPlay = () => setPhase("playing");
    const onPause = () => {
      if (!audio.ended) setPhase("paused");
    };
    const onEnded = () => {
      setPhase("paused");
      const end =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationRef.current;
      setCurrentTime(end > 0 ? end : 0);
    };
    const onErr = () => {
      setPhase("error");
      setError("Nie udało się odtworzyć audio.");
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErr);

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErr);
      audioRef.current = null;
    };
  }, []);

  const ensureUrl = useCallback(async (beatId: string): Promise<string> => {
    const expired =
      !expiresAtRef.current ||
      new Date(expiresAtRef.current).getTime() <= Date.now() + 5000;
    const audio = audioRef.current;
    if (!audio) throw new Error("Player niedostępny.");

    if (audio.dataset.beatId === beatId && audio.src && !expired) {
      return audio.src;
    }

    const result = await requestBeatAudioAccessAction({
      beatId,
      purpose: PUBLIC_PLAYBACK_PURPOSE,
    });
    if (!result.success || !result.url) {
      throw new Error(
        toSafePlaybackErrorMessage(result.error || "Brak dostępu do odsłuchu."),
      );
    }
    expiresAtRef.current = result.expiresAt ?? null;
    audio.dataset.beatId = beatId;
    audio.src = result.url;
    audio.load();
    return result.url;
  }, []);

  const restartFromStartIfNeeded = useCallback((audio: HTMLAudioElement) => {
    const d =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : durationRef.current;
    if (shouldRestartFromStart(audio.currentTime, d, audio.ended)) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, []);

  const activateTrack = useCallback(
    async (next: PlayerTrack, options?: ActivateTrackOptions) => {
      const autoplay = options?.autoplay ?? true;
      const audio = audioRef.current;
      if (!audio) return;

      setError(null);
      setTrack(next);
      setDuration(next.durationSeconds);
      setSuppressed(false);
      setPhase("loading");

      try {
        if (audio.dataset.beatId !== next.beatId) {
          audio.pause();
          setCurrentTime(0);
        }

        await ensureUrl(next.beatId);

        if (autoplay) {
          restartFromStartIfNeeded(audio);
          await audio.play();
          setPhase("playing");
          return;
        }

        if (!audio.paused) {
          audio.pause();
        }
        setPhase("paused");
        setCurrentTime(audio.currentTime);
      } catch (e) {
        setPhase("error");
        setError(
          toSafePlaybackErrorMessage(
            e instanceof Error ? e.message : "Nie udało się odtworzyć audio.",
          ),
        );
      }
    },
    [ensureUrl, restartFromStartIfNeeded],
  );

  const playTrack = useCallback(
    async (next: PlayerTrack) => {
      await activateTrack(next, { autoplay: true });
    },
    [activateTrack],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) {
      void (async () => {
        try {
          setPhase("loading");
          await ensureUrl(track.beatId);
          restartFromStartIfNeeded(audio);
          await audio.play();
        } catch (e) {
          setPhase("error");
          setError(
            toSafePlaybackErrorMessage(
              e instanceof Error ? e.message : "Nie udało się odtworzyć audio.",
            ),
          );
        }
      })();
    } else {
      audio.pause();
    }
  }, [ensureUrl, restartFromStartIfNeeded, track]);

  /** Seek only — never starts playback. */
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    audio.currentTime = Math.max(0, time);
    setCurrentTime(audio.currentTime);
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      delete audio.dataset.beatId;
    }
    expiresAtRef.current = null;
    setTrack(null);
    setPhase("idle");
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      track,
      phase,
      currentTime,
      duration,
      error,
      suppressed,
      activateTrack,
      playTrack,
      toggle,
      seek,
      close,
      setSuppressed,
    }),
    [
      track,
      phase,
      currentTime,
      duration,
      error,
      suppressed,
      activateTrack,
      playTrack,
      toggle,
      seek,
      close,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}
