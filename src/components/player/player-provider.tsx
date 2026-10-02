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
import { PUBLIC_PLAYBACK_PURPOSE } from "@/lib/beats/public";

export type PlayerTrack = {
  beatId: string;
  title: string;
  producer: string;
  durationSeconds: number;
  artworkVariant: number;
};

type PlayerPhase = "idle" | "loading" | "playing" | "paused" | "error";

type PlayerContextValue = {
  track: PlayerTrack | null;
  phase: PlayerPhase;
  currentTime: number;
  duration: number;
  error: string | null;
  suppressed: boolean;
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
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

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
      setCurrentTime(0);
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
      throw new Error(result.error || "Brak dostępu do odsłuchu.");
    }
    expiresAtRef.current = result.expiresAt ?? null;
    audio.dataset.beatId = beatId;
    audio.src = result.url;
    audio.load();
    return result.url;
  }, []);

  const playTrack = useCallback(
    async (next: PlayerTrack) => {
      const audio = audioRef.current;
      if (!audio) return;

      setError(null);
      setTrack(next);
      setDuration(next.durationSeconds);
      setPhase("loading");
      setSuppressed(false);

      try {
        if (audio.dataset.beatId !== next.beatId) {
          audio.pause();
          setCurrentTime(0);
        }
        await ensureUrl(next.beatId);
        await audio.play();
        setPhase("playing");
      } catch (e) {
        setPhase("error");
        setError(
          e instanceof Error ? e.message : "Nie udało się odtworzyć audio.",
        );
      }
    },
    [ensureUrl],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) {
      void (async () => {
        try {
          setPhase("loading");
          await ensureUrl(track.beatId);
          await audio.play();
        } catch (e) {
          setPhase("error");
          setError(
            e instanceof Error ? e.message : "Nie udało się odtworzyć audio.",
          );
        }
      })();
    } else {
      audio.pause();
    }
  }, [ensureUrl, track]);

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
