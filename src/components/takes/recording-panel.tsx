"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import type { PlaybackShellHandle } from "@/components/player/playback-shell";
import { formatDurationSeconds } from "@/lib/beats/public";
import { cn } from "@/lib/utils";
import {
  TakeMediaRecorder,
  TakeRecorderError,
  detectMediaRecorderSupport,
} from "@/lib/takes/media-recorder";
import { uploadTakeRecordingBlob } from "@/lib/takes/client-upload";
import {
  canStartNewRecording,
  createInitialRecordingUiSnapshot,
  displayMaxRecordingSeconds,
  isRecordingBusy,
  reduceRecordingUi,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";

type RecordingPanelProps = {
  beatId: string;
  beatDurationSeconds: number;
  /** Server SSOT max — client timer must not exceed this. */
  maxRecordingSeconds: number;
  isAuthenticated: boolean;
  beatStatus: string;
  playbackRef: RefObject<PlaybackShellHandle | null>;
  className?: string;
};

async function fetchTakePreviewUrl(takeId: string): Promise<string> {
  const res = await fetch("/api/takes/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takeId }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !json.success || !json.url) {
    throw new Error(json.error ?? "Nie udało się otworzyć podglądu.");
  }
  return json.url;
}

export function RecordingPanel({
  beatId,
  beatDurationSeconds,
  maxRecordingSeconds,
  isAuthenticated,
  beatStatus,
  playbackRef,
  className,
}: RecordingPanelProps) {
  const maxSeconds =
    typeof maxRecordingSeconds === "number" &&
    Number.isFinite(maxRecordingSeconds) &&
    maxRecordingSeconds > 0
      ? Math.floor(maxRecordingSeconds)
      : displayMaxRecordingSeconds(beatDurationSeconds);
  const [state, dispatch] = useReducer(
    reduceRecordingUi,
    undefined,
    () => createInitialRecordingUiSnapshot({ maxRecordingSeconds: maxSeconds }),
  );
  const phaseRef = useRef<RecordingUiPhase>("IDLE");
  const recorderRef = useRef<TakeMediaRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const submittingRef = useRef(false);
  const beatIdRef = useRef(beatId);
  const maxSecondsRef = useRef(maxSeconds);
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    beatIdRef.current = beatId;
    maxSecondsRef.current = maxSeconds;
  }, [beatId, maxSeconds]);

  useEffect(() => {
    const playback = playbackRef.current;
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      try {
        recorderRef.current?.cancel();
      } catch {
        // ignore
      }
      playback?.setControlsLocked(false);
    };
  }, [playbackRef]);

  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: "REQUIRE_AUTH" });
      return;
    }
    if (beatStatus !== "PUBLISHED") {
      dispatch({ type: "BEAT_INELIGIBLE" });
    }
  }, [isAuthenticated, beatStatus]);

  function clearTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function armMicrophone() {
    if (!isAuthenticated) {
      dispatch({ type: "REQUIRE_AUTH" });
      return;
    }
    if (beatStatus !== "PUBLISHED") {
      dispatch({ type: "BEAT_INELIGIBLE" });
      return;
    }
    if (!canStartNewRecording(phaseRef.current) && phaseRef.current !== "READY") {
      return;
    }

    const support = detectMediaRecorderSupport();
    if (!support.supported) {
      dispatch({
        type: "UNSUPPORTED",
        message: "Nagrywanie nie jest wspierane w tej przeglądarce.",
      });
      return;
    }

    dispatch({ type: "REQUEST_MIC" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      recorderRef.current = new TakeMediaRecorder();
      dispatch({ type: "MIC_READY" });
    } catch (error) {
      recorderRef.current = null;
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name: string }).name)
          : "";
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "SecurityError"
      ) {
        dispatch({ type: "MIC_DENIED" });
        return;
      }
      dispatch({
        type: "RECORDING_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić mikrofonu.",
      });
    }
  }

  async function stopAndUpload() {
    if (submittingRef.current) return;
    if (phaseRef.current !== "RECORDING") return;
    submittingRef.current = true;
    clearTick();
    dispatch({ type: "STOP" });
    playbackRef.current?.stopPlayback();

    const recorder = recorderRef.current;
    if (!recorder) {
      playbackRef.current?.setControlsLocked(false);
      dispatch({
        type: "RECORDING_FAILED",
        message: "Brak aktywnego rekordera.",
      });
      submittingRef.current = false;
      return;
    }

    try {
      const result = await recorder.stop();
      dispatch({ type: "UPLOAD_START" });
      try {
        const uploaded = await uploadTakeRecordingBlob({
          beatId: beatIdRef.current,
          blob: result.blob,
          contentType: result.mimeType,
        });
        dispatch({ type: "FINALIZE_START" });
        let previewUrl: string | null = null;
        try {
          previewUrl = await fetchTakePreviewUrl(uploaded.takeId);
        } catch {
          previewUrl = null;
        }
        dispatch({
          type: "TAKE_READY",
          takeId: uploaded.takeId,
          previewUrl,
          takeDurationSeconds: uploaded.durationSeconds,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload/finalize failed.";
        if (/expired/i.test(message)) {
          dispatch({ type: "EXPIRED", message });
        } else if (
          /finaliz|duration|fail-closed|Duration|READY|MIME|missing/i.test(
            message,
          )
        ) {
          dispatch({ type: "FINALIZE_FAILED", message });
        } else {
          dispatch({ type: "UPLOAD_FAILED", message });
        }
      }
    } catch (error) {
      if (error instanceof TakeRecorderError && error.code === "CANCELLED") {
        dispatch({ type: "RETRY_IDLE" });
      } else {
        dispatch({
          type: "RECORDING_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Błąd zatrzymania nagrania.",
        });
      }
    } finally {
      playbackRef.current?.setControlsLocked(false);
      submittingRef.current = false;
      recorderRef.current = null;
    }
  }

  async function startCapture() {
    if (phaseRef.current !== "READY" || submittingRef.current) return;
    submittingRef.current = true;
    playbackRef.current?.setControlsLocked(true);

    const recorder = recorderRef.current ?? new TakeMediaRecorder();
    recorderRef.current = recorder;

    try {
      await recorder.start();
      await playbackRef.current?.playFromStart();
      dispatch({ type: "START_RECORDING" });
      startedAtRef.current = Date.now();
      clearTick();
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: "TICK", elapsedMs: elapsed });
        if (elapsed >= maxSecondsRef.current * 1000) {
          void stopAndUpload();
        }
      }, 200);
    } catch (error) {
      clearTick();
      playbackRef.current?.stopPlayback();
      playbackRef.current?.setControlsLocked(false);
      try {
        recorder.cancel();
      } catch {
        // ignore
      }
      if (
        error instanceof TakeRecorderError &&
        error.code === "PERMISSION_DENIED"
      ) {
        dispatch({ type: "MIC_DENIED" });
      } else if (
        error instanceof TakeRecorderError &&
        error.code === "UNSUPPORTED"
      ) {
        dispatch({ type: "UNSUPPORTED", message: error.message });
      } else {
        dispatch({
          type: "RECORDING_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Nie udało się zacząć nagrania.",
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function cancelAll() {
    clearTick();
    try {
      recorderRef.current?.cancel();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    playbackRef.current?.stopPlayback();
    playbackRef.current?.setControlsLocked(false);
    submittingRef.current = false;
    dispatch({ type: "RETRY_IDLE" });
  }

  async function refreshPreview() {
    if (!state.takeId) return;
    setPreviewBusy(true);
    try {
      const url = await fetchTakePreviewUrl(state.takeId);
      dispatch({ type: "PREVIEW_URL", previewUrl: url });
    } catch (error) {
      dispatch({
        type: "FINALIZE_FAILED",
        message:
          error instanceof Error ? error.message : "Podgląd niedostępny.",
      });
    } finally {
      setPreviewBusy(false);
    }
  }

  const busy = isRecordingBusy(state.phase);
  const elapsedSec = Math.floor(state.elapsedMs / 1000);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-background/80 p-4",
        className,
      )}
      role="region"
      aria-label="Nagrywanie próby"
      data-recording-phase={state.phase}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-tight text-foreground">
          Nagraj próbę
        </p>
        <p className="text-xs text-muted-foreground">
          Limit: {formatDurationSeconds(maxSeconds)} · tylko zalogowany · beat
          PUBLISHED
        </p>
      </div>

      {state.phase === "AUTH_REQUIRED" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Aby nagrywać,{" "}
          <Link
            href="/sign-in"
            className="underline underline-offset-4 hover:text-foreground"
          >
            zaloguj się
          </Link>{" "}
          lub{" "}
          <Link
            href="/sign-up"
            className="underline underline-offset-4 hover:text-foreground"
          >
            załóż konto
          </Link>
          .
        </p>
      ) : null}

      {state.phase === "BEAT_NOT_ELIGIBLE" ? (
        <p className="text-sm text-destructive" role="alert">
          Nagrywanie dostępne tylko dla opublikowanych bitów.
        </p>
      ) : null}

      {state.phase === "REQUESTING_MIC" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Prośba o dostęp do mikrofonu…
        </p>
      ) : null}

      {state.phase === "READY" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Mikrofon gotowy. Nagranie wystartuje razem z bit’em od początku.
        </p>
      ) : null}

      {state.phase === "RECORDING" ? (
        <div className="flex items-center gap-3" role="status">
          <span
            className="inline-block size-2.5 animate-pulse rounded-full bg-destructive"
            aria-hidden
          />
          <span className="text-sm font-medium tabular-nums text-foreground">
            REC {formatDurationSeconds(elapsedSec)} /{" "}
            {formatDurationSeconds(maxSeconds)}
          </span>
        </div>
      ) : null}

      {(state.phase === "STOPPING" ||
        state.phase === "UPLOADING" ||
        state.phase === "PROCESSING") && (
        <p className="text-sm text-muted-foreground" role="status">
          {state.phase === "STOPPING"
            ? "Zatrzymywanie…"
            : state.phase === "UPLOADING"
              ? "Przesyłanie nagrania…"
              : "Finalizacja…"}
        </p>
      )}

      {state.phase === "READY_TAKE" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground" role="status">
            Twoje nagranie jest gotowe
            {state.takeDurationSeconds != null
              ? ` · ${formatDurationSeconds(state.takeDurationSeconds)}`
              : ""}
          </p>
          {state.previewUrl ? (
            <audio
              controls
              preload="metadata"
              src={state.previewUrl}
              className="w-full"
              aria-label="Podgląd własnego nagrania"
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={previewBusy}
              onClick={() => void refreshPreview()}
              className="min-h-11"
            >
              {previewBusy ? "Ładowanie podglądu…" : "Odtwórz podgląd"}
            </Button>
          )}
        </div>
      ) : null}

      {state.error &&
      state.phase !== "AUTH_REQUIRED" &&
      state.phase !== "BEAT_NOT_ELIGIBLE" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(state.phase === "IDLE" ||
          state.phase === "MIC_DENIED" ||
          state.phase === "UNSUPPORTED" ||
          state.phase === "RECORDING_ERROR" ||
          state.phase === "UPLOAD_ERROR" ||
          state.phase === "FINALIZE_ERROR" ||
          state.phase === "EXPIRED" ||
          state.phase === "READY_TAKE") &&
        isAuthenticated &&
        beatStatus === "PUBLISHED" ? (
          <Button
            type="button"
            onClick={() => void armMicrophone()}
            disabled={busy}
            className="min-h-11 min-w-[7rem]"
          >
            {state.phase === "READY_TAKE" ? "Nowe nagranie" : "Nagraj"}
          </Button>
        ) : null}

        {state.phase === "READY" ? (
          <>
            <Button
              type="button"
              onClick={() => void startCapture()}
              disabled={busy}
              className="min-h-11 min-w-[7rem]"
            >
              Start
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancelAll}
              className="min-h-11"
            >
              Anuluj
            </Button>
          </>
        ) : null}

        {state.phase === "RECORDING" ? (
          <>
            <Button
              type="button"
              onClick={() => void stopAndUpload()}
              className="min-h-11 min-w-[7rem]"
            >
              Stop
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancelAll}
              className="min-h-11"
            >
              Anuluj
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
