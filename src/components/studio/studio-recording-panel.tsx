"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { BrdInputMonitor } from "@/components/brand/brd-input-monitor";
import { Button } from "@/components/ui/button";
import { useStudioTransport } from "@/components/studio/studio-transport-provider";
import { useMicAnalyser } from "@/hooks/use-mic-analyser";
import { useStudioInputDevices } from "@/hooks/use-studio-input-devices";
import type {
  StudioClipDto,
  StudioPlaceableTakeDto,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import { studioDeviceErrorMessagePl } from "@/lib/studio/studio-input-devices";
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

type WorkflowActionBusy = "preview" | "keep" | "discard" | "place" | null;

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
  const [recordStartMs, setRecordStartMs] = useState<number | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState<WorkflowActionBusy>(null);
  const [keptMessage, setKeptMessage] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTakes, setLibraryTakes] = useState<StudioPlaceableTakeDto[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryBusyId, setLibraryBusyId] = useState<string | null>(null);
  const [libraryPreviewId, setLibraryPreviewId] = useState<string | null>(null);

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
  const keepInFlightRef = useRef(false);
  const placedTakeIdsRef = useRef<Set<string>>(new Set());
  const beatIdRef = useRef<string | null>(null);
  const maxSecondsRef = useRef(180);
  const trackIdRef = useRef(trackId);
  const captureTrackIdRef = useRef<string>("");
  const recordStartMsRef = useRef<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const mic = useMicAnalyser(micStream, { barCount: 32, hz: 15 });

  const captureActive =
    state.phase === "RECORDING" ||
    state.phase === "STOPPING" ||
    state.phase === "UPLOADING" ||
    state.phase === "PROCESSING";

  const inputDevices = useStudioInputDevices({
    recordingActive: captureActive,
  });

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    beatIdRef.current = beatId;
    maxSecondsRef.current = maxSeconds;
    trackIdRef.current = trackId;
    recordStartMsRef.current = recordStartMs;
  }, [beatId, maxSeconds, trackId, recordStartMs]);

  const busy =
    isRecordingBusy(state.phase) ||
    state.phase === "READY" ||
    state.phase === "READY_TAKE";
  useEffect(() => {
    // Lock timeline only while capture / finalize is in flight — playhead may still
    // be adjusted in READY before ● Nagraj. READY_TAKE is decision UI (not locked).
    onRecordingActiveChange?.(captureActive);
  }, [captureActive, onRecordingActiveChange]);

  // Active track ended mid-capture → stable device error; do not delete READY Takes.
  useEffect(() => {
    if (state.phase !== "RECORDING" || !micStream) return;
    const track = micStream.getAudioTracks()[0];
    if (!track) return;
    const onEnded = () => {
      if (phaseRef.current !== "RECORDING") return;
      clearTick();
      clearMic();
      try {
        recorderRef.current?.cancel();
      } catch {
        // ignore
      }
      recorderRef.current = null;
      clearCapturePlacement();
      dispatch({
        type: "RECORDING_FAILED",
        message: studioDeviceErrorMessagePl("DEVICE_DISCONNECTED"),
      });
    };
    track.addEventListener("ended", onEnded);
    return () => {
      track.removeEventListener("ended", onEnded);
    };
  }, [state.phase, micStream]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        recorderRef.current?.cancel();
      } catch {
        // ignore
      }
      transport.stopTakePreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
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

  function clearCapturePlacement() {
    setRecordStartMs(null);
    recordStartMsRef.current = null;
    captureTrackIdRef.current = "";
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

    transport.stopTakePreview();
    setWorkflowError(null);
    setKeptMessage(null);
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

      const probe = await inputDevices.probeMicrophone();
      if (!probe.ok) {
        if (
          probe.code === "DEVICE_PERMISSION_DENIED" ||
          probe.code === "DEVICE_PERMISSION_BLOCKED"
        ) {
          dispatch({
            type: "MIC_DENIED",
            message: probe.message,
          });
          return;
        }
        dispatch({
          type: "RECORDING_FAILED",
          message: probe.message,
        });
        return;
      }
      recorderRef.current = new TakeMediaRecorder();
      dispatch({ type: "MIC_READY" });
    } catch (error) {
      recorderRef.current = null;
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
    captureTrackIdRef.current = trackIdRef.current;
    setWorkflowError(null);
    setKeptMessage(null);

    const recorder = recorderRef.current ?? new TakeMediaRecorder();
    recorderRef.current = recorder;

    try {
      try {
        await recorder.start({
          audioDeviceId:
            inputDevices.audioDeviceIdForRecorder || undefined,
        });
      } catch (firstStartError) {
        // Stale preference: one retry with system default (P5.8 AC-07).
        if (
          inputDevices.audioDeviceIdForRecorder &&
          firstStartError instanceof TakeRecorderError &&
          firstStartError.code === "RECORDING_ERROR"
        ) {
          await recorder.start({});
        } else {
          throw firstStartError;
        }
      }
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
      clearCapturePlacement();
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
          message: studioDeviceErrorMessagePl("DEVICE_PERMISSION_DENIED"),
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

  /**
   * Finalize Take to READY only — no Clip placement (P5.6).
   * Placement happens via Zachowaj / library Umieść.
   */
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

      // Take is READY after uploadTakeRecordingBlob finalize — do not auto-place.
      dispatch({
        type: "TAKE_READY",
        takeId: uploaded.takeId,
        previewUrl: null,
        takeDurationSeconds: uploaded.durationSeconds,
      });
      setWorkflowError(null);
      setKeptMessage(null);
      // Preserve recordStartMs / captureTrackId for Zachowaj placement.
    } catch (error) {
      clearCapturePlacement();
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
    }
  }

  function cancelRecording() {
    clearTick();
    clearMic();
    clearCapturePlacement();
    transport.pause();
    transport.stopTakePreview();
    try {
      recorderRef.current?.cancel();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    setWorkflowError(null);
    dispatch({ type: "RETRY_IDLE" });
  }

  async function onPreviewWorkflowTake() {
    if (!state.takeId || workflowBusy) return;
    setWorkflowError(null);
    setWorkflowBusy("preview");
    try {
      if (transport.takePreviewActive) {
        transport.stopTakePreview();
      } else {
        await transport.previewTake(state.takeId);
      }
    } catch {
      setWorkflowError("Nie udało się odtworzyć nagrania.");
    } finally {
      setWorkflowBusy(null);
    }
  }

  async function onKeepWorkflowTake() {
    if (!state.takeId || keepInFlightRef.current) return;
    const takeId = state.takeId;
    const startMs = recordStartMsRef.current;
    const placeTrackId = captureTrackIdRef.current || trackIdRef.current;
    if (startMs == null || !placeTrackId) {
      setWorkflowError("Brak pozycji nagrania na osi czasu.");
      return;
    }

    // Client-side idempotency for double-tap before server round-trip.
    if (placedTakeIdsRef.current.has(takeId)) {
      setKeptMessage("Nagranie jest już na osi czasu.");
      transport.stopTakePreview();
      clearCapturePlacement();
      dispatch({ type: "RETRY_IDLE" });
      return;
    }

    keepInFlightRef.current = true;
    setWorkflowBusy("keep");
    setWorkflowError(null);
    try {
      const placeRes = await fetch(
        `/api/studio/projects/${projectId}/record/place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackId: placeTrackId,
            takeId,
            timelineStartMs: startMs,
          }),
        },
      );
      const placed = (await placeRes.json()) as {
        success?: boolean;
        clip?: StudioClipDto;
        reusedExisting?: boolean;
        error?: string;
      };
      if (!placeRes.ok || !placed.clip) {
        // READY Take remains usable — do not clear take / placement refs.
        setWorkflowError(
          placed.error?.includes("dostępne") ||
            placed.error?.includes("READY") ||
            placeRes.status === 403
            ? "Nagranie nie jest już dostępne."
            : "Nie udało się umieścić nagrania na osi czasu.",
        );
        return;
      }

      placedTakeIdsRef.current.add(takeId);
      if (!placed.reusedExisting) {
        onClipCreated(placed.clip);
      }
      transport.stopTakePreview();
      clearCapturePlacement();
      setKeptMessage("Nagranie zachowane na osi czasu.");
      dispatch({ type: "RETRY_IDLE" });
    } catch {
      setWorkflowError("Nie udało się umieścić nagrania na osi czasu.");
    } finally {
      keepInFlightRef.current = false;
      setWorkflowBusy(null);
    }
  }

  async function onDiscardWorkflowTake() {
    if (!state.takeId || workflowBusy) return;
    const confirmed = window.confirm(
      "Odrzucić nagranie?\nNagranie zostanie usunięte.",
    );
    if (!confirmed) return;

    setWorkflowBusy("discard");
    setWorkflowError(null);
    transport.stopTakePreview();
    try {
      const res = await fetch("/api/takes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId: state.takeId }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setWorkflowError(
          toUserFacingTakeUploadError(
            json.error ?? "Nie udało się usunąć nagrania.",
          ),
        );
        return;
      }
      clearCapturePlacement();
      setKeptMessage(null);
      dispatch({ type: "RETRY_IDLE" });
    } catch {
      setWorkflowError("Nie udało się usunąć nagrania.");
    } finally {
      setWorkflowBusy(null);
    }
  }

  function onRecordAgain() {
    if (workflowBusy) return;
    transport.stopTakePreview();
    setWorkflowError(null);
    setKeptMessage(null);
    // Preserve previous Takes/Clips — only start a new capture lifecycle.
    clearCapturePlacement();
    void prepareMicrophone();
  }

  async function loadLibraryTakes() {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const res = await fetch(
        `/api/studio/projects/${projectId}/record/takes`,
      );
      const json = (await res.json()) as {
        success?: boolean;
        takes?: StudioPlaceableTakeDto[];
        error?: string;
      };
      if (!res.ok || !json.success || !json.takes) {
        throw new Error(json.error ?? "Nie udało się wczytać nagrań.");
      }
      setLibraryTakes(json.takes);
    } catch (e) {
      setLibraryError(
        e instanceof Error ? e.message : "Nie udało się wczytać nagrań.",
      );
      setLibraryTakes([]);
    } finally {
      setLibraryLoading(false);
    }
  }

  async function onToggleLibrary() {
    const next = !libraryOpen;
    setLibraryOpen(next);
    if (next) await loadLibraryTakes();
  }

  async function onLibraryPreview(takeId: string) {
    setLibraryError(null);
    setLibraryBusyId(takeId);
    try {
      if (transport.takePreviewActive && libraryPreviewId === takeId) {
        transport.stopTakePreview();
        setLibraryPreviewId(null);
      } else {
        await transport.previewTake(takeId);
        setLibraryPreviewId(takeId);
      }
    } catch {
      setLibraryPreviewId(null);
      setLibraryError("Nie udało się odtworzyć nagrania.");
    } finally {
      setLibraryBusyId(null);
    }
  }

  async function onLibraryPlace(take: StudioPlaceableTakeDto) {
    if (!trackIdRef.current) {
      setLibraryError("Wybierz ścieżkę do nagrania.");
      return;
    }
    setLibraryBusyId(take.id);
    setLibraryError(null);
    transport.stopTakePreview();
    try {
      const placeRes = await fetch(
        `/api/studio/projects/${projectId}/record/place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackId: trackIdRef.current,
            takeId: take.id,
            timelineStartMs: transport.state.playheadMs,
          }),
        },
      );
      const placed = (await placeRes.json()) as {
        success?: boolean;
        clip?: StudioClipDto;
        reusedExisting?: boolean;
        error?: string;
      };
      if (!placeRes.ok || !placed.clip) {
        setLibraryError(
          placed.error?.includes("dostępne") || placeRes.status === 403
            ? "Nagranie nie jest już dostępne."
            : "Nie udało się umieścić nagrania na osi czasu.",
        );
        return;
      }
      if (!placed.reusedExisting) {
        onClipCreated(placed.clip);
      }
      setKeptMessage("Nagranie umieszczone na osi czasu.");
    } catch {
      setLibraryError("Nie udało się umieścić nagrania na osi czasu.");
    } finally {
      setLibraryBusyId(null);
    }
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
            : "Przygotuj mikrofon";

  const primaryDisabled =
    state.phase === "REQUESTING_MIC" ||
    state.phase === "STOPPING" ||
    state.phase === "UPLOADING" ||
    state.phase === "PROCESSING" ||
    state.phase === "READY_TAKE" ||
    !trackId;

  const showWorkflow = state.phase === "READY_TAKE" && state.takeId;
  const workflowDisabled = Boolean(workflowBusy);

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

      {inputDevices.inputs.length > 0 ? (
        <label className="block w-full text-xs text-[var(--brd-mute)]">
          Mikrofon
          <select
            className="mt-1 w-full max-w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
            value={inputDevices.selectedDeviceId ?? ""}
            disabled={
              state.phase === "RECORDING" ||
              state.phase === "READY_TAKE" ||
              state.phase === "REQUESTING_MIC"
            }
            onChange={(e) => {
              inputDevices.setSelectedDeviceId(e.target.value);
              inputDevices.clearSoftNotice();
            }}
            aria-label="Wybierz mikrofon"
          >
            {inputDevices.inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : inputDevices.permission === "UNAVAILABLE" ||
        inputDevices.lastErrorCode === "NO_INPUT_DEVICE" ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          Brak wykrytego mikrofonu. Połącz urządzenie lub przyznaj dostęp.
        </p>
      ) : (
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          Lista mikrofonów pojawi się po przyznaniu dostępu.
        </p>
      )}

      {inputDevices.softNotice ? (
        <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
          {inputDevices.softNotice}
        </p>
      ) : null}

      {(state.phase === "READY" || state.phase === "RECORDING") && micStream ? (
        <div className="w-full space-y-1">
          <p className="text-xs text-[var(--brd-mute)]">Poziom wejścia</p>
          <BrdInputMonitor level={mic.level} peak={mic.peak} />
          {mic.level === "clip" || mic.level === "hot" ? (
            <p className="text-xs text-destructive" role="status">
              Uwaga: sygnał blisko przesterowania.
            </p>
          ) : null}
        </div>
      ) : null}

      {contextError || state.error || workflowError ? (
        <p className="text-sm text-destructive" role="alert">
          {contextError ?? state.error ?? workflowError}
        </p>
      ) : null}

      {keptMessage && state.phase !== "READY_TAKE" ? (
        <p className="text-sm text-[var(--brd-ink-soft)]" role="status">
          {keptMessage}
        </p>
      ) : null}

      {showWorkflow ? (
        <div
          className="space-y-2 rounded border border-[var(--brd-line)] p-2"
          aria-label="Studio Take Workflow"
        >
          <p className="text-sm text-[var(--brd-ink)]" role="status">
            Nagranie gotowe
            {state.takeDurationSeconds != null
              ? ` · ${state.takeDurationSeconds.toFixed(1)}s`
              : ""}
            {recordStartMs != null
              ? ` · start ${formatStudioTimeMs(recordStartMs)}`
              : ""}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              className="w-full"
              variant="outline"
              disabled={workflowDisabled}
              onClick={() => void onPreviewWorkflowTake()}
            >
              {transport.takePreviewActive ? "■ Zatrzymaj" : "▶ Odtwórz"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={workflowDisabled}
              onClick={() => void onKeepWorkflowTake()}
            >
              {workflowBusy === "keep" ? "Zapisywanie…" : "✓ Zachowaj"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full"
              variant="outline"
              disabled={workflowDisabled}
              onClick={() => void onDiscardWorkflowTake()}
            >
              {workflowBusy === "discard" ? "Usuwanie…" : "✕ Odrzuć"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full"
              variant="secondary"
              disabled={workflowDisabled}
              onClick={onRecordAgain}
            >
              ↻ Nagraj ponownie
            </Button>
          </div>
          <p className="text-[11px] text-[var(--brd-mute)]">
            Zachowaj umieszcza nagranie na osi czasu. Odrzucenie usuwa źródło.
            Nagraj ponownie tworzy nowe nagranie — poprzednie pozostaje.
          </p>
        </div>
      ) : null}

      {!showWorkflow ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            variant={state.phase === "RECORDING" ? "destructive" : "default"}
            disabled={primaryDisabled}
            onClick={() => {
              if (state.phase === "READY") void startRecording();
              else if (state.phase === "RECORDING") void stopAndFinalize();
              else if (canStartNewRecording(state.phase))
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
              className="w-full sm:w-auto"
              variant="outline"
              onClick={cancelRecording}
            >
              Anuluj
            </Button>
          )}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-[var(--brd-line)] pt-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-start px-1"
          disabled={
            state.phase === "RECORDING" ||
            state.phase === "STOPPING" ||
            state.phase === "UPLOADING" ||
            state.phase === "PROCESSING"
          }
          onClick={() => void onToggleLibrary()}
          aria-expanded={libraryOpen}
        >
          {libraryOpen ? "▾ Moje Take'i" : "▸ Moje Take'i"}
        </Button>
        {libraryOpen ? (
          <div className="space-y-2" aria-label="Lista READY Take">
            {libraryLoading ? (
              <p className="text-xs text-[var(--brd-mute)]">Wczytywanie…</p>
            ) : null}
            {libraryError ? (
              <p className="text-sm text-destructive" role="alert">
                {libraryError}
              </p>
            ) : null}
            {!libraryLoading && libraryTakes.length === 0 && !libraryError ? (
              <p className="text-xs text-[var(--brd-mute)]">
                Brak gotowych nagrań do umieszczenia.
              </p>
            ) : null}
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {libraryTakes.map((take) => (
                <li
                  key={take.id}
                  className="rounded border border-[var(--brd-line)] p-2"
                >
                  <p className="text-sm text-[var(--brd-ink)]">
                    {take.displayTitle}
                    {!take.sameBeat ? (
                      <span className="ml-1 text-[11px] text-[var(--brd-mute)]">
                        (inny bit)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-[var(--brd-mute)]">
                    {take.durationSeconds != null
                      ? `${take.durationSeconds.toFixed(1)}s`
                      : "—"}
                    {" · "}
                    playhead {formatStudioTimeMs(transport.state.playheadMs)}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      variant="outline"
                      disabled={libraryBusyId === take.id}
                      onClick={() => void onLibraryPreview(take.id)}
                    >
                      ▶ Odtwórz
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={
                        libraryBusyId === take.id ||
                        state.phase === "READY_TAKE" ||
                        !trackId
                      }
                      onClick={() => void onLibraryPlace(take)}
                    >
                      Umieść w Studio
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--brd-mute)]">
        Limit: {maxSeconds}s · istniejące limity konta i TTL pozostają w mocy.
        Usunięcie klipu nie usuwa nagrania źródłowego.
      </p>
    </section>
  );
}
