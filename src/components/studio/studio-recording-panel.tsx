"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useLocale, useTranslations } from "next-intl";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "@/components/ui/app-link";
import { createPortal } from "react-dom";

import { BrdInputMonitor } from "@/components/brand/brd-input-monitor";
import { Button } from "@/components/ui/button";
import { StudioScratchPanel } from "@/components/studio/studio-scratch-panel";
import {
  useStudioTransportControls,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import { StudioStemImport } from "@/components/studio/studio-stem-import";
import { StudioQuotaLine } from "@/components/studio/studio-quota-line";
// Lyrics card (setup pane) and Sample Lab desk / play keys (Sample tab) are hidden on first open.
import { StudioLyricsCard, StudioPlayKeys, StudioSampleDesk } from "@/components/studio/studio-lazy-panels";
import type { BitekApply, BitekPreview } from "@/components/studio/sample-bitek-card";
import type { SamplePlacementPlan } from "@/lib/studio/samples/sample-bitek-plan";
import type { StudioMidiV1 } from "@/lib/studio/studio-midi";
import { placeOwnedStudioSample } from "@/lib/studio/studio-scratch-place";
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
  findOverlappingTakeClips,
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
import { decideLiveTakeCoach, type LiveCoachCue, type LiveCoachSample } from "@/lib/studio/bitek/live-take-coach";
import { setBitekLiveTakeLevel } from "@/lib/studio/bitek/live-take-level";
import { requestStudioGoMix, saveBitekRecordHandoff, takeIssueFromPeak } from "@/lib/studio/bitek/record-handoff";
import { beatClipAt, headphonesLikely, readHeadphones, recordsWithoutAutoAlign, writeHeadphones } from "@/lib/studio/recording/auto-align";
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
import { exactBeatDurationMs } from "@/lib/studio/studio-daw-clock";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import {
  acquireMicStream,
  stopMediaStreamTracks,
  studioDeviceErrorMessagePl,
} from "@/lib/studio/studio-input-devices";
import {
  TakeReplaceRequiredError,
  TakeTransportError,
  finalizeTakeRecordingUpload,
  toUserFacingTakeUploadError,
  uploadTakeRecordingBlob,
  type TakeUploadTransportResult,
} from "@/lib/takes/client-upload";
import {
  liveTakeStatusForPhase,
  studioLiveTakeStore,
} from "@/lib/studio/studio-live-take";
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
  recordHoldFor,
  recordingInterruptedNoticePl,
  recordingSecondsLeft,
  reduceRecordingUi,
  shouldCancelArmingOnLeave,
  type RecordHold,
  transportRecordAction,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";
import {
  STUDIO_VOCAL_IMPORT_ACCEPT,
  gateStudioVocalImportFile,
  isStudioVocalImportTooLong,
  probeStudioVocalImportDurationSeconds,
  STUDIO_VOCAL_IMPORT_TOO_LONG_MESSAGE,
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
import type { ReplaceableTakeSummary } from "@/lib/takes/claim-errors";
import {
  nextMicHold,
  startMicHold,
  type MicHoldStatus,
} from "@/lib/studio/recording/mic-level-hold";
import {
  RECORD_LEAD_MS,
  countInPlan,
  countInPlayheadMoved,
  readRecordSettings,
  resolveRecordTrackId,
  writeRecordSettings,
} from "@/lib/studio/recording/record-settings";
import {
  UNPLACED_TAKE_EVENT,
  clearPendingPlacement,
  clearUnplacedTakeMemo,
  clipDurationCapMs,
  readTakePlacement,
  rememberTakePlacement,
  writePendingPlacement,
  writeUnplacedTakeMemo,
} from "@/lib/studio/unplaced-take-memo";
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

/** Finished audio that is not on the server yet (failed upload), kept in memory for a retry. */
type UnsentTake = {
  beatId: string;
  blob: Blob;
  mimeType: string;
  /** Audio already uploaded: only the finalize step is left. */
  uploadedTakeId: string | null;
  startMs: number;
  trackId: string;
  writer: TakeRecoveryWriter | null;
};

/** 180 → "3:00". */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A control of this panel that "Dodaj" or "Znajdź funkcję" can lead to. */
export type StudioRecordFocus = {
  id: number;
  target: "latency" | "mic" | "countdown" | "recMode" | "takes" | "scratch" | "stems" | "importVocal" | "lyrics";
};

const STUDIO_RECORD_FOCUS_PANE: Partial<Record<StudioRecordFocus["target"], "take" | "setup" | "lanes" | "scratch">> = {
  mic: "take",
  countdown: "setup",
  recMode: "setup",
  takes: "lanes",
  scratch: "scratch",
  stems: "setup",
  importVocal: "take",
  lyrics: "take",
};

/** Only this label follows the playhead, not the whole panel. */
function PlayheadTime() {
  const tl = useLibText();
  const { playheadMs } = useStudioTransportPlayhead();
  return <>{tl(formatStudioTimeMs(playheadMs))}</>;
}

function recorderMime(): string | null {
  const support = detectMediaRecorderSupport();
  return support.supported ? support.mimeType : null;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function StudioRecordingPanel({
  projectId,
  getExpectedDocumentVersion,
  enqueuePersistAsync,
  onDocumentVersionAck,
  tracks,
  clips = [],
  onClipCreated,
  onClipUpdated,
  onTrackCreated,
  visible = true,
  onHoldChange,
  onRecordingActiveChange,
  onCaptureInterrupted,
  onLocalRecoveryChanged,
  recoverySavedKey = 0,
  embedded = false,
  simple = false,
  planLimits = null,
  samplesMode = false,
  /** Phase 7.1.3 — Studio selection SSOT; no third track store. */
  preferredTrackId = null,
  selectedClipId = null,
  lastScratchClipId: editorScratchClipId,
  onLastScratchClipIdChange,
  onBitekBubble,
  onDocumentReplaced,
  recordRequest = 0,
  onRecordRequestHandled,
  stemLimit = 0,
  trackLimit = 0,
  droppedStems = null,
  onDroppedStemsDone,
  onSaveTrackMidi,
  focusRequest = null,
  onFocusRequestHandled,
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
  clips?: StudioClipDto[];
  onClipCreated: (
    clip: StudioClipDto,
    documentVersion: number,
    options?: {
      keepRecordPanel?: boolean;
      /** A kept take: select the clip, but stay in the recording panel. */
      stayOnRecord?: boolean;
      /** Clips the server took off the track (replace). */
      removedClipIds?: string[];
    },
  ) => void;
  /** Saved scratch state of a clip that is already on the timeline. */
  onClipUpdated?: (clip: StudioClipDto, documentVersion: number) => void;
  /** The panel is on screen (it stays mounted without a host while a take is held). */
  visible?: boolean;
  /** Why the panel must not be unmounted now. */
  onHoldChange?: (hold: RecordHold) => void;
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
  /** Record-step simple view: mic, record, import, keep or discard. */
  simple?: boolean;
  /** Plan limits shown under the record button (from plan-policy, server enforces). */
  planLimits?: { sessionsPerDay: number; maxTakeSeconds: number; takeHours: number } | null;
  /** Sample tab: instruments and the sample desk, without the microphone. */
  samplesMode?: boolean;
  preferredTrackId?: string | null;
  /** Clip selected on the timeline (the scratch tab edits it). */
  selectedClipId?: string | null;
  /** Editor SSOT — scratch clip survives panel unmount. */
  lastScratchClipId: string | null;
  onLastScratchClipIdChange: (clipId: string | null) => void;
  /** Recording P0 — BITEK notice (latency / Bluetooth); null clears it. */
  onBitekBubble?: (bubble: BitekBubble | null) => void;
  /** Recording P0 — comp apply returns a fresh document (several CAS ops). */
  onDocumentReplaced?: (doc: StudioProjectDocument) => void;
  /**
   * Top-bar REC press counter (>0 = pending press). Consumed once via
   * onRecordRequestHandled — survives the panel mounting on that same press.
   */
  recordRequest?: number;
  onRecordRequestHandled?: () => void;
  /** Plan stems per project (0 = stem import is not in the plan, the card is hidden). */
  stemLimit?: number;
  /** Plan track cap (Bit not counted) — free slots for imported stems. */
  trackLimit?: number;
  /** Files dropped on the timeline, waiting for confirmation in the stem card. */
  droppedStems?: { id: number; files: File[]; atMs: number } | null;
  onDroppedStemsDone?: () => void;
  /** Key clicks become MIDI notes on the armed track. */
  onSaveTrackMidi?: (trackId: string, midi: StudioMidiV1) => void;
  /** "Dodaj" and "Znajdź funkcję": open the pane with this control and scroll to it. */
  focusRequest?: StudioRecordFocus | null;
  onFocusRequestHandled?: () => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioRecordingPanel");
  /** The user confirmed the rights statement for imported vocal files. */
  const importRightsRef = useRef(false);
  const locale = useLocale();
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
  // Controls only: the playhead and meter bands would re-render this panel every frame.
  const transport = useStudioTransportControls();
  const getPlayheadMs = transport.getPlayheadMs;
  const getAuxContext = transport.getContextForAux;
  const [localTracks, setLocalTracks] = useState<StudioTrackDto[]>([]);
  const [trackCreateBusy, setTrackCreateBusy] = useState<
    "SAMPLE" | "SCRATCH" | null
  >(null);
  const mergedTracks = useMemo(
    () => [
      ...tracks,
      ...localTracks.filter((local) => !tracks.some((t) => t.id === local.id)),
    ],
    [tracks, localTracks],
  );
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
      tr,
    ],
  );
  /** Stem import: add a named SAMPLE track (server: up to three CAS steps), then show it in the editor. */
  const createStemTrack = useCallback(
    async (input: { name: string; role: string }): Promise<{ ok: true; trackId: string } | { ok: false; message: string }> => {
      let createdId: string | null = null;
      const result = await enqueuePersistAsync(async () => {
        try {
          const response = await fetch(`/api/studio/projects/${projectId}/stems/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: persistVersionTip.expected(),
              name: input.name,
              trackRole: input.role,
            }),
          });
          const body = (await response.json().catch(() => null)) as {
            track?: StudioTrackDto;
            documentVersion?: number;
            error?: string;
            message?: string;
            code?: string;
          } | null;
          if (!response.ok || !body?.track) {
            return classifyPersistHttpFailure({
              status: response.status,
              message: body?.message || body?.error || tr("nieUdaloSieDodacSciezki"),
              code: body?.code,
            });
          }
          const version = ackDocumentVersion(body.documentVersion);
          return {
            ok: true as const,
            documentVersion: version,
            apply: () => {
              createdId = body.track!.id;
              setLocalTracks((current) => [...current, body.track!]);
              onTrackCreated?.(body.track!, version);
            },
          };
        } catch {
          return classifyPersistNetworkFailure(tr("nieUdaloSieDodacSciezki"));
        }
      });
      return result.ok && createdId ? { ok: true, trackId: createdId } : { ok: false, message: result.ok ? tr("nieUdaloSieDodacSciezki") : result.message };
    },
    [ackDocumentVersion, enqueuePersistAsync, onTrackCreated, persistVersionTip, projectId, tr],
  );


  /** Stem import: put the READY take on its track (0 ms, or where the file was dropped). */
  const placeStemTake = useCallback(
    async (input: { trackId: string; takeId: string; timelineStartMs?: number }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const result = await enqueuePersistAsync(async () => {
        try {
          const response = await fetch(`/api/studio/projects/${projectId}/record/place`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trackId: input.trackId,
              takeId: input.takeId,
              timelineStartMs: input.timelineStartMs ?? 0,
              expectedDocumentVersion: persistVersionTip.expected(),
            }),
          });
          const body = (await response.json().catch(() => null)) as {
            clip?: StudioClipDto;
            documentVersion?: number;
            reusedExisting?: boolean;
            error?: string;
            code?: string;
          } | null;
          if (!response.ok || !body?.clip) {
            return classifyPersistHttpFailure({
              status: response.status,
              message: body?.error || tr("nieUdaloSiePolozycStemu"),
              code: body?.code,
            });
          }
          const version = ackDocumentVersion(body.documentVersion);
          return {
            ok: true as const,
            documentVersion: version,
            apply: () => {
              if (!body.reusedExisting) onClipCreated(body.clip!, version, { keepRecordPanel: true });
            },
          };
        } catch {
          return classifyPersistNetworkFailure(tr("nieUdaloSiePolozycStemu"));
        }
      });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
    [ackDocumentVersion, enqueuePersistAsync, onClipCreated, persistVersionTip, projectId, tr],
  );
  // Scratch edits the selected recording, else the last clip added here.
  const scratchClip =
    clips.find((c) => c.id === selectedClipId && c.sourceKind === "TAKE") ??
    clips.find((c) => c.id === editorScratchClipId && c.sourceKind === "TAKE") ??
    null;
  const lastScratchClipId = scratchClip?.id ?? null;
  // Never the Bit track: a vocal there would sit under the beat's clip.
  const trackChoices = recordableTracks;

  /** Manual override is valid only for the preferredTrackId it was chosen against. */
  const [manualTrackId, setManualTrackId] = useState<string | null>(null);
  const [manualForPreferred, setManualForPreferred] = useState<string | null>(
    null,
  );
  const trackIdOverride =
    manualTrackId && manualForPreferred === (preferredTrackId ?? null)
      ? manualTrackId
      : null;
  const trackId = resolveRecordTrackId({
    tracks: trackChoices,
    manualId: trackIdOverride,
    selectedId: preferredTrackId,
  });
  const [beatId, setBeatId] = useState<string | null>(null);
  const [maxSeconds, setMaxSeconds] = useState(planLimits?.maxTakeSeconds ?? 180);
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
  const [savedSettings] = useState(() => readRecordSettings(projectId));
  const [countInBars, setCountInBars] = useState<StudioCountInBars>(savedSettings.countInBars);
  const [punchEnabled, setPunchEnabled] = useState(savedSettings.punchEnabled);
  const [punchInMs, setPunchInMs] = useState(savedSettings.punchInMs);
  const [punchOutMs, setPunchOutMs] = useState(savedSettings.punchOutMs);
  const [countInActive, setCountInActive] = useState(false);
  const [monitorOn, setMonitorOn] = useState(savedSettings.monitorOn);
  /** Light headphone reverb for confidence; never printed into the recorded file. */
  const [monitorReverbOn, setMonitorReverbOn] = useState(savedSettings.monitorReverbOn);
  const [unsent, setUnsent] = useState<UnsentTake | null>(null);
  const unsentRef = useRef<UnsentTake | null>(null);
  const [replaceCandidates, setReplaceCandidates] = useState<ReplaceableTakeSummary[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [samplesPane, setSamplesPane] = useState<"samples" | "keys">("samples");
  const [stemsBusy, setStemsBusy] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  /** The user asked for a microphone test; nothing opens the mic on its own. */
  const [testerOn, setTesterOn] = useState(false);
  const [outputError, setOutputError] = useState(false);
  /** Every start / prepare / cancel bumps it: a late answer of an older one changes nothing. */
  const startRunRef = useRef(0);
  const auxStopRef = useRef<(() => void) | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const takeWorkflowRef = useRef<HTMLDivElement | null>(null);
  const unsentBoxRef = useRef<HTMLDivElement | null>(null);

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
  const keepInFlightRef = useRef(false);
  const placedTakeIdsRef = useRef<Set<string>>(new Set());
  const beatIdRef = useRef<string | null>(null);
  const maxSecondsRef = useRef(maxSeconds);
  const trackIdRef = useRef(trackId);
  const captureTrackIdRef = useRef<string>("");
  const recordStartMsRef = useRef<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [testerStream, setTesterStream] = useState<MediaStream | null>(null);
  const [testerError, setTesterError] = useState<string | null>(null);
  const [recordPane, setRecordPane] = useState<"take" | "setup" | "lanes" | "scratch">("take");
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
  const [recMode, setRecMode] = useState<RecToolsMode>(savedSettings.recMode);
  const [sectionBars, setSectionBars] = useState<SectionBars>(savedSettings.sectionBars);
  const [sectionStartMs, setSectionStartMs] = useState<number | null>(savedSettings.sectionStartMs);
  const [punchLine, setPunchLine] = useState(savedSettings.punchLine);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [calibration, setCalibration] = useState<CalibrationUi>({ status: "idle" });
  const [latencyOpenSignal, setLatencyOpenSignal] = useState(0);
  /** Simple view: the card appears only when BITEK's "Kalibruj" asked for it. */
  const [latencyShown, setLatencyShown] = useState(false);
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
    /** Recorded time before startMs (count-in lead, pre-roll). */
    headMs: number;
    restore: (() => void) | null;
    placement: { takeId: string; timelineStartMs: number; sourceOffsetMs: number } | null;
    /** Automatic latency of this take, running while it uploads. */
    auto: Promise<void> | null;
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
    headMs: 0,
    restore: null,
    placement: null,
    auto: null,
  });
  useEffect(() => {
    writeRecordSettings(projectId, {
      recMode,
      sectionBars,
      sectionStartMs,
      punchLine,
      countInBars,
      punchEnabled,
      punchInMs,
      punchOutMs,
      monitorOn,
      monitorReverbOn,
    });
  }, [projectId, recMode, sectionBars, sectionStartMs, punchLine, countInBars, punchEnabled, punchInMs, punchOutMs, monitorOn, monitorReverbOn]);
  const captureActive = isRecordingCaptureActive(state.phase);
  const showWorkflow = state.phase === "READY_TAKE" && state.takeId;

  // Remember a READY take until it is kept or discarded, so a reload can offer it again.
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.phase === "READY_TAKE" && state.takeId) {
      const startMs = recordStartMsRef.current;
      const memoTrack = captureTrackIdRef.current || trackIdRef.current;
      if (startMs != null && memoTrack) {
        const placement = alignRef.current.placement;
        const aligned = placement?.takeId === state.takeId ? placement : null;
        rememberTakePlacement(projectId, {
          takeId: state.takeId,
          trackId: memoTrack,
          timelineStartMs: aligned?.timelineStartMs ?? startMs,
          sourceOffsetMs: aligned?.sourceOffsetMs ?? 0,
        });
        clearPendingPlacement(projectId);
        writeUnplacedTakeMemo(projectId, {
          takeId: state.takeId,
          trackId: memoTrack,
          startMs: aligned?.timelineStartMs ?? startMs,
          sourceOffsetMs: aligned?.sourceOffsetMs ?? 0,
          durationSeconds: state.takeDurationSeconds ?? null,
        });
      }
    } else if (prev === "READY_TAKE") {
      // Kept, discarded or reset in this session: nothing left to offer.
      clearUnplacedTakeMemo(projectId);
    }
  }, [projectId, state.phase, state.takeId, state.takeDurationSeconds]);

  const meterStream =
    state.phase === "RECORDING" || state.phase === "READY"
      ? micStream ?? testerStream
      : testerStream;
  const mic = useMicAnalyser(meterStream, { barCount: 32, hz: 15 });
  const micHoldRef = useRef(startMicHold(0));
  const [micStatus, setMicStatus] = useState<MicHoldStatus>("checking");
  useEffect(() => {
    micHoldRef.current = startMicHold(Date.now());
    const timer = window.setTimeout(() => setMicStatus("checking"), 0);
    return () => window.clearTimeout(timer);
  }, [meterStream]);
  useEffect(() => {
    if (!meterStream) return;
    const next = nextMicHold(micHoldRef.current, mic.level, Date.now());
    if (next.status !== micHoldRef.current.status) setMicStatus(next.status);
    micHoldRef.current = next;
  }, [mic, meterStream]);

  const inputDevices = useStudioInputDevices({
    recordingActive: captureActive,
  });

  const setOutputSinkId = transport.setOutputSinkId;
  const onSinkIdChange = useCallback(
    (sinkId: string | null) => {
      void setOutputSinkId(sinkId)
        .then((result) => setOutputError(!result.applied && result.reason !== "no_context" && sinkId != null))
        .catch(() => setOutputError(sinkId != null));
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
    readContextEstimate: () => contextLatencyEstimate(getAuxContext()),
    signedIn: true,
  });
  /** Headphones: the browser must not filter the voice (shorter delay, and the trace of the beat stays measurable). */
  const [headphonesPick, setHeadphonesPick] = useState<{ key: string; value: boolean } | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setStorageReady(true));
  }, []);
  const headphonesOn =
    (headphonesPick?.key === latency.deviceKey ? headphonesPick.value : null) ??
    (storageReady ? readHeadphones(safeLocalStorage(), latency.deviceKey) : null) ??
    headphonesLikely({ inputLabel, outputLabel });
  /** Older iPhone or iPad, not calibrated yet: the voice does not line up by itself there. */
  const needsManualCalibration =
    storageReady &&
    latency.profile?.roundTripMs == null &&
    !latency.profile?.manualOffsetMs &&
    recordsWithoutAutoAlign(recorderMime());
  const [autoAlignedMs, setAutoAlignedMs] = useState<number | null>(null);
  const laneStore = useTakeLanes(projectId, true);
  // Unrounded, and counted from the grid's bar 1: loops and punch lines match the timeline.
  const beatMs = exactBeatDurationMs(transport.tempoBpm);
  const barMs = beatMs * (transport.timeSignatureNum > 0 ? transport.timeSignatureNum : 4);
  const section =
    sectionStartMs != null
      ? sectionRange({
          startMs: sectionStartMs,
          bars: sectionBars,
          barMs,
          timelineLengthMs: transport.timelineLengthMs,
          originMs: transport.gridOriginMs,
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
  const takePeakRef = useRef<{ peakDb: number; clipping: boolean } | null>(null);
  const prevRecPhase = useRef(state.phase);
  const [takeIssue, setTakeIssue] = useState<{ issue: "quiet" | "clip"; peakDb: number } | null>(null);
  const coachSamplesRef = useRef<LiveCoachSample[]>([]);
  const coachLastRef = useRef<{ cue: LiveCoachCue | null; at: number }>({ cue: null, at: 0 });
  const [liveCue, setLiveCue] = useState<LiveCoachCue | null>(null);
  const hasBeat = transport.hasBeat;
  const tempoBpm = transport.tempoBpm;
  useEffect(() => {
    const prev = prevRecPhase.current;
    prevRecPhase.current = state.phase;
    if (state.phase === "RECORDING") {
      const linear = Math.max(mic.peak, mic.windowPeak);
      const db = linear > 0 ? 20 * Math.log10(Math.min(1, linear)) : -100;
      if (Number.isFinite(db) && db > -90) {
        const latched = takePeakRef.current;
        takePeakRef.current = {
          peakDb: Math.max(latched?.peakDb ?? -100, db),
          clipping: Boolean(latched?.clipping) || mic.level === "clip" || db >= -1,
        };
      }
      if (Number.isFinite(db)) {
        const now = Date.now();
        const samples = coachSamplesRef.current;
        samples.push({
          atMs: now,
          peakDb: db,
          playheadMs: hasBeat ? getPlayheadMs() : null,
        });
        const cutoff = now - 5000;
        while (samples.length > 0 && (samples[0]?.atMs ?? 0) < cutoff) samples.shift();
        const decision = decideLiveTakeCoach({
          samples,
          nowMs: now,
          bpm: tempoBpm,
          lastCue: coachLastRef.current.cue,
          lastCueAtMs: coachLastRef.current.at || null,
        });
        if (decision.ready && decision.clear) {
          coachLastRef.current = { cue: null, at: now };
          setLiveCue(null);
        } else if (decision.speak && decision.cue) {
          coachLastRef.current = { cue: decision.cue, at: now };
          setLiveCue(decision.cue);
        }
      }
      return;
    }
    if (coachSamplesRef.current.length || coachLastRef.current.cue) {
      coachSamplesRef.current = [];
      coachLastRef.current = { cue: null, at: 0 };
      setLiveCue(null);
    }
    if (prev !== "RECORDING") return;
    const latched = takePeakRef.current;
    takePeakRef.current = null;
    if (!latched) return;
    setBitekLiveTakeLevel(projectId, latched);
    const issue = takeIssueFromPeak(latched.peakDb, latched.clipping);
    setTakeIssue(issue ? { issue, peakDb: latched.peakDb } : null);
  }, [state.phase, mic.peak, mic.peakDb, mic.windowPeak, mic.level, projectId, hasBeat, tempoBpm, getPlayheadMs]);
  useEffect(() => {
    const report = bitekReportRef.current;
    if (!report) return;
    if (state.phase === "RECORDING" && liveCue) {
      const liveKey = liveCue === "hot" ? "msg.liveHot" : liveCue === "quiet" ? "msg.liveQuiet" : liveCue === "uneven" ? "msg.liveUneven" : "msg.liveOffbeat";
      report({
        key: `rec-live-${liveCue}`,
        mood: "alert",
        text: tBitek(liveKey),
      });
      return;
    }
    if (takeIssue) {
      const db = Math.round(takeIssue.peakDb);
      report({
        key: `rec-take-${takeIssue.issue}-${db}`,
        mood: "alert",
        text: tBitek(takeIssue.issue === "quiet" ? "msg.takeQuiet" : "msg.takeClip", { db }),
        actions: [
          {
            id: "fixInMix",
            label: tBitek("akcja.fixInMix"),
            primary: true,
            onClick: () => {
              saveBitekRecordHandoff({ projectId, issue: takeIssue.issue, peakDb: takeIssue.peakDb, at: Date.now() });
              requestStudioGoMix();
            },
          },
        ],
      });
      return;
    }
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
          onClick: openLatencyCard,
        },
        {
          id: "manualLatency",
          label: tBitek("akcja.manualLatency"),
          onClick: openLatencyCard,
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitives only; avoids a render loop with the editor
  }, [latency.warning, latency.deviceKey, latency.baseMs, takeIssue, projectId, liveCue, state.phase]);
  useEffect(() => () => bitekReportRef.current?.(null), []);

  useEffect(() => {
    if (!monitorOn || !meterStream) return;
    const ctx = getAuxContext() as unknown as AudioContext | null;
    if (!ctx?.createMediaStreamSource || !ctx.createGain) return;
    const source = ctx.createMediaStreamSource(meterStream);
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    source.connect(dry);
    dry.connect(ctx.destination);

    const teardown: Array<{ disconnect: () => void }> = [source, dry];
    if (monitorReverbOn && typeof ctx.createDelay === "function") {
      // Short feedback delay = confidence room; wet only, not on the MediaRecorder path.
      const delay = ctx.createDelay(0.35);
      delay.delayTime.value = 0.048;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.22;
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      dry.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(ctx.destination);
      teardown.push(delay, feedback, wet);
    }

    return () => {
      for (const node of teardown) {
        try {
          node.disconnect();
        } catch {
          // already torn down
        }
      }
    };
  }, [meterStream, monitorOn, monitorReverbOn, getAuxContext]);

  // AUD-01 — live mic tester on request (reuse useMicAnalyser; hold stream, no Studio engine).
  useEffect(() => {
    let cancelled = false;
    const blockTester =
      !testerOn ||
      !visible ||
      samplesMode ||
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
          if (testerOn) setTesterError(null);
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
        rawAudio: headphonesOn,
      });
      if (cancelled || captureArmingRef.current) {
        if (result.ok) stopMediaStreamTracks(result.stream);
        return;
      }
      if (!result.ok) {
        stopMediaStreamTracks(testerStreamRef.current);
        testerStreamRef.current = null;
        setTesterStream(null);
        // No new prompt until the user asks again.
        setTesterOn(false);
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
    testerOn,
    visible,
    samplesMode,
    captureArming,
    state.phase,
    inputDevices.selectedDeviceId,
    headphonesOn,
    inputDevices.refreshInputs,
    tr,
  ]);

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // Stop / Pause in the transport (or the end of the timeline) ends the take: same as Stop here.
  const transportPhase = transport.phase;
  const transportPhaseRef = useRef(transportPhase);
  const transportPlayedRef = useRef(false);
  useEffect(() => {
    transportPhaseRef.current = transportPhase;
    if (transportPhase === "playing") {
      transportPlayedRef.current = true;
      return;
    }
    if (state.phase === "RECORDING" && transportPlayedRef.current) {
      transportPlayedRef.current = false;
      void stopAndFinalize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transport- and phase-driven only
  }, [transportPhase, state.phase]);

  // Top-bar REC = real record key (prod bug 2026-10-30): IDLE → mic + auto-start,
  // READY → start, RECORDING → stop. Declared after the ref-sync effects above.
  const autoStartAfterMicRef = useRef(false);
  useEffect(() => {
    if (state.phase === "READY") {
      if (autoStartAfterMicRef.current) {
        autoStartAfterMicRef.current = false;
        void startRecording();
      }
    } else if (state.phase !== "REQUESTING_MIC" && state.phase !== "IDLE") {
      autoStartAfterMicRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase-driven only
  }, [state.phase]);

  useEffect(() => {
    if (!showWorkflow) return;
    takeWorkflowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [showWorkflow, state.takeId]);

  useEffect(() => {
    if (unsent) unsentBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [unsent]);

  useEffect(() => {
    if (recoverySavedKey === 0) return;
    const timer = window.setTimeout(() => {
      // The recovery banner saved this take: nothing is left to send from here.
      unsentRef.current = null;
      setUnsent(null);
      setReplaceCandidates(null);
      if (phaseRef.current === "UPLOAD_ERROR" || phaseRef.current === "FINALIZE_ERROR") {
        dispatch({ type: "RETRY_IDLE" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [recoverySavedKey]);

  useEffect(() => {
    beatIdRef.current = beatId;
    maxSecondsRef.current = maxSeconds;
    trackIdRef.current = trackId;
    recordStartMsRef.current = recordStartMs;
  }, [beatId, maxSeconds, trackId, recordStartMs]);

  // rec-live-ui: growing region + live mic waveform on the capture track, kept
  // (frozen) through upload / keep-or-discard until the real clip replaces it.
  useEffect(() => {
    const status = liveTakeStatusForPhase(state.phase);
    if (!status) {
      studioLiveTakeStore.end();
      return;
    }
    const live = studioLiveTakeStore.get();
    if (status === "recording") {
      const capTrack = captureTrackIdRef.current || trackIdRef.current;
      const startMs = recordStartMsRef.current;
      if (capTrack && startMs != null && (!live || live.status !== "recording")) {
        studioLiveTakeStore.begin(capTrack, startMs);
      }
      return;
    }
    studioLiveTakeStore.setStatus(status);
  }, [state.phase, recordStartMs]);

  useEffect(() => () => studioLiveTakeStore.end(), []);

  useEffect(() => {
    const live = studioLiveTakeStore.get();
    if (state.phase !== "RECORDING" || !startedAtRef.current || !live) return;
    // Recorder clock (not the transport) — matches the final take length even with no beat.
    studioLiveTakeStore.sample(
      live.startMs + (Date.now() - startedAtRef.current) - alignRef.current.headMs,
      mic.windowPeak,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sampled per analyser snapshot (15 Hz)
  }, [mic]);

  useEffect(() => {
    if (!recordRequest) return;
    onRecordRequestHandled?.();
    pressRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- press-driven only
  }, [recordRequest]);

  const busy =
    isRecordingBusy(state.phase) ||
    state.phase === "READY" ||
    state.phase === "READY_TAKE";
  const hold: RecordHold = stemsBusy
    ? "saving"
    : recordHoldFor({ phase: state.phase, arming: captureArming, unsentTake: unsent !== null });
  useEffect(() => {
    onHoldChange?.(hold);
  }, [hold, onHoldChange]);
  // Leaving the record view calls off a take that has not started (mic prompt, count-in).
  useEffect(() => {
    if (shouldCancelArmingOnLeave({ phase: state.phase, arming: captureArming, visible: visible && !samplesMode })) {
      const timer = window.setTimeout(() => cancelRecording(), 0);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view-driven only
  }, [visible, samplesMode, state.phase, captureArming]);
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
      stopAlignSampler();
      restoreLoopAfterCapture();
      transport.pause();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handler reads refs; re-subscribed per stream
  }, [state.phase, micStream, tr]);

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
    const align = alignRef.current;
    return () => {
      mountedRef.current = false;
      startRunRef.current += 1;
      auxStopRef.current?.();
      calibAbortRef.current?.abort();
      passAudioRef.current?.pause();
      passAudioRef.current = null;
      if (align.sampler != null) {
        window.clearInterval(align.sampler);
        align.sampler = null;
      }
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
      restoreLoopAfterCapture();
      transport.stopTakePreview();
      if (phaseRef.current === "READY_TAKE") window.dispatchEvent(new Event(UNPLACED_TAKE_EVENT));
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
      // One take: the first seconds decide, so a later jump of the playhead cannot spoil them.
      const enough =
        a.mode === "single" && a.recT0 != null && sample.perfMs - a.recT0 > a.headMs + 5_000;
      if (!enough && (!prev || prev.playheadMs !== playheadMs) && a.samples.length < 20_000) {
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

  /**
   * Visual + click count-in on the Studio context when there is no room before the start.
   * Resolves false when it was called off. `onLead` fires `leadMs` before the end.
   */
  async function auxCountIn(
    beats: number,
    current: () => boolean,
    lead?: { leadMs: number; onLead: () => void },
  ): Promise<boolean> {
    const sources: { stop: () => void }[] = [];
    let wake: (() => void) | null = null;
    auxStopRef.current = () => {
      for (const src of sources.splice(0)) {
        try {
          src.stop();
        } catch {
          // already ended
        }
      }
      wake?.();
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, Math.max(0, ms));
        wake = () => {
          window.clearTimeout(id);
          resolve();
        };
      });
    const ctx = getAuxContext() as unknown as AudioContext | null;
    if (ctx && typeof ctx.createBuffer === "function") {
      try {
        if (ctx.state !== "running") await Promise.race([ctx.resume(), wait(500)]);
        if (!current()) return false;
        const pcm = renderCalibrationClick(ctx.sampleRate, 0.35);
        const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
        buf.copyToChannel(pcm, 0);
        for (let i = 0; i < beats; i += 1) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(ctx.currentTime + 0.05 + (i * beatMs) / 1000);
          sources.push(src);
        }
      } catch {
        // clicks are a nicety — the countdown still shows
      }
    }
    for (let i = beats; i >= 1; i -= 1) {
      if (!current()) return false;
      setCountdown(i);
      const leadMs = i === 1 && lead ? Math.min(beatMs, lead.leadMs) : 0;
      await wait(beatMs - leadMs);
      if (leadMs > 0 && current()) {
        lead?.onLead();
        await wait(leadMs);
      }
    }
    auxStopRef.current = null;
    if (!current()) return false;
    setCountdown(null);
    return true;
  }

  /** Count-in over the beat: wait until the playhead gets to `untilMs`. */
  function waitForCountIn(params: {
    fromMs: number;
    untilMs: number;
    targetMs: number;
    timeoutMs: number;
    current: () => boolean;
  }): Promise<"ready" | "moved" | "cancelled"> {
    const deadline = Date.now() + params.timeoutMs;
    return new Promise((resolve) => {
      const id = window.setInterval(() => {
        const done = (result: "ready" | "moved" | "cancelled") => {
          window.clearInterval(id);
          resolve(result);
        };
        if (!params.current()) return done("cancelled");
        const playheadMs = getPlayheadMs();
        // Stop / Pause or a moved playhead during the count-in calls the take off.
        if (transportPlayedRef.current && transportPhaseRef.current !== "playing") return done("moved");
        if (countInPlayheadMoved({ playheadMs, fromMs: params.fromMs, targetMs: params.targetMs })) return done("moved");
        if (playheadMs >= params.untilMs || Date.now() >= deadline) done("ready");
      }, 20);
    });
  }

  /** Bitek's "Kalibruj": show the card where it lives. */
  function openLatencyCard() {
    setRecordPane("setup");
    setLatencyShown(true);
    setLatencyOpenSignal((n) => n + 1);
  }

  const focusHandlersRef = useRef({ openLatencyCard, done: onFocusRequestHandled });
  useEffect(() => {
    focusHandlersRef.current = { openLatencyCard, done: onFocusRequestHandled };
  });
  useEffect(() => {
    if (!focusRequest) return;
    const { target } = focusRequest;
    let scrollTimer = 0;
    const timer = window.setTimeout(() => {
      if (target === "latency") focusHandlersRef.current.openLatencyCard();
      else {
        const pane = STUDIO_RECORD_FOCUS_PANE[target];
        if (pane) setRecordPane(pane);
      }
      if (target === "lyrics") setLyricsOpen(true);
      if (target === "takes") setLibraryOpen(true);
      // The pane renders (and the sheet opens) first; then the control is scrolled into view.
      scrollTimer = window.setTimeout(() => {
        const anchor = target === "takes" ? "importVocal" : target;
        const el = document.querySelector<HTMLElement>(
          target === "latency" ? '[data-testid="studio-latency-card"]' : `[data-record-focus="${anchor}"]`,
        );
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.querySelector<HTMLElement>(target === "importVocal" ? '[data-testid="studio-record-import"]' : "button, select, input, summary")?.focus({ preventScroll: true });
        focusHandlersRef.current.done?.();
      }, 120);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
    };
    // One run per request; the handlers live in a ref.
  }, [focusRequest]);

  /** The one record key: panel button, transport REC and keyboard all end here. */
  function pressRecord() {
    const phase = phaseRef.current;
    if (captureArmingRef.current || phase === "REQUESTING_MIC") {
      cancelRecording();
      return;
    }
    if (phase === "RECORDING") {
      void stopAndFinalize();
      return;
    }
    if (samplesMode) return;
    if (phase === "READY_TAKE") {
      setWorkflowError(tr("najpierwZachowajAlboOdrzuc"));
      takeWorkflowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (unsentRef.current) {
      setWorkflowError(tr("najpierwWyslijAlboOdrzuc"));
      return;
    }
    const action = transportRecordAction(phase, Boolean(trackIdRef.current));
    if (action === "start") void startRecording();
    else if (action === "prepare-then-start") {
      calibAbortRef.current?.abort();
      autoStartAfterMicRef.current = true;
      void prepareMicrophone();
    } else if (!trackIdRef.current) {
      setWorkflowError(tr("wybierzSciezkeDoNagrania"));
    }
  }

  async function runCalibration(mode: "click" | "clap") {
    if (captureActive || calibration.status === "running") return;
    transport.pause();
    transport.stopTakePreview();
    const ctx = getAuxContext() as unknown as AudioContext | null;
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
            if (res.status >= 500) {
              // Several saves in a row: some may have landed, so show what the server has now.
              const fresh = (await fetch(`/api/studio/projects/${projectId}`)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)) as { document?: StudioProjectDocument } | null;
              if (fresh?.document) onDocumentReplaced?.(fresh.document);
            }
            return classifyPersistHttpFailure({
              status: res.status >= 500 ? 422 : res.status,
              message: res.status >= 500 ? tRec("compBlad") : body?.error ?? tRec("compBlad"),
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
    // Unknown playhead sample → treat as 0; still apply device latency
    // (same contract as single-take alignedPlacement / c428193).
    const startsRaw =
      a.mode === "loop"
        ? loopPassStarts({ samples: a.samples, section: a.section, recordStartPerfMs: a.recT0 })
        : [recordingPositionOf({ samples: a.samples, targetMs: range.startMs, recordStartPerfMs: a.recT0 }) ?? 0];
    const starts = startsRaw.length > 0 ? startsRaw : [0];
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
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      beatId?: string;
      error?: string;
    } | null;
    if (!res.ok || !json?.beatId) {
      throw new Error(
        json?.error ?? tr("nieUdaloSiePrzygotowac"),
      );
    }
    setBeatId(json.beatId);
    return json.beatId;
  }

  /** Known errors keep their text; anything unknown says what really failed, never raw English. */
  function failureText(error: unknown, fallback: string): string {
    const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    if (!raw) return fallback;
    const shown = toUserFacingTakeUploadError(raw);
    return shown === toUserFacingTakeUploadError("?") ? fallback : shown;
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

    const run = ++startRunRef.current;
    /** Cancelled, replaced by a newer press, or unmounted: a late answer changes nothing. */
    const stale = () => run !== startRunRef.current || !mountedRef.current;
    transport.stopTakePreview();
    stopTesterStream();
    setTesterOn(false);
    setWorkflowError(null);
    setKeptMessage(null);
    dispatch({ type: "REQUEST_MIC" });
    try {
      const resolvedBeatId = beatIdRef.current ?? (await loadContext());
      if (stale()) return;
      beatIdRef.current = resolvedBeatId;
      const eligRes = await fetch("/api/takes/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId: resolvedBeatId }),
      });
      const elig = ((await eligRes.json().catch(() => null)) ?? {}) as {
        success?: boolean;
        allowed?: boolean;
        message?: string;
        upgradeHintMessage?: string | null;
        maxRecordingSeconds?: number;
        error?: string;
      };
      if (stale()) return;
      if (!eligRes.ok || !elig.success) {
        dispatch({
          type: "RECORDING_FAILED",
          message: failureText(elig.error, tr("nieUdaloSieSprawdzic")),
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
        maxSecondsRef.current = Math.floor(elig.maxRecordingSeconds);
      }

      const probe = await inputDevices.probeMicrophone();
      if (stale()) return;
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
      recorderRef.current ??= new TakeMediaRecorder();
      dispatch({ type: "MIC_READY" });
    } catch (error) {
      if (stale()) return;
      recorderRef.current = null;
      dispatch({
        type: "RECORDING_FAILED",
        message: failureText(error, tr("nieUdaloSiePrzygotowac")),
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
    const run = ++startRunRef.current;
    /** False after Anuluj, a newer start or an unmount: this start must leave no recorder behind. */
    const current = () => run === startRunRef.current && mountedRef.current;
    submittingRef.current = true;
    // AUD-01: arm before stop — effect must not re-open tester during recorder.start.
    captureArmingRef.current = true;
    setCaptureArming(true);
    stopTesterStream();
    const flow: RecToolsMode = recMode !== "single" && section ? recMode : "single";
    const flowLine = flow === "punch" ? lines[Math.min(punchLine, lines.length - 1)] ?? null : null;
    const giveUp = (message: string) => {
      cancelRecording();
      setWorkflowError(message);
    };
    if (flow === "punch" && !flowLine) {
      giveUp(tRec("brakLinijki"));
      return;
    }
    const align = alignRef.current;
    align.mode = flow;
    align.section = flow === "single" ? null : section;
    align.line = flowLine;
    align.compensationMs = latency.compensationMs;
    align.auto = null;
    setAutoAlignedMs(null);
    align.placement = null;
    align.recT0 = null;
    align.restore = null;
    align.headMs = 0;
    align.samples = [];
    const punchWin = flowLine ? punchLineWindow({ line: flowLine, barMs, beatMs }) : null;
    const wantsPunch = flow === "single" && punchEnabled;
    const punch = wantsPunch
      ? normalizePunchWindow({
          punchInMs,
          punchOutMs,
          timelineLengthMs: transport.timelineLengthMs,
        })
      : null;
    if (wantsPunch && !punch) {
      giveUp(tr("punchZlyZakres"));
      return;
    }
    const startMs =
      flow === "loop" && section
        ? section.startMs
        : punchWin
          ? punchWin.recordFromMs
          : punch?.punchInMs ?? Math.round(getPlayheadMs());
    if (startMs > transport.timelineLengthMs - 500) {
      giveUp(tr("glowicaNaKoncuOsi"));
      return;
    }
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
    const countIn = countInPlan({ startMs, countMs });
    const beatsPerBar = transport.timeSignatureNum > 0 ? transport.timeSignatureNum : 4;
    setWorkflowError(null);
    setKeptMessage(null);

    const recorder = recorderRef.current ?? new TakeMediaRecorder();
    recorderRef.current = recorder;
    let writer: TakeRecoveryWriter | null = null;
    const chunkBuffer = createTakeRecoveryChunkBuffer();
    const onChunk = chunkBuffer.onChunk;

    try {
      // The microphone opens before the count-in: permission and device wake-up cost no words.
      try {
        await recorder.acquire({
          audioDeviceId:
            inputDevices.audioDeviceIdForRecorder || undefined,
          rawAudio: headphonesOn,
        });
      } catch (firstStartError) {
        // Stale preference: one retry with system default (P5.8 AC-07).
        if (
          inputDevices.audioDeviceIdForRecorder &&
          firstStartError instanceof TakeRecorderError &&
          firstStartError.code === "RECORDING_ERROR"
        ) {
          await recorder.acquire({ rawAudio: headphonesOn });
        } else {
          throw firstStartError;
        }
      }
      const [recoveryStore, ownerUserId] = await Promise.all([
        getBrowserTakeRecoveryStore().catch(() => null),
        getTakeRecoveryViewerUserId(true),
      ]);
      if (!current()) {
        void recorder.cancel();
        return;
      }
      const countInStream = recorder.getStream();
      setMicStream(countInStream);
      transportPlayedRef.current = transportPhaseRef.current === "playing";

      let clicksDone: Promise<boolean> | null = null;
      if (countIn === "transport") {
        setCountInActive(true);
        const fromMs = countInSeekMs(startMs, countMs);
        const prevMetronome = transport.metronomeEnabled;
        transport.seek(fromMs);
        transport.setMetronomeEnabled(true);
        if (transportPhaseRef.current !== "playing") transport.play();
        startAlignSampler();
        align.prerollMs = countMs;
        align.countdownTarget = startMs;
        align.restore = () => {
          if (!prevMetronome) transport.setMetronomeEnabled(false);
        };
        const result = await waitForCountIn({
          fromMs,
          untilMs: startMs - RECORD_LEAD_MS,
          targetMs: startMs,
          timeoutMs: countMs + 8_000,
          current,
        });
        setCountInActive(false);
        if (result === "moved") {
          giveUp(tr("odliczaniePrzerwane"));
          return;
        }
        align.headMs = RECORD_LEAD_MS;
      } else if (countIn === "clicks") {
        // No room before the start (usually 0:00): clicks alone, then the beat from the start.
        setCountInActive(true);
        transport.pause();
        transport.seek(startMs);
        await new Promise<void>((resolve) => {
          clicksDone = auxCountIn(beatsPerBar * countInBars, current, {
            leadMs: RECORD_LEAD_MS,
            onLead: resolve,
          });
          void clicksDone.then(() => resolve());
        });
        setCountInActive(false);
        align.headMs = RECORD_LEAD_MS;
      } else if (flow === "single" && Math.abs(getPlayheadMs() - startMs) > 1 && punch) {
        transport.seek(startMs);
      }
      if (!current()) {
        void recorder.cancel();
        return;
      }
      setRecordStartMs(startMs);
      recordStartMsRef.current = startMs;
      captureTrackIdRef.current = trackIdRef.current;

      const started = await recorder.start({
        audioDeviceId:
          inputDevices.audioDeviceIdForRecorder || undefined,
        rawAudio: headphonesOn,
        onChunk,
      });
      if (run !== startRunRef.current) {
        void recorder.cancel();
        return;
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
      if (!current()) {
        void recorder.cancel();
        void writer.discard();
        return;
      }
      if (countIn !== "transport") startAlignSampler();
      if (flow === "loop" && section) {
        const prevLoop = {
          enabled: transport.loopEnabled,
          startMs: transport.loopStartMs,
          endMs: transport.loopEndMs,
        };
        const prevMetronome = transport.metronomeEnabled;
        transport.setLoop({ enabled: true, startMs: section.startMs, endMs: section.endMs });
        loopRestoreRef.current = () => {
          transport.setLoop(prevLoop);
          if (!prevMetronome) transport.setMetronomeEnabled(false);
        };
        const barLeadMs = Math.round(barMs);
        align.headMs = barLeadMs;
        if (section.startMs >= barLeadMs) {
          transport.seek(section.startMs - barLeadMs);
          transport.setMetronomeEnabled(true);
          align.prerollMs = barLeadMs;
          align.countdownTarget = section.startMs;
          align.restore = () => {
            if (!prevMetronome) transport.setMetronomeEnabled(false);
          };
        } else {
          transport.pause();
          transport.seek(section.startMs);
          setCountInActive(true);
          await auxCountIn(beatsPerBar, current);
          setCountInActive(false);
        }
      } else if (punchWin && flowLine) {
        transport.seek(punchWin.recordFromMs);
        if (punchWin.prerollMs > 0) {
          align.prerollMs = punchWin.prerollMs;
          align.countdownTarget = flowLine.startMs;
        }
      }
      if (clicksDone) await clicksDone;
      if (!current()) {
        void recorder.cancel();
        void writer.discard();
        return;
      }
      writePendingPlacement(projectId, {
        trackId: captureTrackIdRef.current,
        timelineStartMs: startMs,
        sourceOffsetMs: Math.max(0, Math.round(align.headMs + align.compensationMs)),
      });
      // Keep beat playing under the new take when possible (already playing after the count-in).
      transportPlayedRef.current = transportPhaseRef.current === "playing";
      if (transportPhaseRef.current !== "playing") transport.play();
      dispatch({ type: "START_RECORDING" });
      // Counted from the recorder start: the plan limit covers the lead and the pre-roll too.
      startedAtRef.current = Math.round(Date.now() - Math.max(0, performance.now() - align.recT0));
      clearTick();
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: "TICK", elapsedMs: elapsed });
        if (
          elapsed >= maxSecondsRef.current * 1000 ||
          shouldAutoStopPunch(getPlayheadMs(), punchOutRef.current)
        ) {
          void stopAndFinalize();
        }
      }, 200);
      captureArmingRef.current = false;
      setCaptureArming(false);
    } catch (error) {
      if (run !== startRunRef.current) {
        // Called off meanwhile: cancelRecording() already cleaned up the shared state.
        void recorder.cancel();
        void writer?.discard();
        return;
      }
      captureArmingRef.current = false;
      setCaptureArming(false);
      setCountInActive(false);
      auxStopRef.current?.();
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
      recorderRef.current = null;
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
      } else if (
        error instanceof TakeRecorderError &&
        error.code === "CANCELLED"
      ) {
        dispatch({ type: "RETRY_IDLE" });
      } else {
        dispatch({
          type: "RECORDING_FAILED",
          message: failureText(error, tr("nieUdaloSieZaczac")),
        });
      }
    } finally {
      if (run === startRunRef.current) submittingRef.current = false;
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
    let captured: UnsentTake | null = null;
    try {
      const result = await recorder.stop();
      captured = {
        beatId: beatIdRef.current,
        blob: result.blob,
        mimeType: result.mimeType,
        uploadedTakeId: null,
        startMs,
        trackId: captureTrackIdRef.current || trackIdRef.current,
        writer,
      };
      alignRef.current.auto = measureAutoLatency(result.blob, startMs);
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
      await settledAuto();
      acceptUploadedTake(uploaded, startMs);
    } catch (error) {
      // Another tab finalizes the copy after a lost lease; this one must not send it again.
      if (captured && !(error instanceof TakeRecoveryLeaseLostError)) keepUnsent(captured, error);
      else clearCapturePlacement();
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
            : "";
        if (writer && locallySecured && recoveryWriterRef.current !== writer) {
          void writer
            .release()
            .then(() => captureReportRef.current.onLocalRecoveryChanged?.());
        }
        const shown = failureText(error, tr("nieUdaloSieZapisac2"));
        const message = locallySecured
          ? tr("nagranieJestZabezpieczoneLokalnie", { v0: shown })
          : shown;
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

  /** The measurement usually ends before the upload does. It may hold a take back for a moment, never longer. */
  async function settledAuto() {
    const auto = alignRef.current.auto;
    if (auto) await Promise.race([auto, new Promise<void>((r) => setTimeout(r, 5_000))]);
  }

  /** Real round trip of this take from the beat that leaked into the microphone. Silent when there is none. */
  async function measureAutoLatency(take: Blob, startMs: number): Promise<void> {
    const a = alignRef.current;
    const recT0 = a.recT0;
    if (recT0 == null) return;
    const targetMs = a.mode === "loop" && a.section ? a.section.startMs : startMs;
    const recPositionMs =
      a.mode === "loop" && a.section
        ? loopPassStarts({ samples: a.samples, section: a.section, recordStartPerfMs: recT0 })[0] ?? null
        : recordingPositionOf({ samples: a.samples, targetMs, recordStartPerfMs: recT0 });
    const clip = beatClipAt(clips, tracks, targetMs);
    if (recPositionMs == null || !clip) return;
    try {
      const beatUrl = await transport.resolveClipSourceUrl(clip);
      if (!beatUrl) return;
      const { measureTakeLag } = await import("@/lib/studio/recording/auto-align-client");
      const found = await measureTakeLag({
        take,
        recPositionMs,
        beatPositionMs: targetMs - clip.timelineStartMs + clip.sourceOffsetMs,
        maxMs: Math.min(
          clip.timelineStartMs + clip.durationMs - targetMs,
          a.mode === "loop" && a.section ? a.section.endMs - a.section.startMs : Number.POSITIVE_INFINITY,
        ),
        beatUrl,
      });
      if (!found) return;
      const measured = Math.round(found.lagMs);
      const known = latency.profile?.roundTripMs ?? null;
      // A manual shift made up for a wrong value. On top of a right one it is the singer's taste: kept.
      const manual = known == null || Math.abs(known - measured) > 4 ? 0 : latency.profile?.manualOffsetMs ?? 0;
      // A newer take took over meanwhile, or this one is already placed: then only the next takes profit.
      const late = a.recT0 !== recT0 || a.placement != null;
      if (!late) a.compensationMs = measured + manual;
      if (known == null || Math.abs(known - measured) > 4) {
        latency.save({ roundTripMs: measured, method: "click", spreadMs: null, manualOffsetMs: manual });
      }
      if (!late && mountedRef.current) setAutoAlignedMs(a.compensationMs);
    } catch {
      // No measurement: the calibrated or estimated value stays.
    }
  }

  /** The take is READY on the server: show the decision, or put loop passes on the lane. */
  function acceptUploadedTake(uploaded: TakeUploadTransportResult, startMs: number) {
    unsentRef.current = null;
    setUnsent(null);
    setReplaceCandidates(null);
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
          // Unknown playhead sample → the planned lead; still apply device latency
          // (estimate/calibration). Dropping compensation here left vocals late
          // on Windows when sampling missed the start.
          recPositionMs: recPositionMs ?? align.headMs,
          compensationMs: align.compensationMs,
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
  }

  /** The upload failed: the finished audio stays here until it is sent or discarded by the user. */
  function keepUnsent(take: UnsentTake, error: unknown) {
    const next: UnsentTake = {
      ...take,
      uploadedTakeId:
        error instanceof TakeTransportError ? error.uploadedTakeId : null,
    };
    unsentRef.current = next;
    if (!mountedRef.current) return;
    setUnsent(next);
    setReplaceCandidates(
      error instanceof TakeReplaceRequiredError ? error.replaceableTakes : null,
    );
  }

  async function retryUnsent(replaceTakeId?: string) {
    const take = unsentRef.current;
    if (!take || submittingRef.current) return;
    submittingRef.current = true;
    setWorkflowError(null);
    setRecordStartMs(take.startMs);
    recordStartMsRef.current = take.startMs;
    captureTrackIdRef.current = take.trackId;
    dispatch({ type: "UPLOAD_START" });
    try {
      const uploaded =
        take.uploadedTakeId && !replaceTakeId
          ? await finalizeTakeRecordingUpload(take.uploadedTakeId)
          : await uploadTakeRecordingBlob({
              beatId: take.beatId,
              blob: take.blob,
              contentType: take.mimeType,
              replaceTakeId: replaceTakeId ?? null,
            });
      if (take.writer) {
        void take.writer
          .discard()
          .then(() => captureReportRef.current.onLocalRecoveryChanged?.());
      }
      await settledAuto();
      acceptUploadedTake(uploaded, take.startMs);
    } catch (error) {
      // A finalize that failed twice starts over with a fresh upload next time.
      keepUnsent(take, take.uploadedTakeId ? null : error);
      dispatch({
        type: "UPLOAD_FAILED",
        message: failureText(error, tr("nieUdaloSieZapisac2")),
      });
    } finally {
      submittingRef.current = false;
    }
  }

  function discardUnsent() {
    const take = unsentRef.current;
    unsentRef.current = null;
    setUnsent(null);
    setReplaceCandidates(null);
    setConfirmDiscard(false);
    clearPendingPlacement(projectId);
    clearCapturePlacement();
    if (take?.writer) {
      void take.writer
        .discard()
        .then(() => captureReportRef.current.onLocalRecoveryChanged?.());
    }
    dispatch({ type: "RETRY_IDLE" });
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
    startRunRef.current += 1;
    autoStartAfterMicRef.current = false;
    auxStopRef.current?.();
    auxStopRef.current = null;
    submittingRef.current = false;
    captureArmingRef.current = false;
    setCaptureArming(false);
    setCountInActive(false);
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
    durationSeconds?: number | null;
  }): Promise<boolean> {
    const takeId = params.takeId;
    const startMs = recordStartMsRef.current;
    const captureTrackId = captureTrackIdRef.current;
    const placeTrackId =
      captureTrackId && mergedTracks.some((t) => t.id === captureTrackId)
        ? captureTrackId
        : trackIdRef.current;
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
    const aligned =
      alignRef.current.placement?.takeId === takeId ? alignRef.current.placement : null;
    const timelineStartMs = aligned?.timelineStartMs ?? startMs;
    const sourceOffsetMs = aligned?.sourceOffsetMs ?? 0;
    const durationMs = clipDurationCapMs({
      timelineStartMs,
      sourceOffsetMs,
      takeDurationSeconds: params.durationSeconds ?? null,
      timelineLengthMs: transport.timelineLengthMs,
    });
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
                timelineStartMs,
                ...(aligned ? { sourceOffsetMs } : {}),
                ...(durationMs != null ? { durationMs } : {}),
                expectedDocumentVersion: persistVersionTip.expected(),
              }),
            },
          );
          const placed = ((await placeRes.json().catch(() => null)) ?? {}) as {
            removedClipIds?: string[];
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
                onClipCreated(clip, nextVersion, { stayOnRecord: true });
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
      durationSeconds: state.takeDurationSeconds,
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
      const elig = ((await eligRes.json().catch(() => null)) ?? {}) as {
        success?: boolean;
        allowed?: boolean;
        message?: string;
        upgradeHintMessage?: string | null;
        maxRecordingSeconds?: number;
        error?: string;
      };
      if (!eligRes.ok || !elig.success) {
        setWorkflowError(failureText(elig.error, tr("nieUdaloSieSprawdzic")));
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
        // Check length before reserving a take, so a rejected file does not use the daily limit.
        const importSeconds = await probeStudioVocalImportDurationSeconds(file);
        if (isStudioVocalImportTooLong(importSeconds, elig.maxRecordingSeconds)) {
          setWorkflowError(
            importSeconds != null
              ? tr("importZaDlugi", {
                  max: clock(elig.maxRecordingSeconds),
                  len: clock(Math.ceil(importSeconds)),
                })
              : STUDIO_VOCAL_IMPORT_TOO_LONG_MESSAGE,
          );
          return;
        }
      }

      const startMs = Math.round(getPlayheadMs());
      if (startMs > transport.timelineLengthMs - 500) {
        setWorkflowError(tr("glowicaNaKoncuOsi"));
        return;
      }
      alignRef.current.placement = null;
      setRecordStartMs(startMs);
      recordStartMsRef.current = startMs;
      captureTrackIdRef.current = trackIdRef.current;

      dispatch({ type: "UPLOAD_START" });
      const uploaded = await uploadTakeRecordingBlob({
        beatId: resolvedBeatId,
        blob: file,
        contentType: gate.contentType,
        // The file picker opens only after the rights prompt (importPrawa) was accepted.
        // The server requires and stores the statement (version + project) for every import.
        rightsConfirmed: true,
        projectId,
      });
      dispatch({ type: "FINALIZE_START" });
      dispatch({
        type: "TAKE_READY",
        takeId: uploaded.takeId,
        previewUrl: null,
        takeDurationSeconds: uploaded.durationSeconds,
      });

      const importOverlaps =
        findOverlappingTakeClips(clips, {
          trackId: captureTrackIdRef.current,
          startMs,
          durationMs: Math.max(1, Math.round((uploaded.durationSeconds ?? 0) * 1000)),
        }).length > 0;
      const placed = await placeReadyTakeOnTimeline({
        takeId: uploaded.takeId,
        busy: "import",
        successMessage: importOverlaps
          ? tr("wokalZaimportowanyNaInnym")
          : tr("wokalZaimportowanyNaOs"),
        durationSeconds: uploaded.durationSeconds,
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
          : "";
      const message = failureText(error, tr("nieUdaloSieZaimportowac"));
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
    setConfirmDiscard(false);
    setWorkflowBusy("discard");
    setWorkflowError(null);
    transport.stopTakePreview();
    try {
      const res = await fetch("/api/takes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId: state.takeId }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
      } | null;
      if (!res.ok || !json?.success) {
        setWorkflowError(tr("nieUdaloSieUsunac2"));
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
    // Same place again: the transport stopped at the end of the previous take.
    const againFromMs = recordStartMsRef.current;
    // Preserve previous Takes/Clips — only start a new capture lifecycle.
    clearCapturePlacement();
    if (againFromMs != null) transport.seek(againFromMs);
    autoStartAfterMicRef.current = true;
    void prepareMicrophone();
  }

  async function loadLibraryTakes() {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const res = await fetch(
        `/api/studio/projects/${projectId}/record/takes`,
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        takes?: StudioPlaceableTakeDto[];
      } | null;
      if (!res.ok || !json?.success || !json.takes) {
        throw new Error("takes");
      }
      setLibraryTakes(json.takes);
    } catch {
      setLibraryError(tr("nieUdaloSieWczytac"));
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
    const remembered = readTakePlacement(projectId, take.id);
    const rememberedTrack = remembered && trackChoices.some((t) => t.id === remembered.trackId) ? remembered : null;
    const placeTrackId = rememberedTrack?.trackId ?? trackIdRef.current;
    if (!placeTrackId) {
      setLibraryError(tr("wybierzSciezkeDoNagrania"));
      return;
    }
    setLibraryBusyId(take.id);
    setLibraryError(null);
    transport.stopTakePreview();
    try {
      // Back where it was recorded (with the latency correction); unknown takes go to the playhead.
      const timelineStartMs = rememberedTrack?.timelineStartMs ?? Math.round(getPlayheadMs());
      const sourceOffsetMs = rememberedTrack?.sourceOffsetMs ?? 0;
      const durationMs = clipDurationCapMs({
        timelineStartMs,
        sourceOffsetMs,
        takeDurationSeconds: take.durationSeconds,
        timelineLengthMs: transport.timelineLengthMs,
      });
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
                ...(sourceOffsetMs > 0 ? { sourceOffsetMs } : {}),
                ...(durationMs != null ? { durationMs } : {}),
                expectedDocumentVersion: persistVersionTip.expected(),
                replaceOverlapping,
              }),
            },
          );
          const placed = ((await placeRes.json().catch(() => null)) ?? {}) as {
            removedClipIds?: string[];
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
                onClipCreated(clip, nextVersion, {
                  stayOnRecord: true,
                  removedClipIds: placed.removedClipIds,
                });
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
      clearUnplacedTakeMemo(projectId, take.id);
    } catch {
      setLibraryError(tr("nieUdaloSieUmiescic"));
    } finally {
      setLibraryBusyId(null);
    }
  }

  const secondsLeft =
    state.phase === "RECORDING"
      ? recordingSecondsLeft({ elapsedMs: state.elapsedMs, maxSeconds })
      : null;
  const primaryLabel =
    state.phase === "REQUESTING_MIC"
      ? tr("prosbaODostepDo")
      : captureArming
        ? tr("countIn2")
        : state.phase === "RECORDING"
          ? tr("zatrzymajNagrywanie")
          : state.phase === "STOPPING" ||
              state.phase === "UPLOADING" ||
              state.phase === "PROCESSING"
            ? tr("zapisywanieNagrania")
            : tr("nagraj");

  const primaryDisabled =
    state.phase === "REQUESTING_MIC" ||
    state.phase === "STOPPING" ||
    state.phase === "UPLOADING" ||
    state.phase === "PROCESSING" ||
    state.phase === "READY_TAKE" ||
    captureArming ||
    !trackId;

  /** Where "Dodaj na ścieżkę" will put a listed take. */
  function placementLabel(takeId: string) {
    const remembered = libraryShown ? readTakePlacement(projectId, takeId) : null;
    return remembered && trackChoices.some((t) => t.id === remembered.trackId)
      ? tr("miejsceNagrania", { time: formatStudioTimeMs(remembered.timelineStartMs) })
      : (
        <>
          {tr("playhead")} <PlayheadTime />
        </>
      );
  }

  const workflowDisabled = Boolean(workflowBusy);
  const visiblePane = showWorkflow ? "take" : recordPane;
  // Simple view: the user picks the best take from a short numbered list of this Bit's takes.
  const simpleTakes = simple
    ? libraryTakes
        .filter((t) => t.sameBeat)
        .map((t, i, all) => ({ ...t, n: all.length - i }))
        .slice(0, 6)
    : null;
  const simpleTakeSig = state.phase === "IDLE" || state.phase === "READY_TAKE" ? `${state.phase}:${state.takeId ?? ""}` : null;
  useEffect(() => {
    if (samplesMode || simpleTakeSig === null) return;
    if (!simple && !libraryOpen && recordPane !== "lanes") return;
    const timer = setTimeout(() => void loadLibraryTakes(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simple, samplesMode, simpleTakeSig, projectId, recordPane]);
  const setupOpen = !simple && !samplesMode && visiblePane === "setup";
  const gearOutputOpen = setupOpen || (simple && !samplesMode);
  const lanesOpen = !simple && !samplesMode && visiblePane === "lanes";
  const scratchOpen = !simple && !samplesMode && visiblePane === "scratch";
  const takeOpen = !samplesMode && (simple || visiblePane === "take");
  const libraryShown = libraryOpen || lanesOpen;
  // A calibration nobody can see would keep the microphone on.
  const calibrationVisible = setupOpen || (simple && !samplesMode && visible);
  useEffect(() => {
    if (!calibrationVisible) calibAbortRef.current?.abort();
  }, [calibrationVisible]);

  /**
   * Samples are not vocals: when the chosen track is a vocal role, put the sample on its own
   * "instrument" track, so the mix does not treat it like a vocal and loops do not overlap.
   */
  const resolveSampleTrackId = useCallback(
    async (): Promise<{ ok: true; trackId: string } | { ok: false; message: string }> => {
      if (!trackId) return { ok: false, message: tr("sampleBrakSciezki") };
      const current = mergedTracks.find((t) => t.id === trackId);
      const vocalRoles = ["lead_vocal", "adlib", "double", "backing"];
      if (!current || !vocalRoles.includes(current.trackRole)) return { ok: true, trackId };
      // Add a SAMPLE track, then give it the "instrument" role (any plan may add samples, so no stem route).
      let createdId: string | null = null;
      const result = await enqueuePersistAsync(async () => {
        try {
          const post = await fetch(`/api/studio/projects/${projectId}/tracks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedDocumentVersion: persistVersionTip.expected(), trackType: "SAMPLE" }),
          });
          const added = (await post.json().catch(() => null)) as {
            track?: StudioTrackDto;
            documentVersion?: number;
            message?: string;
            error?: string;
          } | null;
          if (!post.ok || !added?.track) {
            return classifyPersistHttpFailure({ status: post.status, message: added?.message || added?.error || tr("nieUdaloSieDodacSciezki") });
          }
          let track = added.track;
          let version = ackDocumentVersion(added.documentVersion);
          const patch = await fetch(`/api/studio/projects/${projectId}/tracks/${track.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedDocumentVersion: version, trackRole: "instrument" }),
          });
          const patched = (await patch.json().catch(() => null)) as { track?: StudioTrackDto; documentVersion?: number } | null;
          if (patch.ok && patched?.track) {
            track = patched.track;
            version = ackDocumentVersion(patched.documentVersion);
          }
          const finalTrack = track;
          return {
            ok: true as const,
            documentVersion: version,
            apply: () => {
              createdId = finalTrack.id;
              setLocalTracks((current) => [...current, finalTrack]);
              onTrackCreated?.(finalTrack, version);
            },
          };
        } catch {
          return classifyPersistNetworkFailure(tr("nieUdaloSieDodacSciezki"));
        }
      });
      return result.ok && createdId
        ? { ok: true, trackId: createdId }
        : { ok: false, message: result.ok ? tr("nieUdaloSieDodacSciezki") : result.message };
    },
    [trackId, mergedTracks, enqueuePersistAsync, persistVersionTip, ackDocumentVersion, projectId, onTrackCreated, tr],
  );

  // Bitek places a sample: the server plans tempo, key, bar and repeats; apply goes through the persist queue.
  const bitekSamplePreview = useCallback<BitekPreview>(
    async (sampleId, scope) => {
      if (!trackId) return { ok: false, message: tr("sampleBrakSciezki") };
      try {
        const res = await fetch(`/api/studio/projects/${projectId}/samples/bitek`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sampleId, trackId, scope, playheadMs: Math.floor(getPlayheadMs()) }),
        });
        const body = (await res.json().catch(() => null)) as { plan?: SamplePlacementPlan; error?: string } | null;
        if (!res.ok || !body?.plan) return { ok: false, message: body?.error ?? tr("bitekBlad") };
        return { ok: true, plan: body.plan };
      } catch {
        return { ok: false, message: tr("bitekBlad") };
      }
    },
    [projectId, trackId, getPlayheadMs, tr],
  );
  const bitekSampleApply = useCallback<BitekApply>(
    async (sampleId, scope) => {
      const target = await resolveSampleTrackId();
      if (!target.ok) return { ok: false, message: target.message };
      const placeTrackId = target.trackId;
      setCatalogMessage(null);
      setWorkflowError(null);
      const result = await enqueuePersistAsync(async () => {
        try {
        const res = await fetch(`/api/studio/projects/${projectId}/samples/bitek`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sampleId,
            trackId: placeTrackId,
            scope,
            playheadMs: Math.floor(getPlayheadMs()),
            apply: true,
            expectedDocumentVersion: persistVersionTip.expected(),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          clips?: StudioClipDto[];
          documentVersion?: number;
          error?: string;
          /** 207: only some of the clips were saved. */
          partial?: boolean;
        } | null;
        if (!res.ok || !body?.clips || typeof body.documentVersion !== "number") {
          return classifyPersistHttpFailure({ status: res.status, message: body?.error ?? tr("bitekBlad") });
        }
        const documentVersion = persistVersionTip.applyAck(body.documentVersion);
        const clips = body.clips;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            for (const clip of clips) onClipCreated(clip, documentVersion, { keepRecordPanel: true });
            if (clips.length) onLastScratchClipIdChange(clips[clips.length - 1].id);
            if (body.partial) setWorkflowError(body.error ?? tr("bitekBlad"));
            else setCatalogMessage(tr("bitekWstawil"));
          },
        };
        } catch {
          return classifyPersistNetworkFailure(tr("bitekBlad"));
        }
      });
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, trackId, getPlayheadMs, tr, resolveSampleTrackId],
  );

  return (
    <section
      className={
        embedded
          ? "space-y-2 border-0 bg-transparent p-0"
          : simple && !samplesMode
            ? "flex flex-col gap-3 [&>.studio-gear-fold]:order-last"
            : `space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3 ${samplesMode ? "lg:border-0 lg:bg-transparent lg:p-0" : ""}`
      }
      aria-label={tr("nagrywanieWStudio")}
      data-record-density={simple ? "simple" : "full"}
    >
      {/* rec-live-ui — mobile only (< lg): always-visible Stop while capturing, same path as
          the 2nd REC press (stop + upload). Portal: escapes the scrolling inspector sheet. */}
      {state.phase === "RECORDING" && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              data-testid="studio-rec-floating-stop"
              className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-[55] flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full border-2 border-white/80 bg-[var(--brd-rec)] px-5 text-sm font-semibold whitespace-nowrap text-white shadow-2xl lg:hidden"
              onClick={() => void stopAndFinalize()}
            >
              {tr("zatrzymajNagrywanie")}
              <span className="font-mono text-xs opacity-90">
                {tl(formatStudioTimeMs(Math.round(state.elapsedMs)))}
              </span>
            </button>,
            document.body,
          )
        : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* In the bottom sheet its title already says "Nagrywanie". */}
        <h2 className={`text-sm font-medium text-[var(--brd-ink)] ${embedded && !samplesMode ? "max-xl:sr-only" : ""}`}>
          {samplesMode ? tr("sampleNaglowek") : tr("nagrywanie")}
        </h2>
        {state.phase === "RECORDING" ? (
          <div className="space-y-0.5 text-right">
            <p className="text-xs font-medium text-destructive" role="status">
              {tr("trybNagrywania")}{" "}{tl(formatStudioTimeMs(Math.round(state.elapsedMs)))}
            </p>
            {secondsLeft != null ? (
              <p className="text-sm font-semibold text-destructive" role="status" data-testid="studio-record-left">
                {tr("zostalo", { time: clock(secondsLeft) })}
              </p>
            ) : null}
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
            {tr("startPlayhead")}{" "}<PlayheadTime />
          </p>
        )}
      </div>

      {samplesMode ? (
        <>
        <p className="text-xs text-[var(--brd-mute)]" data-testid="studio-samples-lead">
          {tr("sampleZakladkaOpis")}
        </p>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label={tr("sampleNaglowek")}>
          {(["samples", "keys"] as const).map((pane) => (
            <Button
              key={pane}
              type="button"
              size="sm"
              className="min-h-11 w-full"
              variant={samplesPane === pane ? "default" : "secondary"}
              aria-pressed={samplesPane === pane}
              data-testid={`studio-samples-pane-${pane}`}
              onClick={() => setSamplesPane(pane)}
            >
              {tr(pane === "samples" ? "sampleZakladkaSample" : "klawisze")}
            </Button>
          ))}
        </div>
        </>
      ) : null}
      {!simple && !samplesMode ? (
        <div className="grid grid-cols-4 gap-1" role="tablist" aria-label={tr("nagrywanie")} data-testid="studio-record-panes">
          {(
            [
              ["take", "recPaneNagraj"],
              ["setup", "recPaneUstawienia"],
              ["lanes", "recPaneUjecia"],
              ["scratch", "recPaneScratch"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={visiblePane === id}
              data-testid={`studio-record-pane-${id}`}
              className={`min-h-11 rounded border px-1 text-[10px] font-medium uppercase tracking-[0.08em] ${
                visiblePane === id
                  ? "border-[var(--brd-green)] bg-[color-mix(in_srgb,var(--brd-bg)_80%,var(--brd-green)_20%)] text-[var(--brd-ink)]"
                  : "border-[var(--brd-line)] bg-[var(--brd-paper)] text-[var(--brd-mute)]"
              }`}
              onClick={() => setRecordPane(id)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
      ) : null}
      {takeOpen && !simple ? (
        <p className="text-xs leading-snug text-[var(--brd-mute)]" data-testid="studio-record-start">
          {tr("zacznijTutaj")}{" "}
          <Link href="/jak-nagrac" className="underline" data-testid="studio-record-how-it-works">
            {tr("jakToDziala")}
          </Link>
        </p>
      ) : null}

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

      {setupOpen ? (
      <StudioLatencyCard
        latency={latency}
        calibration={calibration}
        disabled={captureActive || state.phase === "READY_TAKE"}
        onCalibrate={(mode) => void runCalibration(mode)}
        onCancel={() => calibAbortRef.current?.abort()}
        openSignal={latencyOpenSignal}
        onOpenSignalHandled={() => setLatencyOpenSignal(0)}
      />
      ) : null}

      {needsManualCalibration && !samplesMode && !captureActive && !captureArming && state.phase !== "READY_TAKE" ? (
        <div
          className="space-y-2 rounded border border-[var(--brd-amber)] p-2"
          role="note"
          data-testid="studio-manual-calibration-note"
        >
          <p className="text-sm text-[var(--brd-ink)]">{tr("kalibrujRecznieTytul")}</p>
          <p className="text-xs text-[var(--brd-mute)]">{tr("kalibrujRecznieOpis")}</p>
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            disabled={calibration.status === "running"}
            onClick={openLatencyCard}
            data-testid="studio-manual-calibration-open"
          >
            {tRec("kalibruj")}
          </Button>
        </div>
      ) : null}

      {simple && !samplesMode && latencyShown ? (
        <StudioLatencyCard
          latency={latency}
          calibration={calibration}
          disabled={captureActive || captureArming || state.phase === "READY_TAKE"}
          onCalibrate={(mode) => void runCalibration(mode)}
          onCancel={() => calibAbortRef.current?.abort()}
          openSignal={latencyOpenSignal}
          onOpenSignalHandled={() => setLatencyOpenSignal(0)}
        />
      ) : null}

      {setupOpen ? (
      <div data-record-focus="recMode">
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
      </div>
      ) : null}

      {setupOpen && stemLimit > 0 ? (
        <div data-record-focus="stems">
        <StudioStemImport
          projectId={projectId}
          freeSlots={Math.max(0, trackLimit - recordableTracks.length)}
          stemLimit={stemLimit}
          createStemTrack={createStemTrack}
          placeStemTake={placeStemTake}
          dropped={droppedStems}
          onDroppedDone={onDroppedStemsDone}
          disabled={isRecordingBusy(state.phase)}
          onBusyChange={setStemsBusy}
        />
        </div>
      ) : null}

      <StudioCountdown beatsLeft={countdown} label={tRec("wejscieZa")} />
      {countInActive && countdown == null ? (
        <p className="text-xs font-medium text-destructive" role="status">
          {tr("countIn2")}
        </p>
      ) : null}
      {state.phase === "RECORDING" && liveCue ? (
        <p role="status" data-testid="studio-live-coach" data-cue={liveCue} className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">
          <span className="font-semibold">BITEK: </span>
          {tBitek(liveCue === "hot" ? "msg.liveHot" : liveCue === "quiet" ? "msg.liveQuiet" : liveCue === "uneven" ? "msg.liveUneven" : "msg.liveOffbeat")}
        </p>
      ) : null}

      {setupOpen ? (
      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" data-record-focus="countdown">
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
                {tl(bars === 0 ? tr("wylaczone") : tr("takt", { n: bars }))}
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
                step={0.1}
                value={punchInMs / 1000}
                onChange={(e) => setPunchInMs(Math.round((Number(e.target.value) || 0) * 1000))}
                aria-label={tr("punchInMs")}
              />
            </label>
            <label className="block text-xs text-[var(--brd-mute)]">
              {tr("outMs")}
              <input
                className="mt-1 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 py-1.5 text-sm text-[var(--brd-ink)]"
                type="number"
                min={0.1}
                step={0.1}
                value={punchOutMs / 1000}
                onChange={(e) => setPunchOutMs(Math.round((Number(e.target.value) || 0) * 1000))}
                aria-label={tr("punchOutMs")}
              />
            </label>
            <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setPunchInMs(Math.round(getPlayheadMs()))}>
              {tr("zGlowicy")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setPunchOutMs(Math.round(getPlayheadMs()))}>
              {tr("zGlowicy")}
            </Button>
          </div>
        ) : null}
      </div>
      ) : null}

      {!samplesMode && showWorkflow ? (
        <div
          ref={takeWorkflowRef}
          className="space-y-2 rounded border border-[var(--brd-line)] p-2"
          aria-label={tr("studioTakeWorkflow")}
        >
          {autoAlignedMs != null ? (
            <p className="text-xs text-[var(--brd-mute)]" data-testid="studio-auto-aligned">
              {tr("wyrownaneAutomatycznie", { ms: autoAlignedMs })}
            </p>
          ) : null}
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
              aria-expanded={confirmDiscard}
              onClick={() => setConfirmDiscard(true)}
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
          {confirmDiscard ? (
            <div className="space-y-2 rounded border border-destructive/60 p-2" role="alert">
              <p className="text-sm whitespace-pre-line text-[var(--brd-ink)]">
                {tr("odrzucicNagranieNagranieZostanie")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="min-h-11"
                  disabled={workflowDisabled}
                  onClick={() => void onDiscardWorkflowTake()}
                >
                  {tr("odrzucTak")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setConfirmDiscard(false)}>
                  {tr("anuluj")}
                </Button>
              </div>
            </div>
          ) : null}
          <p className="text-[11px] text-[var(--brd-mute)]">
            {tr("zachowajUmieszczaNagranieNa")}
          </p>
        </div>
      ) : null}

      {lanesOpen ? (
      <>
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
        onDelete={(lane) =>
          void laneStore.remove(lane.id).then((ok) => {
            if (!ok) setLaneMessage(tRec("zapomnijBlad"));
          })
        }
      />
      {laneMessage ? (
        <p className="text-xs text-[var(--brd-mute)]" role="status" data-testid="studio-lane-message">
          {laneMessage}
        </p>
      ) : null}
      </>
      ) : null}

      {samplesMode ? (
      <>
      {/* Both stay mounted: switching never loses a form, a preview or an armed key take. */}
      <div hidden={samplesPane !== "keys"}>
      <StudioPlayKeys
        disabled={!trackId || Boolean(workflowBusy)}
        midi={tracks.find((track) => track.id === trackId)?.midi ?? null}
        bpm={transport.tempoBpm}
        getPlayheadMs={transport.getPlayheadMs}
        onCommit={(next) => {
          if (trackId) onSaveTrackMidi?.(trackId, next);
        }}
      />
      </div>
      <div hidden={samplesPane !== "samples"}>
      <StudioSampleDesk
        trackId={trackId}
        disabled={Boolean(workflowBusy)}
        bitekPreview={bitekSamplePreview}
        bitekApply={bitekSampleApply}
        onPlace={async (sampleId) => {
          const target = await resolveSampleTrackId();
          if (!target.ok) {
            return { ok: false as const, message: target.message };
          }
          setCatalogMessage(null);
          setWorkflowError(null);
          const result = await enqueuePersistAsync(async () => {
            try {
            const placed = await placeOwnedStudioSample({
              projectId,
              sampleId,
              trackId: target.trackId,
              timelineStartMs: Math.floor(getPlayheadMs()),
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
            } catch {
              return classifyPersistNetworkFailure(tr("sampleBlad"));
            }
          });
          if (!result.ok) {
            return { ok: false as const, message: result.message };
          }
          return { ok: true as const };
        }}
      />
      </div>
      </>
      ) : null}
      {samplesMode || scratchOpen ? (
      <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" data-record-focus="scratch">
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
          {samplesMode ? null : (
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
          )}
        </div>
        {samplesMode ? null : (
        <>
        <p className="text-xs text-[var(--brd-mute)]" role="status">
          {scratchClip
            ? tr("scratchKlip", { time: formatStudioTimeMs(scratchClip.timelineStartMs) })
            : tr("scratchWybierzKlip")}
        </p>
        <StudioScratchPanel
          key={lastScratchClipId ?? "none"}
          disabled={!lastScratchClipId}
          sourceDurationMs={Math.max(1, scratchClip ? scratchClip.sourceOffsetMs + scratchClip.durationMs : 1)}
          getPlayheadInSourceMs={() =>
            scratchClip
              ? Math.max(0, Math.floor(getPlayheadMs() - scratchClip.timelineStartMs + scratchClip.sourceOffsetMs))
              : 0
          }
          onLiveRate={(rate, reverse) => {
            if (!lastScratchClipId) return;
            transport.applyScratchLive(rate, lastScratchClipId, reverse);
          }}
          onCueJump={(cueMs) => {
            if (scratchClip) {
              transport.seek(Math.max(0, scratchClip.timelineStartMs + cueMs - scratchClip.sourceOffsetMs));
            }
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
                    onClipUpdated?.(body.clip!, getBaseVersionRef.current());
                    setCatalogMessage(tr("zapisanoZatwierdzonyStanScratch"));
                  },
                };
              });
              if (!result.ok) setWorkflowError(result.message);
            })();
          }}
        />
        </>
        )}
      </div>

      ) : null}

      {takeOpen ? (
      <div className="studio-gear" data-record-focus="mic">
        <p className="studio-gear-label text-xs font-medium text-[var(--brd-ink)]">{tr("mikrofon")}</p>
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
            {inputDevices.inputs.filter((d) => d.deviceId).map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {tl(d.label)}
              </option>
            ))}
          </select>
        </label>
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

        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--brd-ink)]">
          <input
            type="checkbox"
            checked={headphonesOn}
            disabled={captureActive || captureArming}
            onChange={(e) => {
              setHeadphonesPick({ key: latency.deviceKey, value: e.target.checked });
              writeHeadphones(safeLocalStorage(), latency.deviceKey, e.target.checked);
            }}
            data-testid="studio-headphones"
          />
          <span>
            {tr("nagrywamWSluchawkach")}
            <span className="block text-[11px] text-[var(--brd-mute)]">{tr("nagrywamWSluchawkachOpis")}</span>
          </span>
        </label>
        <div className="w-full space-y-1 pt-1">
          <p className="studio-gear-label text-xs text-[var(--brd-mute)]">{tr("testMikrofonu")}</p>
          {testerError && !state.error ? (
            <p className="text-xs text-destructive" role="alert">
              {tl(testerError)}
            </p>
          ) : meterStream ? (
            <>
              <p className="text-xs text-[var(--brd-ink)]" role="status">
                {tl(micStatus === "checking"
                  ? tr("powiedzCos")
                  : micStatus === "silent"
                    ? tr("brakSygnaluSprawdzMikrofon")
                    : micStatus === "quiet"
                      ? tr("sygnalJestBardzoSlaby")
                      : micStatus === "clip" || micStatus === "hot"
                        ? tr("uwagaSygnalBliskoPrzesterowania")
                        : tr("mikrofonDziala"))}
              </p>
              <BrdInputMonitor level={micStatus === "checking" ? "quiet" : micStatus} peak={mic.peak} />
              <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--brd-ink)]">
                <input
                  type="checkbox"
                  checked={monitorOn}
                  onChange={(e) => setMonitorOn(e.target.checked)}
                />
                {tr("monitorDoUchaSuchy")}
              </label>
              {monitorOn ? (
                <>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--brd-ink)]">
                    <input
                      type="checkbox"
                      checked={monitorReverbOn}
                      onChange={(e) => setMonitorReverbOn(e.target.checked)}
                      data-testid="studio-monitor-reverb"
                    />
                    {tr("monitorPoglosPewnosci")}
                  </label>
                  <p className="text-[11px] text-[var(--brd-mute)]" role="status">
                    {monitorReverbOn
                      ? tr("monitorPoglosTylkoWSluchawkach")
                      : tr("uslyszyszEchoILatencje")}
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-[var(--brd-mute)]" role="status">
              {testerOn || state.phase === "REQUESTING_MIC" ? tr("oczekiwanieNaUprawnienia") : tr("testMikrofonuOpis")}
            </p>
          )}
          {!captureActive && !captureArming && state.phase !== "READY_TAKE" && state.phase !== "REQUESTING_MIC" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              data-testid="studio-mic-test"
              aria-pressed={testerOn}
              onClick={() => {
                setTesterError(null);
                setTesterOn((on) => !on);
              }}
            >
              {testerOn ? tr("zatrzymajTest") : tr("sprawdzMikrofon")}
            </Button>
          ) : null}
        </div>
      </div>
      ) : null}

      {gearOutputOpen ? (
      <details open={simple ? undefined : true} className="studio-gear-fold" data-testid="studio-record-sound-settings">
      <summary className={simple ? "flex min-h-11 cursor-pointer items-center text-sm text-[var(--brd-mute)]" : "hidden"}>{tr("ustawieniaDzwieku")}</summary>
      <div className="studio-gear">
        <p className="studio-gear-label text-xs font-medium text-[var(--brd-ink)]">{tr("odsluch")}</p>
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
              {outputDevices.outputs.filter((d) => d.deviceId).map((d) => (
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
        {outputError ? (
          <p className="text-xs text-destructive" role="alert">
            {tr("wyjscieNieDziala")}
          </p>
        ) : null}
        {outputDevices.softNotice ? (
          <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
            {tl(outputDevices.softNotice)}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            void inputDevices.refreshInputs();
            void outputDevices.refreshOutputs();
          }}
        >
          {tr("odswiezUrzadzenia")}
        </Button>
      </div>
      {simple ? (
        <p className="pt-2 text-[11px] text-[var(--brd-mute)]">
          {tr("limitNagrania", { time: clock(maxSeconds) })}
        </p>
      ) : null}
      </details>
      ) : null}

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

      {unsent && !samplesMode && !captureActive && state.phase !== "READY_TAKE" ? (
        <div ref={unsentBoxRef} className="space-y-2 rounded border border-[var(--brd-amber)] p-2" data-testid="studio-unsent-take">
          <p className="text-sm text-[var(--brd-ink)]">{tr("niewyslaneOpis")}</p>
          {replaceCandidates ? (
            replaceCandidates.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label={tr("zastapLista")}>
                <li className="text-xs text-[var(--brd-mute)]">{tr("zastapOpis")}</li>
                {replaceCandidates.map((take) => (
                  <li key={take.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {tl(take.beatTitle ?? "—")}
                      {take.durationSeconds != null ? ` · ${clock(take.durationSeconds)}` : ""}
                      {` · ${new Date(take.createdAt).toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" })}`}
                    </span>
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void retryUnsent(take.id)}>
                      {tr("zastapTo")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--brd-mute)]">{tr("zastapBrak")}</p>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="min-h-11" data-testid="studio-unsent-retry" onClick={() => void retryUnsent()}>
              {tr("wyslijPonownie")}
            </Button>
            {confirmDiscard ? (
              <>
                <Button type="button" size="sm" variant="destructive" className="min-h-11" onClick={discardUnsent}>
                  {tr("odrzucTak")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setConfirmDiscard(false)}>
                  {tr("anuluj")}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setConfirmDiscard(true)}>
                {tr("odrzuc")}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {takeOpen ? (
        <details
          className="rounded border border-[var(--brd-line)] px-2"
          open={lyricsOpen}
          onToggle={(e) => setLyricsOpen(e.currentTarget.open)}
          data-testid="studio-record-lyrics"
          data-record-focus="lyrics"
        >
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-[var(--brd-mute)]">{tr("tekstUtworu")}</summary>
          {lyricsOpen ? (
            <div className="pb-2">
              <StudioLyricsCard
                projectId={projectId}
                getPlayheadMs={getPlayheadMs}
                mode={section ? recMode : "single"}
                loopStartMs={section?.startMs ?? null}
                punchLine={recMode === "punch" && lines.length ? Math.min(punchLine, lines.length - 1) : null}
              />
            </div>
          ) : null}
        </details>
      ) : null}

      {!samplesMode && !showWorkflow ? (
        <div className={`flex w-full flex-col gap-2 bg-[var(--brd-paper)] py-1 ${simple ? "xl:sticky xl:bottom-0 xl:z-10" : "sticky bottom-0 z-10"}`} data-testid="studio-record-bar" data-record-focus="importVocal">
          {takeOpen ? <StudioQuotaLine /> : null}
          <div className={`flex w-full flex-col gap-2 ${simple ? "" : "sm:flex-row sm:flex-wrap"}`}>
          <Button
            type="button"
            size="sm"
            className={simple ? "studio-rec-button min-h-14 w-full text-base font-semibold" : "studio-rec-button w-full sm:w-auto"}
            variant={state.phase === "RECORDING" ? "destructive" : "default"}
            disabled={primaryDisabled}
            data-testid="studio-record-primary"
            onClick={pressRecord}
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
          {takeOpen ? (
          <Button
            data-testid="studio-record-import"
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            variant="outline"
            disabled={
              primaryDisabled ||
              unsent !== null ||
              workflowBusy === "import" ||
              !canStartNewRecording(state.phase) ||
              state.phase === "READY" ||
              state.phase === "REQUESTING_MIC"
            }
            onClick={() => {
              // Rights statement before an outside file (owner decision 2026-11-26). Once per open panel.
              if (!importRightsRef.current) {
                if (!window.confirm(tr("importPrawa"))) return;
                importRightsRef.current = true;
              }
              importFileInputRef.current?.click();
            }}
            aria-label={tr("importujGotowyPlikWokalu")}
          >
            {tl(workflowBusy === "import"
              ? tr("importowanie")
              : tr("importujWokal"))}
          </Button>
          ) : null}
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
        </div>
      ) : null}

      {takeOpen || lanesOpen ? (
      <div className="space-y-2 border-t border-[var(--brd-line)] pt-2">
        {lanesOpen ? (
        <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("mojeNagraniaTytul")}</p>
        ) : (
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
          {tl(
            simple
              ? `${libraryOpen ? "▾" : "▸"} ${tr("ujeciaTytul")}`
              : libraryOpen
                ? tr("mojeTakeI")
                : tr("mojeTakeI2"),
          )}
        </Button>
        )}
        {libraryShown ? (
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
                {simple ? tr("brakUjecDoWyboru") : tr("brakGotowychNagranDo")}
              </p>
            ) : null}
            {!libraryLoading && !libraryError && simpleTakes && simpleTakes.length === 0 && libraryTakes.length > 0 ? (
              <p className="text-xs text-[var(--brd-mute)]">{tr("brakUjecDoWyboru")}</p>
            ) : null}
            {simple && libraryOpen ? (
              <p className="text-[11px] text-[var(--brd-mute)]" data-testid="studio-record-simple-takes-hint">
                {tr("ujeciaWskazowka")}
              </p>
            ) : null}
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {(simpleTakes ?? libraryTakes).map((take) => (
                <li
                  key={take.id}
                  className="rounded border border-[var(--brd-line)] p-2"
                >
                  <p className="text-sm text-[var(--brd-ink)]">
                    {tl(simple && "n" in take ? tr("ujecieNr", { n: (take as { n: number }).n }) : take.displayTitle)}
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
                    {` · ${new Date(take.createdAt).toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" })}`}
                    {" · "}
                    {placementLabel(take.id)}
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
                      {transport.takePreviewActive && libraryPreviewId === take.id
                        ? tr("zatrzymaj")
                        : simple
                          ? tr("posluchajUjecia")
                          : tr("odtworz")}
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
                      {simple ? tr("uzyjUjecia") : tr("umiescWStudio")}
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
                      {simple ? tr("zamienUjecie") : tr("zastap")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      ) : null}

      {samplesMode || simple ? null : (
      <p className="text-[11px] text-[var(--brd-mute)]">
        {tr("limitNagrania", { time: clock(maxSeconds) })}
      </p>
      )}
      {samplesMode || !planLimits ? null : (
      <p className="text-[11px] text-[var(--brd-mute)]" data-testid="studio-record-plan-limits">
        {tr("limityPlanu", {
          sessions: planLimits.sessionsPerDay,
          hours: planLimits.takeHours,
        })}
      </p>
      )}
    </section>
  );
}
