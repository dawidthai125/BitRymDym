"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent } from "react";

import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { BrdAudioTime } from "@/components/brand/brd-audio-meta";
import { Waveform } from "@/components/brand/waveform";
import { BrdPlaybackTools } from "@/components/player/brd-playback-tools";
import { useLibText } from "@/i18n/use-lib-text";
import { formatDurationSeconds, toSafePlaybackErrorMessage } from "@/lib/beats/public";
import { shouldRestartFromStart } from "@/lib/player/playback-progress";
import {
  canTogglePlay,
  createInitialPlaybackSnapshot,
  isPlayLabel,
  reducePlayback,
} from "@/lib/player/playback-state";
import { cn } from "@/lib/utils";

type BrdAudioDeckProps = {
  src: string;
  title: string;
  testId: string;
  seed?: string;
  className?: string;
};

/**
 * BitRymDym listen deck for a URL we already hold (share link, finished master).
 * Hidden engine, no native controls, no download.
 */
export function BrdAudioDeck({ src, title, testId, seed, className }: BrdAudioDeckProps) {
  const tl = useLibText();
  const t = useTranslations("common.playbackShell");
  const labelId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [state, dispatch] = useReducer(reducePlayback, undefined, createInitialPlaybackSnapshot);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = src;
    audio.load();
    dispatch({ type: "RESET" });
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    audio.loop = loop;
    audio.playbackRate = rate;
  }, [volume, muted, loop, rate, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      dispatch({
        type: "TIME",
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      });
    };
    const onPlaying = () => dispatch({ type: "PLAYING" });
    const onPause = () => dispatch({ type: "PAUSED" });
    const onEnded = () => dispatch({ type: "ENDED" });
    const onError = () => {
      dispatch({ type: "ENGINE_ERROR", message: toSafePlaybackErrorMessage("playback failure") });
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [src]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !canTogglePlay(state.phase)) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    dispatch({ type: "REQUEST_PLAY" });
    try {
      if (shouldRestartFromStart(audio.currentTime, state.duration, audio.ended)) {
        audio.currentTime = 0;
      }
      await audio.play();
    } catch {
      dispatch({ type: "ENGINE_ERROR", message: toSafePlaybackErrorMessage("playback failure") });
    }
  }

  function seek(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = state.duration > 0 ? state.duration : audio.duration;
    const next = Math.max(0, Number.isFinite(max) && max > 0 ? Math.min(max, time) : time);
    audio.currentTime = next;
    dispatch({ type: "TIME", currentTime: next, duration: state.duration });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      void togglePlay();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(state.currentTime + 5);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(Math.max(0, state.currentTime - 5));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setVolume((value) => Math.min(1, value + 0.05));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setVolume((value) => Math.max(0, value - 0.05));
      return;
    }
    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      setMuted((value) => !value);
    }
  }

  const duration = state.duration > 0 ? state.duration : 0;
  const progress = duration > 0 ? Math.min(1, Math.max(0, state.currentTime / duration)) : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border border-[var(--brd-audio-line)] bg-[var(--brd-paper)] p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] sm:p-4",
        className,
      )}
      role="region"
      aria-labelledby={labelId}
      tabIndex={0}
      data-testid={testId}
      data-brd-player="deck"
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-start justify-between gap-3">
        <p id={labelId} className="brd-display min-w-0 truncate text-lg font-semibold tracking-tight text-[var(--brd-ink)]">
          {tl(title)}
        </p>
        <BrdAudioTime current={state.currentTime} total={duration} format={formatDurationSeconds} className="text-xs" />
      </div>
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <Waveform
        seed={seed || src}
        progress={progress}
        density="studio"
        showPlayhead={progress > 0 || state.phase === "playing"}
        interactive
        onSeekRatio={(ratio) => seek(ratio * (duration || 0))}
        aria-label={t("przebiegPrzewinBit")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <BrdAudioPlayButton
          playing={state.phase === "playing"}
          loading={state.phase === "loading"}
          size="md"
          title={tl(title)}
          onClick={() => void togglePlay()}
          aria-label={tl(isPlayLabel(state.phase) ? t("odtworz") : "Pauza")}
        />
        <BrdPlaybackTools
          volume={volume}
          muted={muted}
          loop={loop}
          rate={rate}
          onVolume={setVolume}
          onMuted={setMuted}
          onLoop={setLoop}
          onRate={setRate}
        />
      </div>
      {state.error ? (
        <p className="text-sm text-[var(--brd-danger)]" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
    </div>
  );
}
