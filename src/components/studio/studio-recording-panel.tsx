"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { BrdInputMonitor } from "@/components/brand/brd-input-monitor";
import { Button } from "@/components/ui/button";
import { useStudioTransport } from "@/components/studio/studio-transport-provider";
import { useMicAnalyser } from "@/hooks/use-mic-analyser";
import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  toUserFacingTakeUploadError,
  uploadTakeRecordingBlob,
} from "@/lib/takes/client-upload";
import {
  TakeMediaRecorder,
  TakeRecorderError,
  detectMediaRecorderSupport,
} from "@/lib/takes/media-recorder";
import {
  canStartNewRecording,
  createInitialRecordingUiSnapshot,
  isRecordingBusy,
  reduceRecordingUi,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";

type AudioInputOption = { deviceId: string; label: string };

export function StudioRecordingPanel({
  projectId,
  tracks,
  onClipCreated,
  onRecordingActiveChange,
}: {
  projectId: string;
  tracks: StudioTrackDto[];
  onClipCreated: (clip: StudioClipDto) => void;
  onRecordingActiveChange?: (active: boolean) => void;
}) {
  const transport = useStudioTransport();
  const recordableTracks = tracks.filter((t) => t.trackType !== "BEAT");
  const trackChoices =
    recordableTracks.length > 0 ? recordableTracks : tracks;
  const defaultTrack =
    trackChoices.find((t) => t.recordArmed) ?? trackChoices[0];

  const [trackIdOverride, setTrackIdOverride] = useState<string | null>(null);
  const trackId = trackIdOverride ?? defaultTrack?.id ?? "";
  const [beatId, setBeatId] = useState<string | null>(null);
  const [maxSeconds, setMaxSeconds] = useState(180);
  const [contextError, setContextError] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<AudioInputOption[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string>("");
  const [recordStartMs, setRecordStartMs] = useState<number | null>(null);

  const [state, dispatch] = useReducer(
    reduceRecordingUi,
    undefined,
    () => createInitialRecordingUiSnapshot({ maxRecordingSeconds: 180 }),
  );

  const phaseRef = useRef<RecordingUiPhase>("IDLE");
  const recorderRef = useRef<TakeMediaRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const submittingRef = useRef(false);
  const beatIdRef = useRef<string | null>(null);
  const maxSecondsRef = useRef(180);
  const trackIdRef = useRef(trackId);
  const recordStartMsRef = useRef<number | null>(null);
  const audioDeviceIdRef = useRef(audioDeviceId);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const mic = useMicAnalyser(micStream, { barCount: 32, hz: 15 });

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    beatIdRef.current = beatId;
    maxSecondsRef.current = maxSeconds;
    trackIdRef.current = trackId;
    recordStartMsRef.current = recordStartMs;
    audioDeviceIdRef.current = audioDeviceId;
  }, [beatId, maxSeconds, trackId, recordStartMs, audioDeviceId]);

  const busy = isRecordingBusy(state.phase) || state.phase === "READY";
  useEffect(() => {
    // Lock timeline only while capture / finalize is in flight — playhead may still
    // be adjusted in READY before ● Nagraj.
    onRecordingActiveChange?.(
      state.phase === "RECORDING" ||
        state.phase === "STOPPING" ||
        state.phase === "UPLOADING" ||
        state.phase === "PROCESSING",
    );
  }, [state.phase, onRecordingActiveChange]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        recorderRef.current?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  function clearTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function clearMic() {
    setMicStream(null);
  }

  async function refreshAudioInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setAudioInputs([]);
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Mikrofon ${i + 1}`,
      }));
    setAudioInputs(inputs);
    if (!audioDeviceId && inputs[0]) {
      setAudioDeviceId(inputs[0].deviceId);
    }
  }

  async function loadContext() {
    setContextError(null);
    const res = await fetch(
      `/api/studio/projects/${projectId}/record/context`,
    );
    const json = (await res.json()) as {
      success?: boolean;
      beatId?: string;
      error?: string;
    };
    if (!res.ok || !json.beatId) {
      throw new Error(
        json.error ?? "Nie udało się przygotować nagrywania w Studio.",
      );
    }
    setBeatId(json.beatId);
    return json.beatId;
  }

  async function prepareMicrophone() {
    if (!canStartNewRecording(phaseRef.current) && phaseRef.current !== "READY") {
      return;
    }
    if (!trackIdRef.current) {
      dispatch({
        type: "RECORDING_FAILED",
        message: "Wybierz ścieżkę do nagrania.",
      });
      return;
    }

    const support = detectMediaRecorderSupport();
    if (!support.supported) {
      dispatch({
        type: "UNSUPPORTED",
        message: "Ta przeglądarka nie obsługuje nagrywania audio.",
      });
      return;
    }

    dispatch({ type: "REQUEST_MIC" });
    try {
      const resolvedBeatId = beatIdRef.current ?? (await loadContext());
      const eligRes = await fetch("/api/takes/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId: resolvedBeatId }),
      });
      const elig = (await eligRes.json()) as {
        success?: boolean;
        allowed?: boolean;
        message?: string;
        upgradeHintMessage?: string | null;
        maxRecordingSeconds?: number;
        error?: string;
      };
      if (!eligRes.ok || !elig.success) {
        dispatch({
          type: "RECORDING_FAILED",
          message: toUserFacingTakeUploadError(
            elig.error ?? "Nie udało się sprawdzić limitu nagrań.",
          ),
        });
        return;
      }
      if (!elig.allowed) {
        const parts = [elig.message ?? "Nie możesz teraz nagrywać."];
        if (elig.upgradeHintMessage) parts.push(elig.upgradeHintMessage);
        dispatch({ type: "RECORDING_FAILED", message: parts.join(" ") });
        return;
      }
      if (
        typeof elig.maxRecordingSeconds === "number" &&
        elig.maxRecordingSeconds > 0
      ) {
        setMaxSeconds(Math.floor(elig.maxRecordingSeconds));
      }

      const probe = await navigator.mediaDevices.getUserMedia({
        audio: audioDeviceIdRef.current
          ? { deviceId: { exact: audioDeviceIdRef.current } }
          : true,
        video: false,
      });
      for (const t of probe.getTracks()) t.stop();
      await refreshAudioInputs();
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
        dispatch({
          type: "MIC_DENIED",
          message: "Nie przyznano dostępu do mikrofonu.",
        });
        return;
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        dispatch({
          type: "RECORDING_FAILED",
          message: "Nie znaleziono mikrofonu.",
        });
        return;
      }
      dispatch({
        type: "RECORDING_FAILED",
        message: toUserFacingTakeUploadError(
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić mikrofonu.",
        ),
      });
    }
  }

  async function startRecording() {
    if (phaseRef.current !== "READY" || submittingRef.current) return;
    if (!beatIdRef.current || !trackIdRef.current) {
      dispatch({
        type: "RECORDING_FAILED",
        message: "Brak kontekstu nagrywania.",
      });
      return;
    }
    submittingRef.current = true;
    const startMs = transport.state.playheadMs;
    setRecordStartMs(startMs);
    recordStartMsRef.current = startMs;

    const recorder = recorderRef.current ?? new TakeMediaRecorder();
    recorderRef.current = recorder;

    try {
      await recorder.start({
        audioDeviceId: audioDeviceIdRef.current || undefined,
      });
      setMicStream(recorder.getStream());
      // Keep beat playing under the new take when possible.
      transport.play();
      dispatch({ type: "START_RECORDING" });
      startedAtRef.current = Date.now();
      clearTick();
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: "TICK", elapsedMs: elapsed });
        if (elapsed >= maxSecondsRef.current * 1000) {
          void stopAndFinalize();
        }
      }, 200);
    } catch (error) {
      clearTick();
      clearMic();
      transport.pause();
      try {
        recorder.cancel();
      } catch {
        // ignore
      }
      if (
        error instanceof TakeRecorderError &&
        error.code === "PERMISSION_DENIED"
      ) {
        dispatch({
          type: "MIC_DENIED",
          message: "Nie przyznano dostępu do mikrofonu.",
        });
      } else if (
        error instanceof TakeRecorderError &&
        error.code === "UNSUPPORTED"
      ) {
        dispatch({
          type: "UNSUPPORTED",
          message: "Ta przeglądarka nie obsługuje nagrywania audio.",
        });
      } else {
        dispatch({
          type: "RECORDING_FAILED",
          message: toUserFacingTakeUploadError(
            error instanceof Error
              ? error.message
              : "Nie udało się zacząć nagrania.",
          ),
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }

  async function stopAndFinalize() {
    if (submittingRef.current) return;
    if (phaseRef.current !== "RECORDING") return;
    submittingRef.current = true;
    clearTick();
    clearMic();
    dispatch({ type: "STOP" });
    transport.pause();

    const recorder = recorderRef.current;
    const startMs = recordStartMsRef.current;
    if (!recorder || startMs == null || !beatIdRef.current) {
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
      const uploaded = await uploadTakeRecordingBlob({
        beatId: beatIdRef.current,
        blob: result.blob,
        contentType: result.mimeType,
      });
      dispatch({ type: "FINALIZE_START" });

      const placeRes = await fetch(
        `/api/studio/projects/${projectId}/record/place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackId: trackIdRef.current,
            takeId: uploaded.takeId,
            timelineStartMs: startMs,
          }),
        },
      );
      const placed = (await placeRes.json()) as {
        success?: boolean;
        clip?: StudioClipDto;
        error?: string;
      };
      if (!placeRes.ok || !placed.clip) {
        dispatch({
          type: "FINALIZE_FAILED",
          message: toUserFacingTakeUploadError(
            placed.error ?? "Nagranie zapisano, ale nie udało się dodać klipu.",
          ),
        });
        return;
      }

      onClipCreated(placed.clip);
      dispatch({
        type: "TAKE_READY",
        takeId: uploaded.takeId,
        previewUrl: null,
        takeDurationSeconds: uploaded.durationSeconds,
      });
    } catch (error) {
      if (error instanceof TakeRecorderError && error.code === "CANCELLED") {
        dispatch({ type: "RETRY_IDLE" });
      } else {
        const raw =
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać nagrania.";
        const message = toUserFacingTakeUploadError(raw);
        if (/finaliz|duration|READY|MIME/i.test(raw)) {
          dispatch({ type: "FINALIZE_FAILED", message });
        } else {
          dispatch({ type: "UPLOAD_FAILED", message });
        }
      }
    } finally {
      submittingRef.current = false;
      recorderRef.current = null;
      setRecordStartMs(null);
      recordStartMsRef.current = null;
    }
  }

  function cancelRecording() {
    clearTick();
    clearMic();
    transport.pause();
    try {
      recorderRef.current?.cancel();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    setRecordStartMs(null);
    recordStartMsRef.current = null;
    dispatch({ type: "RETRY_IDLE" });
  }

  const primaryLabel =
    state.phase === "REQUESTING_MIC"
      ? "Prośba o dostęp do mikrofonu…"
      : state.phase === "READY"
        ? "● Nagraj"
        : state.phase === "RECORDING"
          ? "■ Zatrzymaj nagrywanie"
          : state.phase === "STOPPING" ||
              state.phase === "UPLOADING" ||
              state.phase === "PROCESSING"
            ? "Zapisywanie nagrania…"
            : state.phase === "READY_TAKE"
              ? "Nagraj kolejne"
              : "Przygotuj mikrofon";

  const primaryDisabled =
    state.phase === "REQUESTING_MIC" ||
    state.phase === "STOPPING" ||
    state.phase === "UPLOADING" ||
    state.phase === "PROCESSING" ||
    !trackId;

  return (
    <section
      className="space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
      aria-label="Nagrywanie w Studio"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--brd-ink)]">
          Nagrywanie
        </h2>
        {state.phase === "RECORDING" ? (
          <p className="text-xs font-medium text-destructive" role="status">
            TRYB NAGRYWANIA · {formatStudioTimeMs(Math.round(state.elapsedMs))}
          </p>
        ) : (
          <p className="text-xs text-[var(--brd-mute)]">
            Start: playhead {formatStudioTimeMs(transport.state.playheadMs)}
          </p>
        )}
      </div>

      <label className="block text-xs text-[var(--brd-mute)]">
        Ścieżka
        <select
          className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
          value={trackId}
          disabled={busy && state.phase !== "READY"}
          onChange={(e) => setTrackIdOverride(e.target.value)}
          aria-label="Wybierz ścieżkę"
        >
          {trackChoices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {audioInputs.length > 0 ? (
        <label className="block text-xs text-[var(--brd-mute)]">
          Mikrofon
          <select
            className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
            value={audioDeviceId}
            disabled={state.phase === "RECORDING"}
            onChange={(e) => setAudioDeviceId(e.target.value)}
            aria-label="Wybierz mikrofon"
          >
            {audioInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {(state.phase === "READY" || state.phase === "RECORDING") && micStream ? (
        <div className="space-y-1">
          <p className="text-xs text-[var(--brd-mute)]">Poziom wejścia</p>
          <BrdInputMonitor level={mic.level} peak={mic.peak} />
          {mic.level === "clip" || mic.level === "hot" ? (
            <p className="text-xs text-destructive" role="status">
              Uwaga: sygnał blisko przesterowania.
            </p>
          ) : null}
        </div>
      ) : null}

      {contextError || state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {contextError ?? state.error}
        </p>
      ) : null}

      {state.phase === "READY_TAKE" ? (
        <p className="text-sm text-[var(--brd-ink-soft)]" role="status">
          Nagranie zapisane i dodane na oś czasu.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={state.phase === "RECORDING" ? "destructive" : "default"}
          disabled={primaryDisabled}
          onClick={() => {
            if (state.phase === "READY") void startRecording();
            else if (state.phase === "RECORDING") void stopAndFinalize();
            else if (
              state.phase === "READY_TAKE" ||
              canStartNewRecording(state.phase)
            )
              void prepareMicrophone();
          }}
        >
          {primaryLabel}
        </Button>
        {(state.phase === "READY" ||
          state.phase === "RECORDING" ||
          state.phase === "REQUESTING_MIC") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={cancelRecording}
          >
            Anuluj
          </Button>
        )}
      </div>

      <p className="text-[11px] text-[var(--brd-mute)]">
        Limit: {maxSeconds}s · istniejące limity konta i TTL pozostają w mocy.
        Usunięcie klipu nie usuwa nagrania źródłowego.
      </p>
    </section>
  );
}
