"use client";

import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  formatDurationSeconds,
  PUBLIC_PLAYBACK_PURPOSE,
  toSafePlaybackErrorMessage,
} from "@/lib/beats/public";
import { cn } from "@/lib/utils";
import {
  canTogglePlay,
  createInitialPlaybackSnapshot,
  isPlayLabel,
  reducePlayback,
} from "@/lib/player/playback-state";

export type PlaybackShellHandle = {
  /** OD-W3-01: seek to 0, ensure signed URL, play. */
  playFromStart: () => Promise<void>;
  /** Stop beat playback (does not tear down signed URL). */
  stopPlayback: () => void;
  /** While recording/uploading: lock seek + play toggle. */
  setControlsLocked: (locked: boolean) => void;
};

type PlaybackShellProps = {
  beatId: string;
  title: string;
  durationSeconds: number;
  className?: string;
};

export const PlaybackShell = forwardRef<PlaybackShellHandle, PlaybackShellProps>(
  function PlaybackShell(
    { beatId, title, durationSeconds, className },
    ref,
  ) {
    const labelId = useId();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const expiresAtRef = useRef<string | null>(null);
    const [hasSource, setHasSource] = useState(false);
    const [controlsLocked, setControlsLocked] = useState(false);
    const [state, dispatch] = useReducer(
      reducePlayback,
      undefined,
      createInitialPlaybackSnapshot,
    );

    const onTimeUpdate = useEffectEvent(() => {
      const audio = audioRef.current;
      if (!audio) return;
      dispatch({
        type: "TIME",
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration)
          ? audio.duration
          : durationSeconds,
      });
    });

    const onPlaying = useEffectEvent(() => {
      dispatch({ type: "PLAYING" });
    });

    const onPause = useEffectEvent(() => {
      dispatch({ type: "PAUSED" });
    });

    const onEnded = useEffectEvent(() => {
      dispatch({ type: "ENDED" });
    });

    const onEngineError = useEffectEvent(() => {
      dispatch({
        type: "ENGINE_ERROR",
        message: toSafePlaybackErrorMessage("playback failure"),
      });
    });

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("playing", onPlaying);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onEngineError);

      return () => {
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onEngineError);
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      };
    }, []);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = state.volume;
      audio.muted = state.muted;
    }, [state.volume, state.muted]);

    async function ensureSignedUrl(): Promise<string> {
      const expiresAt = expiresAtRef.current;
      const audio = audioRef.current;
      if (
        audio?.src &&
        expiresAt &&
        new Date(expiresAt).getTime() - Date.now() > 15_000
      ) {
        return audio.src;
      }

      const result = await requestBeatAudioAccessAction({
        beatId,
        purpose: PUBLIC_PLAYBACK_PURPOSE,
      });

      if (!result.success || !result.url || !result.expiresAt) {
        throw new Error(result.error ?? "signed url failure");
      }

      expiresAtRef.current = result.expiresAt;
      if (audio) {
        audio.src = result.url;
        setHasSource(true);
      }
      return result.url;
    }

    async function playFromStart(): Promise<void> {
      const audio = audioRef.current;
      if (!audio) throw new Error("Audio engine missing.");
      dispatch({ type: "REQUEST_PLAY" });
      try {
        await ensureSignedUrl();
        audio.currentTime = 0;
        dispatch({
          type: "TIME",
          currentTime: 0,
          duration: Number.isFinite(audio.duration)
            ? audio.duration
            : durationSeconds,
        });
        dispatch({ type: "URL_READY" });
        await audio.play();
      } catch (error) {
        dispatch({
          type: "URL_FAILED",
          message: toSafePlaybackErrorMessage(
            error instanceof Error ? error.message : null,
          ),
        });
        throw error;
      }
    }

    function stopPlayback(): void {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      dispatch({ type: "PAUSED" });
    }

    useImperativeHandle(
      ref,
      () => ({
        playFromStart,
        stopPlayback,
        setControlsLocked,
      }),
      // playFromStart closes over beatId/duration; rebind when they change
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional handle surface
      [beatId, durationSeconds],
    );

    async function handlePlayPause() {
      if (controlsLocked) return;
      const audio = audioRef.current;
      if (!audio || !canTogglePlay(state.phase)) return;

      if (state.phase === "playing") {
        audio.pause();
        return;
      }

      dispatch({ type: "REQUEST_PLAY" });
      try {
        await ensureSignedUrl();
        dispatch({ type: "URL_READY" });
        await audio.play();
      } catch (error) {
        dispatch({
          type: "URL_FAILED",
          message: toSafePlaybackErrorMessage(
            error instanceof Error ? error.message : null,
          ),
        });
      }
    }

    function handleSeek(next: number) {
      if (controlsLocked) return;
      const audio = audioRef.current;
      if (!audio || !hasSource) return;
      const max = Number.isFinite(audio.duration)
        ? audio.duration
        : durationSeconds;
      audio.currentTime = Math.min(max, Math.max(0, next));
      dispatch({
        type: "TIME",
        currentTime: audio.currentTime,
        duration: max,
      });
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (controlsLocked) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        void handlePlayPause();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleSeek(state.currentTime + 5);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleSeek(state.currentTime - 5);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        dispatch({ type: "VOLUME", volume: state.volume + 0.05 });
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        dispatch({ type: "VOLUME", volume: state.volume - 0.05 });
        return;
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        dispatch({ type: "MUTE", muted: !state.muted });
      }
    }

    const displayDuration =
      state.duration > 0 ? state.duration : durationSeconds;
    const progressMax = displayDuration > 0 ? displayDuration : 1;
    const loading = state.phase === "loading";
    const playDisabled = loading || controlsLocked;
    const seekDisabled = !hasSource || controlsLocked;

    return (
      <div
        className={cn(
          "flex flex-col gap-4 rounded-xl border border-border bg-background/80 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        role="region"
        aria-labelledby={labelId}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-controls-locked={controlsLocked ? "true" : "false"}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              id={labelId}
              className="text-sm font-medium tracking-tight text-foreground"
            >
              Odtwarzacz · {title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              BitRymDym Playback Shell · PLAYBACK only
            </p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDurationSeconds(state.currentTime)} /{" "}
            {formatDurationSeconds(displayDuration)}
          </span>
        </div>

        {/* Engine only — never product UI */}
        <audio ref={audioRef} preload="none" />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void handlePlayPause()}
            disabled={playDisabled}
            aria-pressed={state.phase === "playing"}
            aria-label={isPlayLabel(state.phase) ? "Odtwórz" : "Pauza"}
            className="min-h-11 min-w-11 px-4"
          >
            {loading
              ? "Ładowanie…"
              : isPlayLabel(state.phase)
                ? "Odtwórz"
                : "Pauza"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => dispatch({ type: "MUTE", muted: !state.muted })}
            aria-pressed={state.muted}
            aria-label={state.muted ? "Włącz dźwięk" : "Wycisz"}
            disabled={controlsLocked}
            className="min-h-11 min-w-11 px-4"
          >
            {state.muted ? "Wyciszony" : "Dźwięk"}
          </Button>
        </div>

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span>Postęp</span>
          <input
            type="range"
            min={0}
            max={progressMax}
            step={0.1}
            value={Math.min(state.currentTime, progressMax)}
            disabled={seekDisabled}
            onChange={(event) => handleSeek(Number(event.target.value))}
            aria-label="Przewiń utwór"
            className="h-11 w-full accent-foreground"
          />
        </label>

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span>Głośność</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            disabled={controlsLocked}
            onChange={(event) =>
              dispatch({ type: "VOLUME", volume: Number(event.target.value) })
            }
            aria-label="Głośność"
            className="h-11 w-full accent-foreground"
          />
        </label>

        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    );
  },
);
