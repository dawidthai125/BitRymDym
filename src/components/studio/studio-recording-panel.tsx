"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useTranslations } from "next-intl";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { BrdInputMonitor } from "@/components/brand/brd-input-monitor";
import { Button } from "@/components/ui/button";
import { StudioMarkersPanel } from "@/components/studio/studio-markers-panel";
import { StudioScratchPanel } from "@/components/studio/studio-scratch-panel";
import { useStudioTransport } from "@/components/studio/studio-transport-provider";
import { copyCatalogAndPlaceStudioClip } from "@/lib/studio/studio-scratch-place";
import { useMicAnalyser } from "@/hooks/use-mic-analyser";
import { useStudioInputDevices } from "@/hooks/use-studio-input-devices";
import { useStudioOutputDevices } from "@/hooks/use-studio-output-devices";
import type {
  StudioClipDto,
  StudioPlaceableTakeDto,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import {
  STUDIO_COUNT_IN_BARS,
  countInDurationMs,
  countInSeekMs,
  normalizePunchWindow,
  shouldAutoStopPunch,
  type StudioCountInBars,
} from "@/lib/studio/studio-daw-clock";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  StudioCountdown,
  StudioLatencyCard,
  StudioRecModeCard,
  StudioTakeLanesCard,
  contextLatencyEstimate,
  useStudioLatency,
  useTakeLanes,
  type CalibrationUi,
  type RecToolsMode,
} from "@/components/studio/studio-recording-tools";
import type { BitekBubble } from "@/components/studio/studio-bitek-dock";
import { runLatencyCalibration } from "@/lib/studio/recording/calibration-runner";
import {
  CLAP_CALIBRATION,
  CLICK_CALIBRATION,
  renderCalibrationClick,
} from "@/lib/studio/recording/latency";
import {
  alignedPlacement,
  buildCapturedPasses,
  loopPassStarts,
  prerollCountdown,
  punchLineWindow,
  recordingPositionOf,
  sectionLines,
  sectionRange,
  type MsRange,
  type PlayheadSample,
  type SectionBars,
} from "@/lib/studio/recording/section-loop";
import {
  addPassesToLane,
  findLaneForRange,
  setLineChoice,
  setSectionChoice,
  toggleStar,
  type LanePass,
  type TakeLane,
} from "@/lib/studio/recording/comping";
import { barDurationMs, beatDurationMs } from "@/lib/studio/studio-daw-clock";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
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
  isRecordingCaptureActive,
  recordingInterruptedNoticePl,
  reduceRecordingUi,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";
import {
  STUDIO_VOCAL_IMPORT_ACCEPT,
  gateStudioVocalImportFile,
} from "@/lib/takes/studio-vocal-import";
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
import {
  classifyPersistHttpFailure,
  classifyPersistNetworkFailure,
  createStudioPersistVersionTip,
  type StudioPersistExecutor,
  type StudioPersistResult,
  type StudioPersistVersionTip,
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
  onDocumentVersionAck,
  tracks,
  onClipCreated,
  onTrackCreated,
  onRecordingActiveChange,
  onCaptureInterrupted,
  onLocalRecoveryChanged,
  recoverySavedKey = 0,
  embedded = false,
  /** Phase 7.1.3 — Studio selection SSOT; no third track store. */
  preferredTrackId = null,
  lastScratchClipId,
  onLastScratchClipIdChange,
  onBitekBubble,
  onDocumentReplaced,
}: {
  projectId: string;
  /** Phase 7.1.6 — read docRef version at executor start (not stale prop). */
  getExpectedDocumentVersion: () => number;
  /** Phase 7.1.6 — shared Studio persist boundary. */
  enqueuePersistAsync: (
    executor: StudioPersistExecutor,
  ) => Promise<StudioPersistResult>;
  /** Marker / Inspector ack → editor docRef (clip-move CAS). */
  onDocumentVersionAck?: (ack: unknown) => number;
  tracks: StudioTrackDto[];
  onClipCreated: (
    clip: StudioClipDto,
    documentVersion: number,
    options?: { keepRecordPanel?: boolean },
  ) => void;
  onTrackCreated?: (track: StudioTrackDto, documentVersion: number) => void;
  onRecordingActiveChange?: (active: boolean) => void;
  /**
   * Panel unmounted while capture was in flight. onRecordingActiveChange(false)
   * is reported first; the message says whether the take was lost.
   */
  onCaptureInterrupted?: (message: string) => void;
  /** STU-14 — a browser-local recovery copy was sealed, released or removed. */
  onLocalRecoveryChanged?: () => void;
  /** STU-16 — bumped when the recovery banner saved a copy; clears a stale upload error. */
  recoverySavedKey?: number;
  /** Phase 1 — denser chrome when hosted inside Inspector. */
  embedded?: boolean;
  preferredTrackId?: string | null;
  /** Editor SSOT — scratch clip survives panel unmount. */
  lastScratchClipId: string | null;
  onLastScratchClipIdChange: (clipId: string | null) => void;
  /** Recording P0 — BITEK notice (latency / Bluetooth); null clears it. */
  onBitekBubble?: (bubble: BitekBubble | null) => void;
  /** Recording P0 — comp apply returns a fresh document (several CAS ops). */
  onDocumentReplaced?: (doc: StudioProjectDocument) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioRecordingPanel");
  const getBaseVersionRef = useRef(getExpectedDocumentVersion);
  getBaseVersionRef.current = getExpectedDocumentVersion;
  const persistVersionTipRef = useRef<StudioPersistVersionTip | null>(null);
  if (persistVersionTipRef.current === null) {
    persistVersionTipRef.current = createStudioPersistVersionTip(
      () => getBaseVersionRef.current(),
    );
  }
  const persistVersionTip = persistVersionTipRef.current;
  const ackDocumentVersion = useCallback(
    (ack: unknown): number => {
      const next = persistVersionTip.applyAck(ack);
      onDocumentVersionAck?.(next);
      return next;
    },
    [onDocumentVersionAck, persistVersionTip],
  );
  const transport = useStudioTransport();
  const [localTracks, setLocalTracks] = useState<StudioTrackDto[]>([]);
  const [trackCreateBusy, setTrackCreateBusy] = useState<
    "SAMPLE" | "SCRATCH" | null
  >(null);
  const mergedTracks = [
    ...tracks,
    ...localTracks.filter((local) => !tracks.some((t) => t.id === local.id)),
  ];
  const recordableTracks = mergedTracks.filter((t) => t.trackType !== "BEAT");

  const addProductTrack = useCallback(
    async (trackType: "SAMPLE" | "SCRATCH") => {
      setTrackCreateBusy(trackType);
      const label = trackType === "SAMPLE" ? "Sample" : "Scratch";
      const result = await enqueuePersistAsync(async () => {
        const response = await fetch(
          `/api/studio/projects/${projectId}/tracks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: persistVersionTip.expected(),
              trackType,
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          track?: StudioTrackDto;
          documentVersion?: number;
          message?: string;
          error?: string;
        } | null;
        if (!response.ok || !body?.track) {
          return classifyPersistHttpFailure({
            status: response.status,
            message:
              body?.message ||
              body?.error ||
              tr("nieUdaloSieDodac", { v0: label }),
          });
        }
        const version = ackDocumentVersion(body.documentVersion);
        return {
          ok: true as const,
          documentVersion: version,
          apply: () => {
            setLocalTracks((current) => [...current, body.track!]);
            onTrackCreated?.(body.track!, version);
            setCatalogMessage(tr("dodanoSciezke", { v0: label }));
          },
        };
      });
      if (!result.ok) setWorkflowError(result.message);
      setTrackCreateBusy(null);
    },
    [
      ackDocumentVersion,
      enqueuePersistAsync,
      onTrackCreated,
      persistVersionTip,
      projectId,
    ],
  );
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
  const [countInBars, setCountInBars] = useState<StudioCountInBars>(1);
  const [punchEnabled, setPunchEnabled] = useState(false);
  const [punchInMs, setPunchInMs] = useState(0);
  const [punchOutMs, setPunchOutMs] = useState(4000);
  const [countInActive, setCountInActive] = useState(false);
  const [monitorOn, setMonitorOn] = useState(false);
  const [catalogAssetId, setCatalogAssetId] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const takeWorkflowRef = useRef<HTMLDivElement | null>(null);

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

  const mountedRef = useRef(false);
  const captureReportRef = useRef({
    onRecordingActiveChange,
    onCaptureInterrupted,
    onLocalRecoveryChanged,
  });
  const recoveryWriterRef = useRef<TakeRecoveryWriter | null>(null);
  const [localSafety, setLocalSafety] =
    useState<TakeRecoveryWriterState | null>(null);

  const punchOutRef = useRef<number | null>(null);
  const loopRestoreRef = useRef<(() => void) | null>(null);

  // ── Recording P0: latency, section loop / punch line, take lanes ──
  const tRec = useTranslations("studio.recTools");
  const tBitek = useTranslations("studio.bitek");
  const [recMode, setRecMode] = useState<RecToolsMode>("single");
  const [sectionBars, setSectionBars] = useState<SectionBars>(4);
  const [sectionStartMs, setSectionStartMs] = useState<number | null>(null);
  const [punchLine, setPunchLine] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [calibration, setCalibration] = useState<CalibrationUi>({ status: "idle" });
  const [latencyOpenSignal, setLatencyOpenSignal] = useState(0);
  const calibAbortRef = useRef<AbortController | null>(null);
  const [lanesBusy, setLanesBusy] = useState(false);
  const [laneMessage, setLaneMessage] = useState<string | null>(null);
  const [dirtyLaneIds, setDirtyLaneIds] = useState<ReadonlySet<string>>(new Set());
  const [passPreviewId, setPassPreviewId] = useState<string | null>(null);
  const passAudioRef = useRef<HTMLAudioElement | null>(null);
  const alignRef = useRef<{
    samples: PlayheadSample[];
    sampler: number | null;
    recT0: number | null;
    mode: RecToolsMode;
    section: MsRange | null;
    line: MsRange | null;
    compensationMs: number;
    countdownTarget: number | null;
    prerollMs: number;
    restore: (() => void) | null;
    placement: { takeId: string; timelineStartMs: number; sourceOffsetMs: number } | null;
  }>({
    samples: [],
    sampler: null,
    recT0: null,
    mode: "single",
    section: null,
    line: null,
    compensationMs: 0,
    countdownTarget: null,
    prerollMs: 0,
    restore: null,
    placement: null,
  });
  const captureActive = isRecordingCaptureActive(state.phase);
  const showWorkflow = state.phase === "READY_TAKE" && state.takeId;

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

  const inputLabel =
    inputDevices.inputs.find((d) => d.deviceId === inputDevices.selectedDeviceId)?.label ??
    inputDevices.inputs[0]?.label ??
    null;
  const outputLabel =
    outputDevices.outputs.find((d) => d.deviceId === outputDevices.selectedDeviceId)?.label ??
    outputDevices.outputs[0]?.label ??
    null;
  const latency = useStudioLatency({
    inputLabel,
    outputLabel,
    readContextEstimate: () => contextLatencyEstimate(transport.getContextForAux()),
    signedIn: true,
  });
  const laneStore = useTakeLanes(projectId, true);
  const barMs = barDurationMs(transport.tempoBpm, transport.timeSignatureNum);
  const beatMs = beatDurationMs(transport.tempoBpm);
  const section =
    sectionStartMs != null
      ? sectionRange({
          startMs: sectionStartMs,
          bars: sectionBars,
          barMs,
          timelineLengthMs: transport.state.timelineLengthMs,
        })
      : null;
  const lines = section ? sectionLines(section, barMs) : [];
  const trackLanes = laneStore.lanes
    .filter((l) => l.trackId === trackId)
    .sort((a, b) => a.sectionStartMs - b.sectionStartMs);

  const bitekReportRef = useRef(onBitekBubble);
  useEffect(() => {
    bitekReportRef.current = onBitekBubble;
  });
  useEffect(() => {
    const report = bitekReportRef.current;
    if (!report) return;
    const w = latency.warning;
    if (!w) {
      report(null);
      return;
    }
    report({
      key: `rec-latency-${w}-${latency.deviceKey}`,
      mood: "alert",
      text:
        w === "bluetooth"
          ? tBitek("msg.latencyBluetooth")
          : tBitek("msg.latencyHigh", { ms: latency.baseMs }),
      details: [tBitek("msg.latencyDetail")],
      actions: [
        {
          id: "calibrate",
          label: tBitek("akcja.calibrate"),
          primary: true,
          onClick: () => setLatencyOpenSignal((n) => n + 1),
        },
        {
          id: "manualLatency",
          label: tBitek("akcja.manualLatency"),
          onClick: () => setLatencyOpenSignal((n) => n + 1),
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitives only; avoids a render loop with the editor
  }, [latency.warning, latency.deviceKey, latency.baseMs]);
  useEffect(() => () => bitekReportRef.current?.(null), []);

  useEffect(() => {
    if (!monitorOn || !meterStream) return;
    const ctx = transport.getContextForAux();
    if (!ctx?.createMediaStreamSource) return;
    const source = ctx.createMediaStreamSource(meterStream);
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain);
    gain.connect(ctx.destination);
    return () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // already torn down
      }
    };
  }, [meterStream, monitorOn, transport]);

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
          setTesterError(tr("brakDostepuDoMikrofonu"));
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
            tr("brakDostepuDoMikrofonu2"),
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
    if (!showWorkflow) return;
    takeWorkflowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [showWorkflow, state.takeId]);

  useEffect(() => {
    if (recoverySavedKey === 0) return;
    if (phaseRef.current === "UPLOAD_ERROR" || phaseRef.current === "FINALIZE_ERROR") {
      dispatch({ type: "RETRY_IDLE" });
    }
  }, [recoverySavedKey]);

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
      const writer = recoveryWriterRef.current;
      recoveryWriterRef.current = null;
      let stopped: Promise<void> = Promise.resolve();
      try {
        stopped = recorderRef.current?.cancel() ?? stopped;
      } catch {
        // ignore
      }
      recorderRef.current = null;
      clearCapturePlacement();
      const secured = writer != null && writer.state !== "UNAVAILABLE";
      if (writer) sealInterruptedRecovery(writer, stopped);
      dispatch({
        type: "RECORDING_FAILED",
        message: secured
          ? tr("nagranaCzescJestZabezpieczona", { v0: studioDeviceErrorMessagePl("DEVICE_DISCONNECTED") })
          : studioDeviceErrorMessagePl("DEVICE_DISCONNECTED"),
      });
    };
    track.addEventListener("ended", onEnded);
    return () => {
      track.removeEventListener("ended", onEnded);
    };
  }, [state.phase, micStream]);

  useEffect(() => {
    captureReportRef.current = {
      onRecordingActiveChange,
      onCaptureInterrupted,
      onLocalRecoveryChanged,
    };
  });

  // Flush buffered audio to the local copy before the page may be frozen or killed.
  useEffect(() => {
    if (state.phase !== "RECORDING") return;
    const flush = () => recorderRef.current?.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state.phase]);

  useEffect(() => {
    // Warm up IndexedDB so starting a take does not wait for it.
    void getBrowserTakeRecoveryStore().catch(() => null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const capturePhase =
        phaseRef.current === "RECORDING" || phaseRef.current === "STOPPING";
      const writer = capturePhase ? recoveryWriterRef.current : null;
      recoveryWriterRef.current = null;
      const interruptedNotice = recordingInterruptedNoticePl(phaseRef.current, {
        locallySecured: writer != null && writer.state !== "UNAVAILABLE",
      });
      if (tickRef.current) clearInterval(tickRef.current);
      let stopped: Promise<void> = Promise.resolve();
      try {
        stopped = recorderRef.current?.cancel() ?? stopped;
      } catch {
        // ignore
      }
      if (writer) sealInterruptedRecovery(writer, stopped);
      transport.stopTakePreview();
      // The host's lock mirrors captureActive; nobody else can clear it now.
      if (interruptedNotice) {
        const report = captureReportRef.current;
        report.onRecordingActiveChange?.(false);
        report.onCaptureInterrupted?.(interruptedNotice);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  function stopAlignSampler() {
    const a = alignRef.current;
    if (a.sampler != null) window.clearInterval(a.sampler);
    a.sampler = null;
    a.countdownTarget = null;
    setCountdown(null);
  }

  function startAlignSampler() {
    stopAlignSampler();
    const a = alignRef.current;
    a.samples = [];
    let lastBeats: number | null = null;
    a.sampler = window.setInterval(() => {
      const playheadMs = transport.getPlayheadMs();
      const sample = { perfMs: performance.now(), playheadMs };
      const prev = a.samples[a.samples.length - 1];
      if ((!prev || prev.playheadMs !== playheadMs) && a.samples.length < 20_000) {
        a.samples.push(sample);
      }
      if (a.countdownTarget != null) {
        const beats = prerollCountdown({
          playheadMs,
          targetMs: a.countdownTarget,
          beatMs,
          prerollMs: a.prerollMs,
        });
        if (beats !== lastBeats) {
          lastBeats = beats;
          setCountdown(beats);
        }
        if (beats == null && playheadMs >= a.countdownTarget) {
          a.countdownTarget = null;
          a.restore?.();
          a.restore = null;
        }
      }
    }, 20);
  }

  /** Visual + click count-in on the Studio context when there is no room before the section. */
  async function auxCountIn(beats: number): Promise<void> {
    const ctx = transport.getContextForAux() as unknown as AudioContext | null;
    if (ctx && typeof ctx.createBuffer === "function") {
      try {
        if (ctx.state !== "running") await ctx.resume();
        const pcm = renderCalibrationClick(ctx.sampleRate, 0.35);
        const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
        buf.copyToChannel(pcm, 0);
        for (let i = 0; i < beats; i += 1) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(ctx.currentTime + 0.05 + (i * beatMs) / 1000);
        }
      } catch {
        // clicks are a nicety — the countdown still shows
      }
    }
    for (let i = beats; i >= 1; i -= 1) {
      setCountdown(i);
      await new Promise((r) => window.setTimeout(r, beatMs));
    }
    setCountdown(null);
  }

  async function runCalibration(mode: "click" | "clap") {
    if (captureActive || calibration.status === "running") return;
    transport.pause();
    transport.stopTakePreview();
    const ctx = transport.getContextForAux() as unknown as AudioContext | null;
    if (!ctx || typeof ctx.decodeAudioData !== "function") {
      setCalibration({ status: "failed", reason: "ERROR" });
      return;
    }
    const cfg = mode === "click" ? CLICK_CALIBRATION : CLAP_CALIBRATION;
    const ac = new AbortController();
    calibAbortRef.current = ac;
    setCalibration({ status: "running", mode, beat: 0, total: cfg.count });
    try {
      const r = await runLatencyCalibration({
        ctx,
        mode,
        audioDeviceId: inputDevices.audioDeviceIdForRecorder || undefined,
        signal: ac.signal,
        onProgress: (p) => setCalibration({ status: "running", mode, beat: p.beat, total: p.total }),
      });
      if (r.ok) {
        latency.save({ roundTripMs: Math.round(r.latencyMs), method: mode, spreadMs: r.spreadMs });
        setCalibration({ status: "done", latencyMs: r.latencyMs, spreadMs: r.spreadMs });
      } else {
        setCalibration({ status: "failed", reason: r.reason });
      }
    } catch (error) {
      setCalibration(
        error instanceof DOMException && error.name === "AbortError"
          ? { status: "idle" }
          : { status: "failed", reason: "ERROR" },
      );
    } finally {
      calibAbortRef.current = null;
    }
  }

  function chooseRecMode(next: RecToolsMode) {
    setRecMode(next);
    setPunchEnabled(false);
    if (next !== "single" && sectionStartMs == null) {
      setSectionStartMs(transport.getPlayheadMs());
    }
  }

  function laneDirty(laneId: string, dirty: boolean) {
    setDirtyLaneIds((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(laneId);
      else next.delete(laneId);
      return next;
    });
  }

  async function updateLane(lane: TakeLane) {
    laneDirty(lane.id, true);
    await laneStore.put({ ...lane, updatedAt: new Date().toISOString() });
  }

  /** Put the lane comp on the timeline (server replaces the lane's previous clips). */
  async function applyLane(lane: TakeLane): Promise<boolean> {
    setLanesBusy(true);
    setLaneMessage(null);
    try {
      const result = await enqueuePersistAsync(async () => {
        try {
          const res = await fetch(`/api/studio/projects/${projectId}/record/lanes/comp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lane, expectedDocumentVersion: persistVersionTip.expected() }),
          });
          const body = (await res.json().catch(() => null)) as {
            document?: StudioProjectDocument;
            lane?: TakeLane;
            documentVersion?: number;
            error?: string;
            code?: string;
          } | null;
          if (!res.ok || !body?.document) {
            return classifyPersistHttpFailure({
              status: res.status,
              message: body?.error ?? tRec("compBlad"),
              code: body?.code,
            });
          }
          const version = ackDocumentVersion(body.documentVersion);
          return {
            ok: true as const,
            documentVersion: version,
            apply: () => {
              onDocumentReplaced?.(body.document!);
              if (body.lane) laneStore.replaceLocal(body.lane);
            },
          };
        } catch {
          return classifyPersistNetworkFailure(tRec("compBlad"));
        }
      });
      if (!result.ok) {
        setLaneMessage(result.message);
        return false;
      }
      laneDirty(lane.id, false);
      setLaneMessage(tRec("compGotowy"));
      return true;
    } finally {
      setLanesBusy(false);
    }
  }

  async function togglePassPreview(_lane: TakeLane, pass: LanePass) {
    const current = passAudioRef.current;
    if (current) {
      current.pause();
      passAudioRef.current = null;
    }
    if (passPreviewId === pass.id) {
      setPassPreviewId(null);
      return;
    }
    transport.pause();
    transport.stopTakePreview();
    const url = await transport
      .resolveClipSourceUrl({
        sourceKind: "TAKE",
        sourceTakeId: pass.takeId,
        sourceBeatId: null,
        sourceArtifactId: null,
      })
      .catch(() => null);
    if (!url) {
      setLaneMessage(tr("nieUdaloSieOdtworzyc"));
      return;
    }
    const el = new Audio(url);
    passAudioRef.current = el;
    setPassPreviewId(pass.id);
    const len = (pass.rangeEndMs - pass.rangeStartMs) / 1000;
    const from = pass.sourceOffsetMs / 1000;
    const stop = () => {
      el.pause();
      if (passAudioRef.current === el) passAudioRef.current = null;
      setPassPreviewId((id) => (id === pass.id ? null : id));
    };
    el.addEventListener("loadedmetadata", () => {
      el.currentTime = from;
      void el.play().catch(stop);
    });
    el.addEventListener("timeupdate", () => {
      if (el.currentTime >= from + len) stop();
    });
    el.addEventListener("ended", stop);
    el.addEventListener("error", stop);
  }

  /** Loop / punch capture → passes → lane → comp on the timeline. Single takes keep Zachowaj. */
  async function finishLaneCapture(takeId: string, takeDurationSeconds: number | null) {
    const a = alignRef.current;
    const placeTrackId = captureTrackIdRef.current || trackIdRef.current;
    if (!a.section || a.recT0 == null || !placeTrackId) return;
    const takeDurationMs = Math.round((takeDurationSeconds ?? 0) * 1000);
    const range = a.mode === "punch" && a.line ? a.line : a.section;
    const starts =
      a.mode === "loop"
        ? loopPassStarts({ samples: a.samples, section: a.section, recordStartPerfMs: a.recT0 })
        : [recordingPositionOf({ samples: a.samples, targetMs: range.startMs, recordStartPerfMs: a.recT0 })].filter(
            (v): v is number => v != null,
          );
    const captured = buildCapturedPasses({
      passStartsRecMs: starts,
      section: range,
      takeDurationMs,
      compensationMs: a.compensationMs,
    });
    if (captured.length === 0) {
      setWorkflowError(tRec("brakPelnegoPrzejscia"));
      return;
    }
    const now = new Date().toISOString();
    const passes: Omit<LanePass, "number">[] = captured.map((c) => ({
      id: crypto.randomUUID(),
      takeId,
      kind: a.mode === "punch" ? "punch" : "loop",
      rangeStartMs: c.rangeStartMs,
      rangeEndMs: c.rangeEndMs,
      sourceOffsetMs: c.sourceOffsetMs,
      takeDurationMs,
      starred: false,
      complete: c.complete,
      createdAt: now,
    }));
    const existing =
      findLaneForRange(laneStore.lanes, placeTrackId, a.section) ??
      (a.mode === "punch" ? findLaneForRange(laneStore.lanes, placeTrackId, range) : null);
    const lane: TakeLane = existing ?? {
      id: crypto.randomUUID(),
      trackId: placeTrackId,
      sectionStartMs: a.section.startMs,
      sectionEndMs: a.section.endMs,
      lineMs: Math.max(100, Math.round(barMs)),
      passes: [],
      comp: [],
      clipIds: [],
      updatedAt: now,
    };
    const next = addPassesToLane(lane, passes);
    const saved = await laneStore.put({ ...next, updatedAt: now });
    const ok = await applyLane(saved);
    if (!ok) {
      setWorkflowError(tRec("compNieNaOsi"));
      laneDirty(saved.id, true);
    }
    placedTakeIdsRef.current.add(takeId);
    clearCapturePlacement();
    setKeptMessage(
      a.mode === "loop" ? tRec("zapisanoPrzejscia", { n: passes.length }) : tRec("zapisanoPunch"),
    );
    dispatch({ type: "RETRY_IDLE" });
  }

  function restoreLoopAfterCapture() {
    alignRef.current.restore?.();
    alignRef.current.restore = null;
    loopRestoreRef.current?.();
    loopRestoreRef.current = null;
  }

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
        json.error ?? tr("nieUdaloSiePrzygotowac"),
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
        message: tr("wybierzSciezkeDoNagrania"),
      });
      return;
    }

    const support = detectMediaRecorderSupport();
    if (!support.supported) {
      dispatch({
        type: "UNSUPPORTED",
        message: tr("taPrzegladarkaNieObsluguje"),
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
            elig.error ?? tr("nieUdaloSieSprawdzic"),
          ),
        });
        return;
      }
      if (!elig.allowed) {
        const parts = [elig.message ?? tr("nieMozeszTerazNagrywac")];
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
            : tr("nieUdaloSieUruchomic"),
        ),
      });
    }
  }

  async function startRecording() {
    if (phaseRef.current !== "READY" || submittingRef.current) return;
    if (!beatIdRef.current || !trackIdRef.current) {
      dispatch({
        type: "RECORDING_FAILED",
        message: tr("brakKontekstuNagrywania"),
      });
      return;
    }
    submittingRef.current = true;
    // AUD-01: arm before stop — effect must not re-open tester during recorder.start.
    captureArmingRef.current = true;
    setCaptureArming(true);
    stopTesterStream();
    const flow: RecToolsMode = recMode !== "single" && section ? recMode : "single";
    const flowLine = flow === "punch" ? lines[Math.min(punchLine, lines.length - 1)] ?? null : null;
    if (flow === "punch" && !flowLine) {
      captureArmingRef.current = false;
      setCaptureArming(false);
      submittingRef.current = false;
      setWorkflowError(tRec("brakLinijki"));
      return;
    }
    const align = alignRef.current;
    align.mode = flow;
    align.section = flow === "single" ? null : section;
    align.line = flowLine;
    align.compensationMs = latency.compensationMs;
    align.placement = null;
    align.recT0 = null;
    align.restore = null;
    const punchWin = flowLine ? punchLineWindow({ line: flowLine, barMs, beatMs }) : null;
    const punch = flow === "single" && punchEnabled
      ? normalizePunchWindow({
          punchInMs,
          punchOutMs,
          timelineLengthMs: transport.state.timelineLengthMs,
        })
      : null;
    const startMs =
      flow === "loop" && section
        ? section.startMs
        : punchWin
          ? punchWin.recordFromMs
          : punch?.punchInMs ?? transport.state.playheadMs;
    punchOutRef.current = punchWin ? punchWin.stopAtMs : punch?.punchOutMs ?? null;
    // Loop / punch run their own 1-bar pre-roll after the recorder starts.
    const countMs =
      flow !== "single"
        ? 0
        : countInDurationMs(
            transport.tempoBpm,
            countInBars,
            transport.timeSignatureNum,
          );
    if (countMs > 0) {
      setCountInActive(true);
      transport.seek(countInSeekMs(startMs, countMs));
      transport.play();
      const deadline = Date.now() + countMs + 400;
      await new Promise<void>((resolve) => {
        const id = window.setInterval(() => {
          if (
            transport.getPlayheadMs() >= startMs ||
            Date.now() >= deadline
          ) {
            window.clearInterval(id);
            resolve();
          }
        }, 30);
      });
      setCountInActive(false);
      if (!mountedRef.current) {
        submittingRef.current = false;
        captureArmingRef.current = false;
        setCaptureArming(false);
        return;
      }
    }
    setRecordStartMs(startMs);
    recordStartMsRef.current = startMs;
    captureTrackIdRef.current = trackIdRef.current;
    setWorkflowError(null);
    setKeptMessage(null);

    const recorder = recorderRef.current ?? new TakeMediaRecorder();
    recorderRef.current = recorder;
    const [recoveryStore, ownerUserId] = await Promise.all([
      getBrowserTakeRecoveryStore().catch(() => null),
      getTakeRecoveryViewerUserId(true),
    ]);
    let writer: TakeRecoveryWriter | null = null;
    const chunkBuffer = createTakeRecoveryChunkBuffer();
    const onChunk = chunkBuffer.onChunk;

    try {
      let started: { mimeType: string };
      try {
        started = await recorder.start({
          audioDeviceId:
            inputDevices.audioDeviceIdForRecorder || undefined,
          onChunk,
        });
      } catch (firstStartError) {
        // Stale preference: one retry with system default (P5.8 AC-07).
        if (
          inputDevices.audioDeviceIdForRecorder &&
          firstStartError instanceof TakeRecorderError &&
          firstStartError.code === "RECORDING_ERROR"
        ) {
          started = await recorder.start({ onChunk });
        } else {
          throw firstStartError;
        }
      }
      // Unmounted while getUserMedia was pending: start() reset the cancel flag.
      if (!mountedRef.current) {
        void recorder.cancel();
        return;
      }
      writer = createTakeRecoveryWriter({
        // Ownership must be verifiable, otherwise no local copy is kept.
        store: ownerUserId ? recoveryStore : null,
        recoveryId: crypto.randomUUID(),
        claimant: getTakeRecoveryTabClaimant(),
        surface: "STUDIO",
        projectId,
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
      align.recT0 = (await recorder.waitForStarted(800)) ?? performance.now();
      startAlignSampler();
      if (flow === "loop" && section) {
        const prevLoop = {
          enabled: transport.loopEnabled,
          startMs: transport.loopStartMs,
          endMs: transport.loopEndMs,
        };
        const prevMetronome = transport.metronomeEnabled;
        transport.setLoop({ enabled: true, startMs: section.startMs, endMs: section.endMs });
        const restoreLoop = () => transport.setLoop(prevLoop);
        const beatsPerBar = transport.timeSignatureNum > 0 ? transport.timeSignatureNum : 4;
        if (section.startMs >= barMs) {
          transport.seek(section.startMs - barMs);
          transport.setMetronomeEnabled(true);
          align.prerollMs = barMs;
          align.countdownTarget = section.startMs;
          align.restore = () => {
            if (!prevMetronome) transport.setMetronomeEnabled(false);
          };
        } else {
          transport.seek(section.startMs);
          await auxCountIn(beatsPerBar);
        }
        loopRestoreRef.current = () => {
          restoreLoop();
          if (!prevMetronome) transport.setMetronomeEnabled(false);
        };
      } else if (punchWin && flowLine) {
        transport.seek(punchWin.recordFromMs);
        if (punchWin.prerollMs > 0) {
          align.prerollMs = punchWin.prerollMs;
          align.countdownTarget = flowLine.startMs;
        }
      }
      // Keep beat playing under the new take when possible.
      transport.play();
      dispatch({ type: "START_RECORDING" });
      startedAtRef.current = Date.now();
      clearTick();
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: "TICK", elapsedMs: elapsed });
        if (
          elapsed >= maxSecondsRef.current * 1000 ||
          shouldAutoStopPunch(transport.getPlayheadMs(), punchOutRef.current)
        ) {
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
      stopAlignSampler();
      restoreLoopAfterCapture();
      transport.pause();
      try {
        void recorder.cancel();
      } catch {
        // ignore
      }
      recoveryWriterRef.current = null;
      setLocalSafety(null);
      void writer?.discard();
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
          message: tr("taPrzegladarkaNieObsluguje"),
        });
      } else {
        dispatch({
          type: "RECORDING_FAILED",
          message: toUserFacingTakeUploadError(
            error instanceof Error
              ? error.message
              : tr("nieUdaloSieZaczac"),
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
    stopAlignSampler();
    dispatch({ type: "STOP" });
    transport.pause();
    restoreLoopAfterCapture();

    const recorder = recorderRef.current;
    const startMs = recordStartMsRef.current;
    if (!recorder || startMs == null || !beatIdRef.current) {
      dispatch({
        type: "RECORDING_FAILED",
        message: tr("brakAktywnegoRekordera"),
      });
      submittingRef.current = false;
      return;
    }

    const writer = recoveryWriterRef.current;
    let locallySecured = false;
    try {
      const result = await recorder.stop();
      dispatch({ type: "UPLOAD_START" });
      recoveryWriterRef.current = null;
      locallySecured = writer ? await writer.finish("COMPLETE", 3_000) : false;
      const uploaded = await uploadTakeRecordingBlob({
        beatId: beatIdRef.current,
        blob: result.blob,
        contentType: result.mimeType,
        onStage: (stage) => writer?.noteStage(stage.stage, stage.takeId),
      });
      if (writer) {
        void writer
          .confirmSaved(uploaded.takeId)
          .then(() => captureReportRef.current.onLocalRecoveryChanged?.());
      }
      dispatch({ type: "FINALIZE_START" });

      // Take is READY after uploadTakeRecordingBlob finalize — do not auto-place.
      const align = alignRef.current;
      if (align.recT0 != null) {
        const recPositionMs = recordingPositionOf({
          samples: align.samples,
          targetMs: startMs,
          recordStartPerfMs: align.recT0,
        });
        align.placement = {
          takeId: uploaded.takeId,
          ...alignedPlacement({
            startMs,
            recPositionMs,
            // Nothing played → nothing to line up against.
            compensationMs: recPositionMs == null ? 0 : align.compensationMs,
          }),
        };
      }
      dispatch({
        type: "TAKE_READY",
        takeId: uploaded.takeId,
        previewUrl: null,
        takeDurationSeconds: uploaded.durationSeconds,
      });
      setWorkflowError(null);
      setKeptMessage(null);
      // Preserve recordStartMs / captureTrackId for Zachowaj placement.
      if (align.mode !== "single") {
        void finishLaneCapture(uploaded.takeId, uploaded.durationSeconds ?? null);
      }
    } catch (error) {
      clearCapturePlacement();
      const cancelled =
        error instanceof TakeRecorderError && error.code === "CANCELLED";
      if (writer && !cancelled && recoveryWriterRef.current === writer) {
        // recorder.stop() itself failed — keep the captured prefix recoverable.
        recoveryWriterRef.current = null;
        locallySecured = writer.state !== "UNAVAILABLE";
        sealInterruptedRecovery(writer, Promise.resolve());
      }
      if (cancelled) {
        dispatch({ type: "RETRY_IDLE" });
      } else if (error instanceof TakeRecoveryLeaseLostError) {
        // Another tab owns the copy now — it finalizes; this tab must not.
        captureReportRef.current.onLocalRecoveryChanged?.();
        dispatch({ type: "UPLOAD_FAILED", message: error.message });
      } else {
        const raw =
          error instanceof Error
            ? error.message
            : tr("nieUdaloSieZapisac2");
        if (writer && locallySecured && recoveryWriterRef.current !== writer) {
          void writer
            .release()
            .then(() => captureReportRef.current.onLocalRecoveryChanged?.());
        }
        const message = locallySecured
          ? tr("nagranieJestZabezpieczoneLokalnie", { v0: toUserFacingTakeUploadError(raw) })
          : toUserFacingTakeUploadError(raw);
        if (/finaliz|duration|READY|MIME/i.test(raw)) {
          dispatch({ type: "FINALIZE_FAILED", message });
        } else {
          dispatch({ type: "UPLOAD_FAILED", message });
        }
      }
    } finally {
      submittingRef.current = false;
      recorderRef.current = null;
      if (mountedRef.current) setLocalSafety(null);
    }
  }

  function sealInterruptedRecovery(
    writer: TakeRecoveryWriter,
    stopped: Promise<void>,
  ) {
    void stopped
      .then(() => writer.finish("INTERRUPTED", 5_000))
      .then(() => captureReportRef.current.onLocalRecoveryChanged?.());
  }

  function cancelRecording() {
    clearTick();
    clearMic();
    stopAlignSampler();
    restoreLoopAfterCapture();
    clearCapturePlacement();
    transport.pause();
    transport.stopTakePreview();
    try {
      void recorderRef.current?.cancel();
    } catch {
      // ignore
    }
    recorderRef.current = null;
    // Explicit user cancel: the take is not wanted, so no local copy is kept.
    void recoveryWriterRef.current?.discard();
    recoveryWriterRef.current = null;
    setLocalSafety(null);
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
      setWorkflowError(tr("nieUdaloSieOdtworzyc"));
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
      setWorkflowError(tr("brakPozycjiNagraniaNa"));
      return false;
    }

    if (placedTakeIdsRef.current.has(takeId)) {
      setKeptMessage(tr("nagranieJestJuzNa"));
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
                ...(alignRef.current.placement?.takeId === takeId
                  ? {
                      timelineStartMs: alignRef.current.placement.timelineStartMs,
                      sourceOffsetMs: alignRef.current.placement.sourceOffsetMs,
                    }
                  : { timelineStartMs: startMs }),
                expectedDocumentVersion: persistVersionTip.expected(),
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
                ? placed.error ?? tr("projektZostalZmienionyOdswiez")
                : placed.error?.includes("dostępne") ||
                    placed.error?.includes("READY") ||
                    placeRes.status === 403
                  ? tr("nagranieNieJestJuz")
                  : placed.error ??
                    tr("nieUdaloSieUmiescic");
            return classifyPersistHttpFailure({
              status: placeRes.status,
              message,
              code: placed.code,
            });
          }
          const clip = placed.clip;
          const nextVersion = persistVersionTip.applyAck(placed.documentVersion);
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
            tr("nieUdaloSieUmiescic2"),
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
      setWorkflowError(tr("nieUdaloSieUmiescic"));
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
      successMessage: tr("nagranieZachowaneNaOsi"),
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
      setWorkflowError(tr("wybierzSciezkeWokaluPrzed"));
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
            elig.error ?? tr("nieUdaloSieSprawdzic"),
          ),
        );
        return;
      }
      if (!elig.allowed) {
        const parts = [elig.message ?? tr("nieMozeszTerazImportowac")];
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
        successMessage: tr("wokalZaimportowanyNaOs"),
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
          : tr("nieUdaloSieZaimportowac");
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
      tr("odrzucicNagranieNagranieZostanie"),
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
            json.error ?? tr("nieUdaloSieUsunac2"),
          ),
        );
        return;
      }
      clearCapturePlacement();
      setKeptMessage(null);
      dispatch({ type: "RETRY_IDLE" });
    } catch {
      setWorkflowError(tr("nieUdaloSieUsunac"));
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
        throw new Error(json.error ?? tr("nieUdaloSieWczytac2"));
      }
      setLibraryTakes(json.takes);
    } catch (e) {
      setLibraryError(
        e instanceof Error ? e.message : tr("nieUdaloSieWczytac"),
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
      setLibraryError(tr("nieUdaloSieOdtworzyc"));
    } finally {
      setLibraryBusyId(null);
    }
  }

  async function onLibraryPlace(
    take: StudioPlaceableTakeDto,
    replaceOverlapping = false,
  ) {
    if (!trackIdRef.current) {
      setLibraryError(tr("wybierzSciezkeDoNagrania"));
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
                expectedDocumentVersion: persistVersionTip.expected(),
                replaceOverlapping,
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
                ? placed.error ?? tr("projektZostalZmienionyOdswiez")
                : placed.error?.includes("dostępne") || placeRes.status === 403
                  ? tr("nagranieNieJestJuz")
                  : placed.error ??
                    tr("nieUdaloSieUmiescic");
            return classifyPersistHttpFailure({
              status: placeRes.status,
              message,
              code: placed.code,
            });
          }
          const clip = placed.clip;
          const nextVersion = persistVersionTip.applyAck(placed.documentVersion);
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
            tr("nieUdaloSieUmiescic2"),
          );
        }
      });
      if (!result.ok) {
        setLibraryError(result.message);
        return;
      }
      setKeptMessage(tr("nagranieUmieszczoneNaOsi"));
    } catch {
      setLibraryError(tr("nieUdaloSieUmiescic"));
    } finally {
      setLibraryBusyId(null);
    }
  }

  const primaryLabel =
    state.phase === "REQUESTING_MIC"
      ? tr("prosbaODostepDo")
      : state.phase === "READY"
        ? tr("nagraj")
        : state.phase === "RECORDING"
          ? tr("zatrzymajNagrywanie")
          : state.phase === "STOPPING" ||
              state.phase === "UPLOADING" ||
              state.phase === "PROCESSING"
            ? tr("zapisywanieNagrania")
            : tr("przygotujMikrofon");

  const primaryDisabled =
    state.phase === "REQUESTING_MIC" ||
    state.phase === "STOPPING" ||
    state.phase === "UPLOADING" ||
    state.phase === "PROCESSING" ||
    state.phase === "READY_TAKE" ||
    !trackId;

  const workflowDisabled = Boolean(workflowBusy);

  return (
    <section
      className={
        embedded
          ? "space-y-2 border-0 bg-transparent p-0"
          : "space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
      }
      aria-label={tr("nagrywanieWStudio")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--brd-ink)]">
          {tr("nagrywanie")}
        </h2>
        {state.phase === "RECORDING" ? (
          <div className="space-y-0.5 text-right">
            <p className="text-xs font-medium text-destructive" role="status">
              {tr("trybNagrywania")}{" "}{tl(formatStudioTimeMs(Math.round(state.elapsedMs)))}
            </p>
            {localSafety ? (
              <p
                className="text-[11px] text-[var(--brd-mute)]"
                data-testid="studio-recording-local-safety"
                data-state={localSafety}
              >
                {tl(takeRecoveryWriterStatusPl(localSafety))}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[var(--brd-mute)]">
            {tr("startPlayhead")}{" "}{tl(formatStudioTimeMs(transport.state.playheadMs))}
          </p>
        )}
      </div>

      <label className="block text-xs text-[var(--brd-mute)]">
        {tr("sciezka")}
        <select
          className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
          value={trackId}
          disabled={busy && state.phase !== "READY"}
          onChange={(e) => {
            setManualTrackId(e.target.value);
            setManualForPreferred(preferredTrackId ?? null);
          }}
          aria-label={tr("wybierzSciezke")}
        >
          {trackChoices.map((t) => (
            <option key={t.id} value={t.id}>
              {tl(t.name)}
            </option>
          ))}
        </select>
      </label>

      <StudioLatencyCard
        latency={latency}
        calibration={calibration}
        disabled={captureActive || state.phase === "READY_TAKE"}
        onCalibrate={(mode) => void runCalibration(mode)}
        onCancel={() => calibAbortRef.current?.abort()}
        openSignal={latencyOpenSignal}
      />

      <StudioRecModeCard
        mode={recMode}
        onMode={chooseRecMode}
        bars={sectionBars}
        onBars={setSectionBars}
        section={section}
        onSectionFromPlayhead={() => setSectionStartMs(transport.getPlayheadMs())}
        lines={lines}
        punchLine={Math.min(punchLine, Math.max(0, lines.length - 1))}
        onPunchLine={setPunchLine}
        disabled={busy && state.phase !== "READY"}
        lockedReason={null}
      />

      <StudioCountdown beatsLeft={countdown} label={tRec("wejscieZa")} />

      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">
          {tr("countInPunch")}
        </p>
        <label className="block text-xs text-[var(--brd-mute)]">
          {tr("countIn")}
          <select
            className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
            value={countInBars}
            disabled={busy && state.phase !== "READY"}
            onChange={(e) =>
              setCountInBars(Number(e.target.value) as StudioCountInBars)
            }
            aria-label={tr("countIn")}
          >
            {STUDIO_COUNT_IN_BARS.map((bars) => (
              <option key={bars} value={bars}>
                {tl(bars === 0 ? tr("wylaczone") : tr("takt", { v0: bars, v1: bars === 1 ? "" : "y" }))}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--brd-ink)]">
          <input
            type="checkbox"
            checked={punchEnabled && recMode === "single"}
            onChange={(e) => setPunchEnabled(e.target.checked)}
            disabled={(busy && state.phase !== "READY") || recMode !== "single"}
          />
          {tr("punchInOutNa")}
        </label>
        {punchEnabled ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-[var(--brd-mute)]">
              {tr("inMs")}
              <input
                className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
                type="number"
                min={0}
                value={punchInMs}
                onChange={(e) => setPunchInMs(Number(e.target.value) || 0)}
                aria-label={tr("punchInMs")}
              />
            </label>
            <label className="block text-xs text-[var(--brd-mute)]">
              {tr("outMs")}
              <input
                className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
                type="number"
                min={1}
                value={punchOutMs}
                onChange={(e) => setPunchOutMs(Number(e.target.value) || 0)}
                aria-label={tr("punchOutMs")}
              />
            </label>
          </div>
        ) : null}
        {countInActive ? (
          <p className="text-xs font-medium text-destructive" role="status">
            {tr("countIn2")}
          </p>
        ) : null}
      </div>

      {showWorkflow ? (
        <div
          ref={takeWorkflowRef}
          className="space-y-2 rounded border border-[var(--brd-line)] p-2"
          aria-label={tr("studioTakeWorkflow")}
        >
          <p className="text-sm text-[var(--brd-ink)]" role="status">
            {tr("nagranieGotoweKliknijZachowaj")}
            {tl(state.takeDurationSeconds != null
              ? ` · ${state.takeDurationSeconds.toFixed(1)}s`
              : "")}
            {tl(recordStartMs != null
              ? tr("start", { v0: formatStudioTimeMs(recordStartMs) })
              : "")}
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
              {tl(transport.takePreviewActive ? tr("zatrzymaj") : tr("odtworz"))}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={workflowDisabled}
              onClick={() => void onKeepWorkflowTake()}
            >
              {tl(workflowBusy === "keep" ? tr("zapisywanie") : tr("zachowaj"))}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full"
              variant="outline"
              disabled={workflowDisabled}
              onClick={() => void onDiscardWorkflowTake()}
            >
              {tl(workflowBusy === "discard" ? tr("usuwanie") : tr("odrzuc"))}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full"
              variant="secondary"
              disabled={workflowDisabled}
              onClick={onRecordAgain}
            >
              {tr("nagrajPonownie")}
            </Button>
          </div>
          <p className="text-[11px] text-[var(--brd-mute)]">
            {tr("zachowajUmieszczaNagranieNa")}
          </p>
        </div>
      ) : null}

      <StudioTakeLanesCard
        lanes={trackLanes}
        busy={lanesBusy || captureActive}
        previewingPassId={passPreviewId}
        dirtyLaneIds={dirtyLaneIds}
        localOnly={!laneStore.serverBacked}
        onPreview={(lane, pass) => void togglePassPreview(lane, pass)}
        onStar={(lane, pass) => void updateLane(toggleStar(lane, pass.id))}
        onUseForSection={(lane, pass) => void updateLane(setSectionChoice(lane, pass.id))}
        onLineChoice={(lane, line, passId) => void updateLane(setLineChoice(lane, line, passId))}
        onApply={(lane) => void applyLane(lane)}
        onDelete={(lane) => void laneStore.remove(lane.id)}
      />
      {laneMessage ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status" data-testid="studio-lane-message">
          {laneMessage}
        </p>
      ) : null}

      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">
          {tr("katalogKlipStudio")}
        </p>
        <label className="block text-xs text-[var(--brd-mute)]">
          {tr("idSampleKatalogu")}
          <input
            className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-2 text-sm text-[var(--brd-ink)]"
            value={catalogAssetId}
            onChange={(event) => setCatalogAssetId(event.target.value.trim())}
            aria-label={tr("idSampleKatalogu")}
            autoComplete="off"
            disabled={catalogBusy || Boolean(workflowBusy)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          disabled={
            catalogBusy ||
            Boolean(workflowBusy) ||
            !catalogAssetId ||
            !trackId
          }
          onClick={() => {
            void (async () => {
              if (!trackId || !catalogAssetId) return;
              setCatalogBusy(true);
              setCatalogMessage(null);
              setWorkflowError(null);
              const result = await enqueuePersistAsync(async () => {
                const placed = await copyCatalogAndPlaceStudioClip({
                  projectId,
                  catalogAssetId,
                  trackId,
                  timelineStartMs: Math.floor(transport.getPlayheadMs()),
                  expectedDocumentVersion: persistVersionTip.expected(),
                });
                if (!placed.ok) {
                  return classifyPersistHttpFailure({
                    status: placed.status,
                    message: placed.error,
                  });
                }
                const documentVersion = persistVersionTip.applyAck(
                  placed.documentVersion,
                );
                return {
                  ok: true as const,
                  documentVersion,
                  apply: () => {
                    if (!placed.reusedExistingClip) {
                      onClipCreated(placed.clip, documentVersion, {
                        keepRecordPanel: true,
                      });
                    }
                    onLastScratchClipIdChange(placed.clip.id);
                    setCatalogMessage(
                      placed.reusedExistingCopy
                        ? tr("uzytoIstniejacejKopiiTake")
                        : tr("skopiowanoSampleIUmieszczono"),
                    );
                  },
                };
              });
              if (!result.ok) {
                setWorkflowError(result.message);
              }
              setCatalogBusy(false);
            })();
          }}
        >
          {tl(catalogBusy ? tr("kopiowanie") : tr("kopiujIUmiescNa"))}
        </Button>
        {catalogMessage ? (
          <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
            {tl(catalogMessage)}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            className="min-h-11 w-full"
            disabled={trackCreateBusy !== null}
            onClick={() => {
              void addProductTrack("SAMPLE");
            }}
          >
            {tl(trackCreateBusy === "SAMPLE" ? tr("dodawanie") : tr("dodajSample"))}
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-11 w-full"
            disabled={trackCreateBusy !== null}
            onClick={() => {
              void addProductTrack("SCRATCH");
            }}
          >
            {tl(trackCreateBusy === "SCRATCH" ? tr("dodawanie") : tr("dodajScratch"))}
          </Button>
        </div>
        <StudioMarkersPanel
          projectId={projectId}
          getExpectedDocumentVersion={persistVersionTip.expected}
          enqueuePersistAsync={enqueuePersistAsync}
          getPlayheadMs={transport.getPlayheadMs}
          onSeek={transport.seek}
          onDocumentVersionAck={ackDocumentVersion}
        />
        <StudioScratchPanel
          sourceDurationMs={Math.max(1, transport.timelineLengthMs)}
          playheadInSourceMs={Math.floor(transport.getPlayheadMs())}
          onLiveRate={(rate, reverse) => {
            transport.applyScratchLive(rate, lastScratchClipId, reverse);
          }}
          onCueJump={(cueMs) => {
            transport.seek(cueMs);
          }}
          onApprove={(approved) => {
            if (!lastScratchClipId) {
              setCatalogMessage(
                tr("najpierwUmiescKlipTake"),
              );
              return;
            }
            void (async () => {
              const result = await enqueuePersistAsync(async () => {
                const response = await fetch(
                  `/api/studio/projects/${projectId}/clips/${lastScratchClipId}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      op: "set_scratch",
                      cueMs: approved.cueMs,
                      reverse: approved.reverse,
                      rate: approved.rate,
                      expectedDocumentVersion: persistVersionTip.expected(),
                    }),
                  },
                );
                const body = (await response.json().catch(() => null)) as {
                  clip?: StudioClipDto;
                  documentVersion?: number;
                  message?: string;
                  error?: string;
                } | null;
                if (!response.ok || !body?.clip) {
                  return classifyPersistHttpFailure({
                    status: response.status,
                    message:
                      body?.message ||
                      body?.error ||
                      tr("nieUdaloSieZapisac"),
                  });
                }
                return {
                  ok: true as const,
                  documentVersion: ackDocumentVersion(body.documentVersion),
                  apply: () => {
                    setCatalogMessage(tr("zapisanoZatwierdzonyStanScratch"));
                  },
                };
              });
              if (!result.ok) setWorkflowError(result.message);
            })();
          }}
        />
      </div>

      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("mikrofon")}</p>
        <p className="text-xs text-[var(--brd-mute)]">{tr("zrodloNagrywania")}</p>
        <label className="block w-full text-xs text-[var(--brd-mute)]">
          <span className="sr-only">{tr("mikrofon")}</span>
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
            aria-label={tr("wybierzMikrofon")}
          >
            <option value="">
              {tr("automatycznieUrzadzenieSystemowe")}
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
                      {tl(d.label)}
                    </option>
                  ))
              : null}
            {advancedMicOpen
              ? inputDevices.inputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {tl(d.label)}
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
            {tl(advancedMicOpen
              ? tr("ukryjZaawansowaneUrzadzenia")
              : tr("zaawansowaneUstawieniaAudio"))}
          </button>
        ) : null}
        {inputDevices.permission === "UNAVAILABLE" ||
        inputDevices.lastErrorCode === "NO_INPUT_DEVICE" ? (
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            {tr("brakWykrytegoMikrofonuPolacz")}
          </p>
        ) : null}
        {inputDevices.softNotice ? (
          <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
            {tl(inputDevices.softNotice)}
          </p>
        ) : null}

        <div className="w-full space-y-1 pt-1">
          <p className="text-xs text-[var(--brd-mute)]">{tr("testMikrofonu")}</p>
          {testerError ? (
            <p className="text-xs text-destructive" role="alert">
              {tl(testerError)}
            </p>
          ) : meterStream ? (
            <>
              <p className="text-xs text-[var(--brd-ink)]" role="status">
                {tl(mic.level === "silent"
                  ? tr("brakSygnaluSprawdzMikrofon")
                  : mic.level === "quiet"
                    ? tr("sygnalJestBardzoSlaby")
                    : mic.level === "clip" || mic.level === "hot"
                      ? tr("uwagaSygnalBliskoPrzesterowania")
                      : tr("mikrofonDziala"))}
              </p>
              <BrdInputMonitor level={mic.level} peak={mic.peak} />
              <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--brd-ink)]">
                <input
                  type="checkbox"
                  checked={monitorOn}
                  onChange={(e) => setMonitorOn(e.target.checked)}
                />
                {tr("monitorDoUchaSuchy")}
              </label>
              {monitorOn ? (
                <p className="text-[11px] text-[var(--brd-mute)]" role="status">
                  {tr("uslyszyszEchoILatencje")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-[var(--brd-mute)]" role="status">
              {tr("oczekiwanieNaUprawnienia")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2">
        <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("odsluch")}</p>
        {outputDevices.pickerEnabled ? (
          <label className="block w-full text-xs text-[var(--brd-mute)]">
            {tr("urzadzenie")}
            <select
              className="mt-1 w-full max-w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
              value={outputDevices.selectedDeviceId ?? ""}
              onChange={(e) => {
                outputDevices.setSelectedDeviceId(
                  e.target.value === "" ? null : e.target.value,
                );
              }}
              aria-label={tr("wybierzUrzadzenieOdsluchu")}
            >
              <option value="">{tr("automatyczneUrzadzenieSystemowe")}</option>
              {outputDevices.outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {tl(d.label)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            {tr("automatycznyUrzadzenieSystemoweWybor")}
          </p>
        )}
        {outputDevices.softNotice ? (
          <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
            {tl(outputDevices.softNotice)}
          </p>
        ) : null}
      </div>

      {contextError || state.error || workflowError ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(contextError ?? state.error ?? workflowError)}
        </p>
      ) : null}

      {keptMessage && state.phase !== "READY_TAKE" ? (
        <p className="text-sm text-[var(--brd-ink-soft)]" role="status">
          {tl(keptMessage)}
        </p>
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
            {tl(primaryLabel)}
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
            aria-label={tr("importujGotowyPlikWokalu")}
          >
            {tl(workflowBusy === "import" ||
            state.phase === "UPLOADING" ||
            state.phase === "PROCESSING"
              ? tr("importowanie")
              : tr("importujWokal"))}
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
              {tr("anuluj")}
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
          {tl(libraryOpen ? tr("mojeTakeI") : tr("mojeTakeI2"))}
        </Button>
        {libraryOpen ? (
          <div className="space-y-2" aria-label={tr("listaReadyTake")}>
            {libraryLoading ? (
              <p className="text-xs text-[var(--brd-mute)]">{tr("wczytywanie")}</p>
            ) : null}
            {libraryError ? (
              <p className="text-sm text-destructive" role="alert">
                {tl(libraryError)}
              </p>
            ) : null}
            {!libraryLoading && libraryTakes.length === 0 && !libraryError ? (
              <p className="text-xs text-[var(--brd-mute)]">
                {tr("brakGotowychNagranDo")}
              </p>
            ) : null}
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {libraryTakes.map((take) => (
                <li
                  key={take.id}
                  className="rounded border border-[var(--brd-line)] p-2"
                >
                  <p className="text-sm text-[var(--brd-ink)]">
                    {tl(take.displayTitle)}
                    {!take.sameBeat ? (
                      <span className="ml-1 text-[11px] text-[var(--brd-mute)]">
                        {tr("innyBit")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-[var(--brd-mute)]">
                    {tl(take.durationSeconds != null
                      ? `${take.durationSeconds.toFixed(1)}s`
                      : "—")}
                    {" · "}
                    {tr("playhead")}{" "}{tl(formatStudioTimeMs(transport.state.playheadMs))}
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
                      {tr("odtworz")}
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
                      onClick={() => void onLibraryPlace(take, false)}
                    >
                      {tr("umiescWStudio")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      variant="outline"
                      disabled={
                        libraryBusyId === take.id ||
                        state.phase === "READY_TAKE" ||
                        !trackId
                      }
                      onClick={() => void onLibraryPlace(take, true)}
                    >
                      {tr("zastap")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--brd-mute)]">
        {tr("limit")}{" "}{maxSeconds}{tr("sIstniejaceLimityKonta")}
      </p>
    </section>
  );
}
