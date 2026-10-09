"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { BrdInputMonitor } from "@/components/brand/brd-input-monitor";
import { Button } from "@/components/ui/button";
import { useStudioTransport } from "@/components/studio/studio-transport-provider";
import { useMicAnalyser } from "@/hooks/use-mic-analyser";
import { useStudioInputDevices } from "@/hooks/use-studio-input-devices";
import { useStudioOutputDevices } from "@/hooks/use-studio-output-devices";
import type {
  StudioClipDto,
  StudioPlaceableTakeDto,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  acquireMicStream,
  stopMediaStreamTracks,
  studioDeviceErrorMessagePl,
} from "@/lib/studio/studio-input-devices";
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
import {
  STUDIO_VOCAL_IMPORT_ACCEPT,
  gateStudioVocalImportFile,
} from "@/lib/takes/studio-vocal-import";
import {
  classifyPersistHttpFailure,
  classifyPersistNetworkFailure,
  type StudioPersistExecutor,
  type StudioPersistResult,
} from "@/lib/studio/studio-persist-orchestrator";

type WorkflowActionBusy =
  | "preview"
  | "keep"
  | "discard"
  | "place"
  | "import"
  | null;

export function StudioRecordingPanel({
  projectId,
  getExpectedDocumentVersion,
  enqueuePersistAsync,
  tracks,
  onClipCreated,
  onRecordingActiveChange,
  embedded = false,
  /** Phase 7.1.3 — Studio selection SSOT; no third track store. */
  preferredTrackId = null,
}: {
  projectId: string;
  /** Phase 7.1.6 — read docRef version at executor start (not stale prop). */
  getExpectedDocumentVersion: () => number;
  /** Phase 7.1.6 — shared Studio persist boundary. */
  enqueuePersistAsync: (
    executor: StudioPersistExecutor,
  ) => Promise<StudioPersistResult>;
  tracks: StudioTrackDto[];
  onClipCreated: (clip: StudioClipDto, documentVersion: number) => void;
  onRecordingActiveChange?: (active: boolean) => void;
  /** Phase 1 — denser chrome when hosted inside Inspector. */
  embedded?: boolean;
  preferredTrackId?: string | null;
}) {
  const transport = useStudioTransport();
  const recordableTracks = tracks.filter((t) => t.trackType !== "BEAT");
  const trackChoices =
    recordableTracks.length > 0 ? recordableTracks : tracks;
  const defaultTrack =
    trackChoices.find((t) => t.recordArmed) ?? trackChoices[0];
  const preferredTrack =
    preferredTrackId && trackChoices.some((t) => t.id === preferredTrackId)
      ? preferredTrackId
      : null;

  /** Manual override is valid only for the preferredTrackId it was chosen against. */
  const [manualTrackId, setManualTrackId] = useState<string | null>(null);
  const [manualForPreferred, setManualForPreferred] = useState<string | null>(
    null,
  );
  const trackIdOverride =
    manualTrackId && manualForPreferred === (preferredTrackId ?? null)
      ? manualTrackId
      : null;
  const trackId =
    trackIdOverride ?? preferredTrack ?? defaultTrack?.id ?? "";
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
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [testerStream, setTesterStream] = useState<MediaStream | null>(null);
  const [testerError, setTesterError] = useState<string | null>(null);
  const [advancedMicOpen, setAdvancedMicOpen] = useState(false);
  /** Blocks tester re-acquire while arming recorder (closes dual-stream window). */
  const [captureArming, setCaptureArming] = useState(false);
  const captureArmingRef = useRef(false);
  const testerStreamRef = useRef<MediaStream | null>(null);

  const captureActive =
    state.phase === "RECORDING" ||
    state.phase === "STOPPING" ||
    state.phase === "UPLOADING" ||
    state.phase === "PROCESSING";

  const meterStream =
    state.phase === "RECORDING" || state.phase === "READY"
      ? micStream ?? testerStream
      : testerStream;
  const mic = useMicAnalyser(meterStream, { barCount: 32, hz: 15 });

  const inputDevices = useStudioInputDevices({
    recordingActive: captureActive,
  });

  const setOutputSinkId = transport.setOutputSinkId;
  const onSinkIdChange = useCallback(
    (sinkId: string | null) => {
      void setOutputSinkId(sinkId);
    },
    [setOutputSinkId],
  );
  const outputDevices = useStudioOutputDevices({ onSinkIdChange });

  // AUD-01 — auto live mic tester (reuse useMicAnalyser; hold stream, no Studio engine).
  useEffect(() => {
    let cancelled = false;
    const blockTester =
      captureArming ||
      state.phase === "REQUESTING_MIC" ||
      state.phase === "RECORDING" ||
      state.phase === "STOPPING" ||
      state.phase === "UPLOADING" ||
      state.phase === "PROCESSING" ||
      state.phase === "READY_TAKE";

    const selectedId = inputDevices.selectedDeviceId;
    const refreshInputs = inputDevices.refreshInputs;

    void (async () => {
      if (blockTester) {
        stopMediaStreamTracks(testerStreamRef.current);
        testerStreamRef.current = null;
        if (!cancelled) {
          setTesterStream(null);
          setTesterError(null);
        }
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        if (!cancelled) {
          setTesterError("Brak dostępu do mikrofonu w tej przeglądarce.");
        }
        return;
      }
      const result = await acquireMicStream({
        getUserMedia: navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        ),
        preferredDeviceId: selectedId,
      });
      if (cancelled || captureArmingRef.current) {
        if (result.ok) stopMediaStreamTracks(result.stream);
        return;
      }
      if (!result.ok) {
        stopMediaStreamTracks(testerStreamRef.current);
        testerStreamRef.current = null;
        setTesterStream(null);
        if (
          result.code === "DEVICE_PERMISSION_DENIED" ||
          result.code === "DEVICE_PERMISSION_BLOCKED"
        ) {
          setTesterError(
            "Brak dostępu do mikrofonu. Zezwól przeglądarce na dostęp i spróbuj ponownie.",
          );
        } else {
          setTesterError(studioDeviceErrorMessagePl(result.code));
        }
        return;
      }
      if (cancelled || captureArmingRef.current) {
        stopMediaStreamTracks(result.stream);
        return;
      }
      stopMediaStreamTracks(testerStreamRef.current);
      testerStreamRef.current = result.stream;
      setTesterStream(result.stream);
      setTesterError(null);
      void refreshInputs();
    })();

    return () => {
      cancelled = true;
      stopMediaStreamTracks(testerStreamRef.current);
      testerStreamRef.current = null;
    };
  }, [
    captureArming,
    state.phase,
    inputDevices.selectedDeviceId,
    inputDevices.refreshInputs,
  ]);

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

  function stopTesterStream() {
    stopMediaStreamTracks(testerStreamRef.current);
    testerStreamRef.current = null;
    setTesterStream(null);
    setTesterError(null);
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
    stopTesterStream();
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
    // AUD-01: arm before stop — effect must not re-open tester during recorder.start.
    captureArmingRef.current = true;
    setCaptureArming(true);
    stopTesterStream();
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
      captureArmingRef.current = false;
      setCaptureArming(false);
    } catch (error) {
      captureArmingRef.current = false;
      setCaptureArming(false);
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

  /**
   * Place READY take via existing CAS place route (mic Keep + vocal import).
   * On failure READY take remains; caller may surface workflow UI.
   */
  async function placeReadyTakeOnTimeline(params: {
    takeId: string;
    busy: Exclude<WorkflowActionBusy, null>;
    successMessage: string;
  }): Promise<boolean> {
    const takeId = params.takeId;
    const startMs = recordStartMsRef.current;
    const placeTrackId = captureTrackIdRef.current || trackIdRef.current;
    if (startMs == null || !placeTrackId) {
      setWorkflowError("Brak pozycji nagrania na osi czasu.");
      return false;
    }

    if (placedTakeIdsRef.current.has(takeId)) {
      setKeptMessage("Nagranie jest już na osi czasu.");
      transport.stopTakePreview();
      clearCapturePlacement();
      dispatch({ type: "RETRY_IDLE" });
      return true;
    }

    keepInFlightRef.current = true;
    setWorkflowBusy(params.busy);
    setWorkflowError(null);
    try {
      const result = await enqueuePersistAsync(async () => {
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
                expectedDocumentVersion: getExpectedDocumentVersion(),
              }),
            },
          );
          const placed = (await placeRes.json()) as {
            success?: boolean;
            clip?: StudioClipDto;
            reusedExisting?: boolean;
            documentVersion?: number;
            error?: string;
            code?: string;
          };
          if (!placeRes.ok || !placed.clip) {
            const message =
              placeRes.status === 409 ||
              placed.code === "FX_CHAIN_VERSION_CONFLICT"
                ? placed.error ?? "Projekt został zmieniony. Odśwież stronę."
                : placed.error?.includes("dostępne") ||
                    placed.error?.includes("READY") ||
                    placeRes.status === 403
                  ? "Nagranie nie jest już dostępne."
                  : placed.error ??
                    "Nie udało się umieścić nagrania na osi czasu.";
            return classifyPersistHttpFailure({
              status: placeRes.status,
              message,
              code: placed.code,
            });
          }
          const clip = placed.clip;
          const nextVersion =
            typeof placed.documentVersion === "number"
              ? placed.documentVersion
              : getExpectedDocumentVersion();
          const reused = Boolean(placed.reusedExisting);
          return {
            ok: true as const,
            documentVersion: nextVersion,
            apply: () => {
              placedTakeIdsRef.current.add(takeId);
              if (!reused) {
                onClipCreated(clip, nextVersion);
              }
            },
          };
        } catch {
          return classifyPersistNetworkFailure(
            "Nie udało się umieścić nagrania na osi czasu.",
          );
        }
      });
      if (!result.ok) {
        setWorkflowError(result.message);
        return false;
      }
      transport.stopTakePreview();
      clearCapturePlacement();
      setKeptMessage(params.successMessage);
      dispatch({ type: "RETRY_IDLE" });
      return true;
    } catch {
      setWorkflowError("Nie udało się umieścić nagrania na osi czasu.");
      return false;
    } finally {
      keepInFlightRef.current = false;
      setWorkflowBusy(null);
    }
  }

  async function onKeepWorkflowTake() {
    if (!state.takeId || keepInFlightRef.current) return;
    await placeReadyTakeOnTimeline({
      takeId: state.takeId,
      busy: "keep",
      successMessage: "Nagranie zachowane na osi czasu.",
    });
  }

  async function onImportVocalFile(file: File) {
    if (
      submittingRef.current ||
      keepInFlightRef.current ||
      workflowBusy ||
      isRecordingBusy(state.phase) ||
      state.phase === "READY_TAKE"
    ) {
      return;
    }
    if (!trackIdRef.current) {
      setWorkflowError("Wybierz ścieżkę wokalu przed importem.");
      return;
    }

    const gate = gateStudioVocalImportFile(file);
    if (!gate.ok) {
      setWorkflowError(gate.message);
      return;
    }

    submittingRef.current = true;
    setWorkflowBusy("import");
    setWorkflowError(null);
    setKeptMessage(null);
    transport.stopTakePreview();

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
        setWorkflowError(
          toUserFacingTakeUploadError(
            elig.error ?? "Nie udało się sprawdzić limitu nagrań.",
          ),
        );
        return;
      }
      if (!elig.allowed) {
        const parts = [elig.message ?? "Nie możesz teraz importować nagrania."];
        if (elig.upgradeHintMessage) parts.push(elig.upgradeHintMessage);
        setWorkflowError(parts.join(" "));
        return;
      }
      if (
        typeof elig.maxRecordingSeconds === "number" &&
        elig.maxRecordingSeconds > 0
      ) {
        setMaxSeconds(Math.floor(elig.maxRecordingSeconds));
      }

      const startMs = transport.state.playheadMs;
      setRecordStartMs(startMs);
      recordStartMsRef.current = startMs;
      captureTrackIdRef.current = trackIdRef.current;

      dispatch({ type: "UPLOAD_START" });
      const uploaded = await uploadTakeRecordingBlob({
        beatId: resolvedBeatId,
        blob: file,
        contentType: gate.contentType,
      });
      dispatch({ type: "FINALIZE_START" });
      dispatch({
        type: "TAKE_READY",
        takeId: uploaded.takeId,
        previewUrl: null,
        takeDurationSeconds: uploaded.durationSeconds,
      });

      const placed = await placeReadyTakeOnTimeline({
        takeId: uploaded.takeId,
        busy: "import",
        successMessage: "Wokal zaimportowany na oś czasu.",
      });
      if (!placed) {
        // READY take kept — user can Zachowaj from workflow panel.
        setKeptMessage(null);
      }
    } catch (error) {
      clearCapturePlacement();
      const raw =
        error instanceof Error
          ? error.message
          : "Nie udało się zaimportować pliku audio.";
      const message = toUserFacingTakeUploadError(raw);
      if (/finaliz|duration|READY|MIME|probe/i.test(raw)) {
        dispatch({ type: "FINALIZE_FAILED", message });
      } else if (/upload|przesł/i.test(raw)) {
        dispatch({ type: "UPLOAD_FAILED", message });
      } else {
        setWorkflowError(message);
        dispatch({ type: "RETRY_IDLE" });
      }
    } finally {
      submittingRef.current = false;
      setWorkflowBusy(null);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = "";
      }
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
      const placeTrackId = trackIdRef.current;
      const timelineStartMs = transport.state.playheadMs;
      const result = await enqueuePersistAsync(async () => {
        try {
          const placeRes = await fetch(
            `/api/studio/projects/${projectId}/record/place`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                trackId: placeTrackId,
                takeId: take.id,
                timelineStartMs,
                expectedDocumentVersion: getExpectedDocumentVersion(),
              }),
            },
          );
          const placed = (await placeRes.json()) as {
            success?: boolean;
            clip?: StudioClipDto;
            reusedExisting?: boolean;
            documentVersion?: number;
            error?: string;
            code?: string;
          };
          if (!placeRes.ok || !placed.clip) {
            const message =
              placeRes.status === 409 ||
              placed.code === "FX_CHAIN_VERSION_CONFLICT"
                ? placed.error ?? "Projekt został zmieniony. Odśwież stronę."
                : placed.error?.includes("dostępne") || placeRes.status === 403
                  ? "Nagranie nie jest już dostępne."
                  : placed.error ??
                    "Nie udało się umieścić nagrania na osi czasu.";
            return classifyPersistHttpFailure({
              status: placeRes.status,
              message,
              code: placed.code,
            });
          }
          const clip = placed.clip;
          const nextVersion =
            typeof placed.documentVersion === "number"
              ? placed.documentVersion
              : getExpectedDocumentVersion();
          const reused = Boolean(placed.reusedExisting);
          return {
            ok: true as const,
            documentVersion: nextVersion,
            apply: () => {
              if (!reused) {
                onClipCreated(clip, nextVersion);
              }
            },
          };
        } catch {
          return classifyPersistNetworkFailure(
            "Nie udało się umieścić nagrania na osi czasu.",
          );
        }
      });
      if (!result.ok) {
        setLibraryError(result.message);
        return;
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
      className={
        embedded
          ? "space-y-2 border-0 bg-transparent p-0"
          : "space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
      }
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
          onChange={(e) => {
            setManualTrackId(e.target.value);
            setManualForPreferred(preferredTrackId ?? null);
          }}
          aria-label="Wybierz ścieżkę"
        >
          {trackChoices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">Mikrofon</p>
        <p className="text-xs text-[var(--brd-mute)]">Źródło nagrywania</p>
        <label className="block w-full text-xs text-[var(--brd-mute)]">
          <span className="sr-only">Mikrofon</span>
          <select
            className="mt-1 w-full max-w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
            value={inputDevices.selectedDeviceId ?? ""}
            disabled={
              state.phase === "RECORDING" ||
              state.phase === "READY_TAKE" ||
              state.phase === "REQUESTING_MIC"
            }
            onChange={(e) => {
              inputDevices.setSelectedDeviceId(
                e.target.value === "" ? null : e.target.value,
              );
              inputDevices.clearSoftNotice();
            }}
            aria-label="Wybierz mikrofon"
          >
            <option value="">
              Automatycznie — urządzenie systemowe
            </option>
            {!advancedMicOpen &&
            inputDevices.selectedDeviceId &&
            inputDevices.inputs.some(
              (d) => d.deviceId === inputDevices.selectedDeviceId,
            )
              ? inputDevices.inputs
                  .filter((d) => d.deviceId === inputDevices.selectedDeviceId)
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))
              : null}
            {advancedMicOpen
              ? inputDevices.inputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              : null}
          </select>
        </label>
        {inputDevices.inputs.length > 1 ? (
          <button
            type="button"
            className="text-xs text-[var(--brd-green)] underline-offset-2 hover:underline"
            onClick={() => setAdvancedMicOpen((v) => !v)}
          >
            {advancedMicOpen
              ? "Ukryj zaawansowane urządzenia"
              : "Zaawansowane ustawienia audio"}
          </button>
        ) : null}
        {inputDevices.permission === "UNAVAILABLE" ||
        inputDevices.lastErrorCode === "NO_INPUT_DEVICE" ? (
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            Brak wykrytego mikrofonu. Połącz urządzenie lub przyznaj dostęp.
          </p>
        ) : null}
        {inputDevices.softNotice ? (
          <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
            {inputDevices.softNotice}
          </p>
        ) : null}

        <div className="w-full space-y-1 pt-1">
          <p className="text-xs text-[var(--brd-mute)]">Test mikrofonu</p>
          {testerError ? (
            <p className="text-xs text-destructive" role="alert">
              {testerError}
            </p>
          ) : meterStream ? (
            <>
              <p className="text-xs text-[var(--brd-ink)]" role="status">
                {mic.level === "silent"
                  ? "Brak sygnału — sprawdź mikrofon"
                  : mic.level === "quiet"
                    ? "Sygnał jest bardzo słaby"
                    : mic.level === "clip" || mic.level === "hot"
                      ? "Uwaga: sygnał blisko przesterowania"
                      : "Mikrofon działa"}
              </p>
              <BrdInputMonitor level={mic.level} peak={mic.peak} />
            </>
          ) : (
            <p className="text-xs text-[var(--brd-mute)]" role="status">
              Oczekiwanie na uprawnienia…
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">Odsłuch</p>
        {outputDevices.pickerEnabled ? (
          <label className="block w-full text-xs text-[var(--brd-mute)]">
            Urządzenie
            <select
              className="mt-1 w-full max-w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
              value={outputDevices.selectedDeviceId ?? ""}
              onChange={(e) => {
                outputDevices.setSelectedDeviceId(
                  e.target.value === "" ? null : e.target.value,
                );
              }}
              aria-label="Wybierz urządzenie odsłuchu"
            >
              <option value="">Automatyczne — urządzenie systemowe</option>
              {outputDevices.outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            Automatyczny — urządzenie systemowe. Wybór urządzenia wyjściowego
            jest kontrolowany przez system lub przeglądarkę.
          </p>
        )}
        {outputDevices.softNotice ? (
          <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
            {outputDevices.softNotice}
          </p>
        ) : null}
      </div>

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
          <input
            ref={importFileInputRef}
            type="file"
            accept={STUDIO_VOCAL_IMPORT_ACCEPT}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportVocalFile(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            variant="outline"
            disabled={
              primaryDisabled ||
              workflowBusy === "import" ||
              !canStartNewRecording(state.phase) ||
              state.phase === "READY" ||
              state.phase === "REQUESTING_MIC"
            }
            onClick={() => importFileInputRef.current?.click()}
            aria-label="Importuj gotowy plik wokalu"
          >
            {workflowBusy === "import" ||
            state.phase === "UPLOADING" ||
            state.phase === "PROCESSING"
              ? "Importowanie…"
              : "Importuj wokal"}
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
