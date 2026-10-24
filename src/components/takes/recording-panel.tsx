"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type RefObject } from "react";

import { BrdInputMonitor } from "@/components/brand/brd-input-monitor";
import { BrdLiveMicWaveform } from "@/components/brand/brd-live-mic-waveform";
import { BrdTakePreviewRail } from "@/components/brand/brd-take-preview-rail";
import { Waveform } from "@/components/brand/waveform";
import { Button } from "@/components/ui/button";
import type { PlaybackShellHandle } from "@/components/player/playback-shell";
import { usePlayerOptional } from "@/components/player/player-provider";
import { useMicAnalyser } from "@/hooks/use-mic-analyser";
import { formatDurationSeconds } from "@/lib/beats/public";
import { cn } from "@/lib/utils";
import {
  TakeMediaRecorder,
  TakeRecorderError,
  detectMediaRecorderSupport,
} from "@/lib/takes/media-recorder";
import {
  TakeReplaceRequiredError,
  toUserFacingTakeUploadError,
  uploadAnonTakeRecordingBlob,
  uploadTakeRecordingBlob,
  type TakeUploadStage,
} from "@/lib/takes/client-upload";
import type { ReplaceableTakeSummary } from "@/lib/takes/claim-errors";
import {
  canStartNewRecording,
  createInitialRecordingUiSnapshot,
  displayMaxRecordingSeconds,
  isRecordingBusy,
  reduceRecordingUi,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";
import {
  TakeRecoveryLeaseLostError,
  createTakeRecoveryChunkBuffer,
  createTakeRecoveryWriter,
  takeRecoveryWriterStatusPl,
  type TakeRecoveryWriter,
  type TakeRecoveryWriterState,
} from "@/lib/takes/take-recording-recovery";
import {
  getBrowserTakeRecoveryStore,
  getTakeRecoveryTabClaimant,
  getTakeRecoveryViewerUserId,
} from "@/lib/takes/take-recording-recovery-idb";
import { TakeRecordingRecoveryBanner } from "@/components/takes/take-recording-recovery-banner";

const LOCALLY_SECURED_SUFFIX_PL =
  " Nagranie jest zabezpieczone lokalnie — możesz je odzyskać.";

type RecordingPanelProps = {
  beatId: string;
  beatTitle?: string;
  beatDurationSeconds: number;
  /** Server SSOT max — client timer must not exceed this. */
  maxRecordingSeconds: number;
  isAuthenticated: boolean;
  beatStatus: string;
  playbackRef: RefObject<PlaybackShellHandle | null>;
  className?: string;
};

async function fetchTakePreviewUrl(
  takeId: string,
  anonymous: boolean,
): Promise<string> {
  const res = await fetch(
    anonymous ? "/api/takes/anon/preview" : "/api/takes/preview",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId }),
    },
  );
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
  beatTitle = "Bit",
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
  const isAuthenticatedRef = useRef(isAuthenticated);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [takeBlob, setTakeBlob] = useState<Blob | null>(null);
  const [takeMime, setTakeMime] = useState<string | null>(null);
  const [replaceCandidates, setReplaceCandidates] = useState<
    ReplaceableTakeSummary[] | null
  >(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const recoveryWriterRef = useRef<TakeRecoveryWriter | null>(null);
  /** Copy kept (with its lease) while the user picks a take to replace. */
  const replaceWriterRef = useRef<TakeRecoveryWriter | null>(null);
  const mountedRef = useRef(true);
  const [localSafety, setLocalSafety] =
    useState<TakeRecoveryWriterState | null>(null);
  const [recoveryRefreshKey, setRecoveryRefreshKey] = useState(0);
  const mic = useMicAnalyser(micStream, { barCount: 48, hz: 15 });

  function bumpRecoveryList() {
    if (mountedRef.current) setRecoveryRefreshKey((key) => key + 1);
  }

  function sealInterruptedRecovery(
    writer: TakeRecoveryWriter,
    stopped: Promise<void>,
  ) {
    void stopped
      .then(() => writer.finish("INTERRUPTED", 5_000))
      .then(bumpRecoveryList);
  }

  function releaseReplaceWriter() {
    const writer = replaceWriterRef.current;
    replaceWriterRef.current = null;
    if (writer) void writer.release().then(bumpRecoveryList);
  }
  const recProgress =
    maxSeconds > 0 ? Math.min(1, state.elapsedMs / (maxSeconds * 1000)) : 0;

  function clearMicMonitor() {
    setMicStream(null);
  }

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  const globalPlayer = usePlayerOptional();
  useEffect(() => {
    const busy =
      state.phase === "REQUESTING_MIC" ||
      state.phase === "READY" ||
      state.phase === "RECORDING" ||
      state.phase === "STOPPING" ||
      state.phase === "UPLOADING" ||
      state.phase === "PROCESSING";
    globalPlayer?.setSuppressed(busy);
    return () => globalPlayer?.setSuppressed(false);
  }, [state.phase, globalPlayer]);

  useEffect(() => {
    beatIdRef.current = beatId;
    maxSecondsRef.current = maxSeconds;
    isAuthenticatedRef.current = isAuthenticated;
  }, [beatId, maxSeconds, isAuthenticated]);

  useEffect(() => {
    const playback = playbackRef.current;
    mountedRef.current = true;
    void getBrowserTakeRecoveryStore().catch(() => null);
    return () => {
      mountedRef.current = false;
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      clearMicMonitor();
      const writer = recoveryWriterRef.current;
      recoveryWriterRef.current = null;
      let stopped: Promise<void> = Promise.resolve();
      try {
        stopped = recorderRef.current?.cancel() ?? stopped;
      } catch {
        // ignore
      }
      // Leaving mid-capture: keep what was recorded for recovery on return.
      if (writer) sealInterruptedRecovery(writer, stopped.catch(() => undefined));
      const replaceWriter = replaceWriterRef.current;
      replaceWriterRef.current = null;
      if (replaceWriter) void replaceWriter.release();
      playback?.setControlsLocked(false);
    };
    // sealInterruptedRecovery only touches refs and the mounted-guarded setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRef]);

  useEffect(() => {
    // D02: anonymous Quick Take is allowed on PUBLISHED — no AUTH_REQUIRED blocker.
    if (beatStatus !== "PUBLISHED") {
      dispatch({ type: "BEAT_INELIGIBLE" });
    }
  }, [beatStatus]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      if (phaseRef.current !== "RECORDING") return;
      void stopAndUpload();
    }
    function onPageHide() {
      if (phaseRef.current !== "RECORDING") return;
      void stopAndUpload();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
    // stopAndUpload reads phaseRef / submittingRef — stable enough for mount listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function armMicrophone() {
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

    // P4.1 — server eligibility BEFORE microphone permission / MediaRecorder.
    dispatch({ type: "REQUEST_MIC" });
    setTakeBlob(null);
    setReplaceCandidates(null);
    releaseReplaceWriter();
    try {
      const eligRes = await fetch("/api/takes/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId: beatIdRef.current }),
      });
      const elig = (await eligRes.json()) as {
        success?: boolean;
        allowed?: boolean;
        message?: string;
        upgradeHintMessage?: string | null;
        upgradeHintTier?: string | null;
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
        dispatch({
          type: "RECORDING_FAILED",
          message: parts.join(" "),
        });
        return;
      }
    } catch (error) {
      dispatch({
        type: "RECORDING_FAILED",
        message: toUserFacingTakeUploadError(
          error instanceof Error
            ? error.message
            : "Nie udało się sprawdzić limitu nagrań.",
        ),
      });
      return;
    }

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
        message: toUserFacingTakeUploadError(
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić mikrofonu.",
        ),
      });
    }
  }

  async function stopAndUpload() {
    if (submittingRef.current) return;
    if (phaseRef.current !== "RECORDING") return;
    submittingRef.current = true;
    clearTick();
    clearMicMonitor();
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

    const writer = recoveryWriterRef.current;
    let locallySecured = false;
    try {
      const result = await recorder.stop();
      recoveryWriterRef.current = null;
      locallySecured = writer ? await writer.finish("COMPLETE", 3_000) : false;
      setTakeBlob(result.blob);
      setTakeMime(result.mimeType);
      dispatch({ type: "UPLOAD_START" });
      try {
        const onStage = (stage: TakeUploadStage) =>
          writer?.noteStage(stage.stage, stage.takeId);
        const uploaded = isAuthenticatedRef.current
          ? await uploadTakeRecordingBlob({
              beatId: beatIdRef.current,
              blob: result.blob,
              contentType: result.mimeType,
              onStage,
            })
          : await uploadAnonTakeRecordingBlob({
              beatId: beatIdRef.current,
              blob: result.blob,
              contentType: result.mimeType,
              onStage,
            });
        if (writer) {
          await writer.confirmSaved(uploaded.takeId);
          bumpRecoveryList();
        }
        setReplaceCandidates(null);
        dispatch({ type: "FINALIZE_START" });
        let previewUrl: string | null = null;
        try {
          previewUrl = await fetchTakePreviewUrl(
            uploaded.takeId,
            !isAuthenticatedRef.current,
          );
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
        if (error instanceof TakeRecoveryLeaseLostError) {
          // Another tab owns the copy now — it finalizes; this tab must not.
          bumpRecoveryList();
          dispatch({ type: "UPLOAD_FAILED", message: error.message });
        } else if (error instanceof TakeReplaceRequiredError) {
          if (writer) replaceWriterRef.current = writer;
          setReplaceCandidates(error.replaceableTakes);
          dispatch({
            type: "UPLOAD_FAILED",
            message: toUserFacingTakeUploadError(error.message),
          });
        } else {
          if (writer) {
            await writer.release();
            bumpRecoveryList();
          }
          const raw =
            error instanceof Error
              ? error.message
              : "Nie udało się przesłać ani sfinalizować nagrania.";
          const message =
            toUserFacingTakeUploadError(raw) +
            (locallySecured ? LOCALLY_SECURED_SUFFIX_PL : "");
          if (/expired|wygas/i.test(raw) || /wygas/i.test(message)) {
            dispatch({ type: "EXPIRED", message });
          } else if (
            /finaliz|duration|fail-closed|Duration|READY|MIME|missing|sfinaliz/i.test(
              raw,
            )
          ) {
            dispatch({ type: "FINALIZE_FAILED", message });
          } else {
            dispatch({ type: "UPLOAD_FAILED", message });
          }
        }
      }
    } catch (error) {
      if (error instanceof TakeRecorderError && error.code === "CANCELLED") {
        dispatch({ type: "RETRY_IDLE" });
      } else {
        // Stop failed: whatever reached the copy stays recoverable.
        if (writer && recoveryWriterRef.current === writer) {
          recoveryWriterRef.current = null;
          sealInterruptedRecovery(writer, Promise.resolve());
        }
        dispatch({
          type: "RECORDING_FAILED",
          message: toUserFacingTakeUploadError(
            error instanceof Error
              ? error.message
              : "Błąd zatrzymania nagrania.",
          ),
        });
      }
    } finally {
      playbackRef.current?.setControlsLocked(false);
      submittingRef.current = false;
      recorderRef.current = null;
      if (mountedRef.current) setLocalSafety(null);
    }
  }

  async function startCapture() {
    if (phaseRef.current !== "READY" || submittingRef.current) return;
    submittingRef.current = true;
    playbackRef.current?.setControlsLocked(true);

    const recorder = recorderRef.current ?? new TakeMediaRecorder();
    recorderRef.current = recorder;
    const authenticated = isAuthenticatedRef.current;
    const [recoveryStore, ownerUserId] = await Promise.all([
      getBrowserTakeRecoveryStore().catch(() => null),
      getTakeRecoveryViewerUserId(authenticated),
    ]);
    if (!mountedRef.current) {
      submittingRef.current = false;
      return;
    }
    const chunkBuffer = createTakeRecoveryChunkBuffer();

    try {
      const started = await recorder.start({ onChunk: chunkBuffer.onChunk });
      if (!mountedRef.current) {
        await recorder.cancel().catch(() => undefined);
        throw new TakeRecorderError("CANCELLED", "Panel closed.");
      }
      const writer = createTakeRecoveryWriter({
        // Signed in but account unknown: ownership unverifiable, keep no copy.
        store: ownerUserId === undefined ? null : recoveryStore,
        recoveryId: crypto.randomUUID(),
        claimant: getTakeRecoveryTabClaimant(),
        surface: "QUICK_TAKE",
        projectId: null,
        ownerUserId: ownerUserId ?? null,
        beatId: beatIdRef.current,
        mimeType: started.mimeType,
        maxRecordingSeconds: maxSecondsRef.current,
        onStateChange: (next) => {
          if (mountedRef.current) setLocalSafety(next);
        },
      });
      chunkBuffer.attach(writer);
      recoveryWriterRef.current = writer;
      setLocalSafety(writer.state);
      setMicStream(recorder.getStream());
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
      clearMicMonitor();
      playbackRef.current?.stopPlayback();
      playbackRef.current?.setControlsLocked(false);
      const writer = recoveryWriterRef.current;
      recoveryWriterRef.current = null;
      setLocalSafety(null);
      if (writer) void writer.discard();
      try {
        void recorder.cancel().catch(() => undefined);
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
        dispatch({
          type: "UNSUPPORTED",
          message: toUserFacingTakeUploadError(error.message),
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

  function cancelAll() {
    clearTick();
    clearMicMonitor();
    setTakeBlob(null);
    setTakeMime(null);
    setReplaceCandidates(null);
    // Explicit cancel mid-capture = conscious discard of the local copy;
    // a finished take awaiting replace choice stays recoverable.
    const writer = recoveryWriterRef.current;
    recoveryWriterRef.current = null;
    setLocalSafety(null);
    if (writer) void writer.discard();
    releaseReplaceWriter();
    try {
      void recorderRef.current?.cancel().catch(() => undefined);
    } catch {
      // ignore
    }
    recorderRef.current = null;
    playbackRef.current?.stopPlayback();
    playbackRef.current?.setControlsLocked(false);
    submittingRef.current = false;
    dispatch({ type: "RETRY_IDLE" });
  }

  async function confirmReplace(replaceTakeId: string) {
    if (!takeBlob || replaceBusy || submittingRef.current) return;
    setReplaceBusy(true);
    submittingRef.current = true;
    dispatch({ type: "UPLOAD_START" });
    const writer = replaceWriterRef.current;
    replaceWriterRef.current = null;
    try {
      const onStage = (stage: TakeUploadStage) =>
        writer?.noteStage(stage.stage, stage.takeId);
      const uploaded = isAuthenticatedRef.current
        ? await uploadTakeRecordingBlob({
            beatId: beatIdRef.current,
            blob: takeBlob,
            contentType: takeMime ?? takeBlob.type ?? "audio/webm",
            replaceTakeId,
            onStage,
          })
        : await uploadAnonTakeRecordingBlob({
            beatId: beatIdRef.current,
            blob: takeBlob,
            contentType: takeMime ?? takeBlob.type ?? "audio/webm",
            replaceTakeId,
            onStage,
          });
      if (writer) {
        await writer.confirmSaved(uploaded.takeId);
        bumpRecoveryList();
      }
      setReplaceCandidates(null);
      dispatch({ type: "FINALIZE_START" });
      let previewUrl: string | null = null;
      try {
        previewUrl = await fetchTakePreviewUrl(
          uploaded.takeId,
          !isAuthenticatedRef.current,
        );
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
      if (error instanceof TakeRecoveryLeaseLostError) {
        bumpRecoveryList();
        dispatch({ type: "UPLOAD_FAILED", message: error.message });
      } else if (error instanceof TakeReplaceRequiredError) {
        if (writer) replaceWriterRef.current = writer;
        setReplaceCandidates(error.replaceableTakes);
        dispatch({
          type: "UPLOAD_FAILED",
          message: toUserFacingTakeUploadError(error.message),
        });
      } else {
        if (writer) {
          await writer.release();
          bumpRecoveryList();
        }
        dispatch({
          type: "UPLOAD_FAILED",
          message:
            toUserFacingTakeUploadError(
              error instanceof Error
                ? error.message
                : "Nie udało się zastąpić nagrania.",
            ) + (writer ? LOCALLY_SECURED_SUFFIX_PL : ""),
        });
      }
    } finally {
      setReplaceBusy(false);
      submittingRef.current = false;
    }
  }

  async function showRecoveredTake(takeId: string) {
    if (!mountedRef.current || !canStartNewRecording(phaseRef.current)) return;
    setTakeBlob(null);
    setReplaceCandidates(null);
    let previewUrl: string | null = null;
    try {
      previewUrl = await fetchTakePreviewUrl(takeId, !isAuthenticatedRef.current);
    } catch {
      previewUrl = null;
    }
    if (!mountedRef.current || !canStartNewRecording(phaseRef.current)) return;
    dispatch({
      type: "TAKE_READY",
      takeId,
      previewUrl,
      takeDurationSeconds: null,
    });
  }

  async function refreshPreview() {
    if (!state.takeId) return;
    setPreviewBusy(true);
    try {
      const url = await fetchTakePreviewUrl(
        state.takeId,
        !isAuthenticatedRef.current,
      );
      dispatch({ type: "PREVIEW_URL", previewUrl: url });
    } catch (error) {
      dispatch({
        type: "FINALIZE_FAILED",
        message: toUserFacingTakeUploadError(
          error instanceof Error ? error.message : "Podgląd niedostępny.",
        ),
      });
    } finally {
      setPreviewBusy(false);
    }
  }

  const busy = isRecordingBusy(state.phase);
  const elapsedSec = Math.floor(state.elapsedMs / 1000);

  const stepPrep =
    state.phase === "IDLE" ||
    state.phase === "REQUESTING_MIC" ||
    state.phase === "READY" ||
    state.phase === "AUTH_REQUIRED" ||
    state.phase === "BEAT_NOT_ELIGIBLE" ||
    state.phase === "MIC_DENIED" ||
    state.phase === "UNSUPPORTED" ||
    state.phase === "RECORDING_ERROR" ||
    state.phase === "UPLOAD_ERROR" ||
    state.phase === "FINALIZE_ERROR" ||
    state.phase === "EXPIRED";
  const stepRec =
    state.phase === "RECORDING" || state.phase === "STOPPING";
  const stepSend =
    state.phase === "UPLOADING" || state.phase === "PROCESSING";
  const stepReady = state.phase === "READY_TAKE";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 sm:p-5",
        className,
      )}
      role="region"
      aria-label="Nagrywanie"
      data-recording-phase={state.phase}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="brd-display text-lg font-semibold tracking-tight text-[var(--brd-ink)]">
            Quick Take
          </p>
          <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
            Limit {formatDurationSeconds(maxSeconds)}
            {isAuthenticated ? " · konto" : " · gość"}
          </p>
        </div>
        <ol
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-[var(--brd-line)] py-2"
          aria-label="Rytm sesji nagrywania"
        >
          <li
            className="brd-session-step"
            data-active={stepPrep ? "true" : undefined}
            aria-current={stepPrep ? "step" : undefined}
          >
            1 · Mic
          </li>
          <li aria-hidden className="text-[var(--brd-line)]">
            /
          </li>
          <li
            className="brd-session-step"
            data-active={stepRec ? "true" : undefined}
            data-rec={stepRec ? "true" : undefined}
            aria-current={stepRec ? "step" : undefined}
          >
            2 · REC
          </li>
          <li aria-hidden className="text-[var(--brd-line)]">
            /
          </li>
          <li
            className="brd-session-step"
            data-active={stepSend ? "true" : undefined}
            aria-current={stepSend ? "step" : undefined}
          >
            3 · Wysyłka
          </li>
          <li aria-hidden className="text-[var(--brd-line)]">
            /
          </li>
          <li
            className="brd-session-step"
            data-active={stepReady ? "true" : undefined}
            aria-current={stepReady ? "step" : undefined}
          >
            4 · Take
          </li>
        </ol>
      </div>

      <TakeRecordingRecoveryBanner
        surface="QUICK_TAKE"
        scopeId={beatId}
        authenticated={isAuthenticated}
        refreshKey={recoveryRefreshKey}
        hidden={busy || replaceCandidates != null}
        onSaved={(takeId) => void showRecoveredTake(takeId)}
      />

      {state.phase === "AUTH_REQUIRED" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Aby nagrywać dłużej,{" "}
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
        <p className="text-sm text-[var(--brd-ink-soft)]" role="status">
          Mikrofon gotowy. Nagranie wystartuje razem z bit’em od początku —
          trzymaj limit w polu widzenia.
        </p>
      ) : null}

      {state.phase === "RECORDING" ? (
        <div className="space-y-3">
          <div
            className="flex flex-wrap items-center justify-between gap-3 border border-[var(--brd-rec)]/40 bg-[color-mix(in_srgb,var(--brd-rec)_8%,transparent)] px-3 py-2"
            role="status"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-block size-2.5 animate-pulse bg-[var(--brd-rec)] motion-reduce:animate-none"
                aria-hidden
              />
              <span className="brd-meta text-sm font-medium text-[var(--brd-rec)]">
                REC {formatDurationSeconds(elapsedSec)} /{" "}
                {formatDurationSeconds(maxSeconds)}
              </span>
            </div>
            <span className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
              Limit sesji
            </span>
          </div>

          <div className="space-y-2">
            <p className="brd-meta text-[9px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
              Przebieg bitu
            </p>
            <Waveform
              seed={beatId}
              progress={recProgress}
              density="studio"
              showPlayhead
              aria-label="Przebieg bitu podczas nagrywania"
            />
          </div>

          <div className="space-y-2">
            <p className="brd-meta text-[9px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
              Przebieg mikrofonu
            </p>
            <BrdLiveMicWaveform bars={mic.bars} progress={recProgress} />
          </div>

          <BrdInputMonitor level={mic.level} peak={mic.peak} />
          {localSafety ? (
            <p
              className={
                localSafety === "UNAVAILABLE"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
              data-testid="take-local-safety"
              data-state={localSafety}
            >
              {takeRecoveryWriterStatusPl(localSafety)}
            </p>
          ) : null}
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
          <p className="text-sm font-medium text-[var(--brd-ink)]" role="status">
            Take gotowy — podgląd poniżej
            {state.takeDurationSeconds != null
              ? ` · ${formatDurationSeconds(state.takeDurationSeconds)}`
              : ""}
          </p>
          {state.previewUrl ? (
            <BrdTakePreviewRail
              beatId={beatId}
              beatTitle={beatTitle}
              takePreviewUrl={state.previewUrl}
              takeBlob={takeBlob}
              takeDurationSeconds={state.takeDurationSeconds}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={previewBusy}
              onClick={() => void refreshPreview()}
              className="min-h-11"
            >
              {previewBusy ? "Ładowanie podglądu…" : "Załaduj podgląd"}
            </Button>
          )}
          {!isAuthenticated ? (
            <p className="text-sm text-muted-foreground" role="status">
              Zapisz na dłużej —{" "}
              <Link
                href="/sign-up"
                className="underline underline-offset-4 hover:text-foreground"
              >
                załóż konto
              </Link>{" "}
              lub{" "}
              <Link
                href="/sign-in"
                className="underline underline-offset-4 hover:text-foreground"
              >
                zaloguj się
              </Link>
              . Gościnne nagranie wygasa po 2h. Po zalogowaniu gotowe nagranie
              może zostać zapisane na Twoim koncie.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.error &&
      state.phase !== "AUTH_REQUIRED" &&
      state.phase !== "BEAT_NOT_ELIGIBLE" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      {replaceCandidates && replaceCandidates.length > 0 && takeBlob ? (
        <div
          className="space-y-2 rounded border border-[var(--brd-line)] p-3"
          role="group"
          aria-label="Zastąp istniejące nagranie"
        >
          <p className="text-sm text-[var(--brd-ink)]">
            Masz pełny limit zapisanych nagrań. Wybierz, które zastąpić nowym
            nagraniem:
          </p>
          <ul className="space-y-2">
            {replaceCandidates.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-[var(--brd-mute)]">
                  {t.beatTitle ?? "Bit"} · {t.durationSeconds ?? "?"}s
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={replaceBusy || busy}
                  onClick={() => void confirmReplace(t.id)}
                  className="min-h-10"
                >
                  Zastąp
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : replaceCandidates && replaceCandidates.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]" role="status">
          Brak własnych nagrań gotowych do zastąpienia. Usuń nagranie w Studio
          albo poczekaj na wygaśnięcie.
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
              Rozpocznij
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
              Zatrzymaj
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
