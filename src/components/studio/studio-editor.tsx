"use client";

import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import { applyMixOpsToDocument, inverseMixAutofixOps } from "@/lib/studio/mix-autofix/plan";
import { useLibText } from "@/i18n/use-lib-text";


import { useLocale, useTranslations } from "next-intl";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/button";
import {
  StudioFxChainEditor,
  StudioFxSheet,
} from "@/components/studio/studio-fx-chain-editor";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioBeatPicker } from "@/components/studio/studio-beat-picker";
import {
  deriveStudioInspectorContext,
  studioPreferRecordAfterCaptureReport,
  studioPreferRecordAfterClipCreated,
  studioPreferRecordAfterTimelineSelect,
  studioInspectorOverlayCloseBlocked,
} from "@/components/studio/studio-inspector-context";
import { StudioInspectorOverlay } from "@/components/studio/studio-inspector-shell";
import { StudioLeaveGuardDialog, useStudioLeaveGuard } from "@/components/studio/studio-leave-guard-dialog";
import { studioPageUnloadPrompt } from "@/components/studio/studio-leave-guard";
import {
  StudioMixerDockChrome,
  StudioMixerOverlay,
} from "@/components/studio/studio-mixer-shell";
import { StudioAutomationLane } from "@/components/studio/studio-automation-lane";
import { StudioRecordingPanel } from "@/components/studio/studio-recording-panel";
import { PLAN_POLICY, clipPitchForTier, maxFxEffectsForTier, maxStemsForTier, sidechainForTier } from "@/config/plan-policy";
import type { AutomationParam, StudioAutomationV1 } from "@/lib/studio/studio-automation";
import { bassLineAt, drumPatternAt, emptyMidi, hasMidi, midiPhraseAt, reviewPlayedNotes, type StudioMidiV1 } from "@/lib/studio/studio-midi";
import { fadeEdgePreset } from "@/lib/studio/studio-clip-fade";
import { TakeRecordingRecoveryBanner } from "@/components/takes/take-recording-recovery-banner";
import { StudioEditToolbar } from "@/components/studio/studio-edit-toolbar";
import { StudioClipSpectrogram } from "@/components/studio/studio-clip-spectrogram";
import { StudioTransportBar } from "@/components/studio/studio-transport-bar";
import { StudioStepNav } from "@/components/studio/studio-step-nav";
import { StudioTrackHeader } from "@/components/studio/studio-track-header";
import {
  TrackInspectorPanel,
  StudioMasterMeterLive,
  StudioTrackMeterLive,
  ClipEditPanelPlayheadBound,
} from "@/components/studio/studio-inspector-panels";
import { StudioTimelinePlayheadBound } from "@/components/studio/studio-timeline";
import {
  STUDIO_DAW_CHIP_CLASS,
  STUDIO_DAW_LANE_HEIGHT_PX,
  STUDIO_TRACK_GAIN_DB_MAX,
  STUDIO_TRACK_GAIN_DB_MIN,
  type StudioTimelineMode,
} from "@/components/studio/studio-daw-layout";
import { playheadInsideClip } from "@/lib/studio/studio-clip-ops";
import type { StudioClipEditCommit } from "@/lib/studio/studio-clip-edit-preview";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import {
  StudioTransportProvider,
  useStudioTransportControls,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import {
  FX_CHAIN_CONFLICT_UI_PL,
  studioFxEntryLabel,
  type StudioFxChainV1,
} from "@/lib/studio/studio-fx-chain";
import {
  beatRefMatchesProjectSsot,
  resolvePrimaryBeatRef,
} from "@/lib/studio/studio-beat-audio";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  buildStudioClipFadesPatchBody,
  interpretStudioClipFadesPersistResponse,
} from "@/lib/studio/studio-clip-fade";
import {
  buildStudioClipGainPatchBody,
  buildStudioClipMutePatchBody,
  interpretStudioClipMixPersistResponse,
} from "@/lib/studio/studio-clip-mix";
import type {
  StudioClipDto,
  StudioProjectDocument,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import { beatDurationMs } from "@/lib/studio/studio-daw-clock";
import { studioAdvancedRecordAllowed, studioRecordView } from "@/lib/studio/studio-record-view";
import {
  clearClipSelection,
  clampPxPerMs,
  createDefaultSnapConfig,
  cycleStudioSnapConfig,
  fitPxPerMs,
  studioTimelineFitLengthMs,
  nudgeClipTimelineStartMs,
  resolveNudgeStepMs,
  resolveSelectedClipId,
  selectClipId,
  snapPresetFromConfig,
  snapTimelineMs,
  STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
  timelineContentOverflowsViewport,
  timelineMsAtViewportX,
  zoomAroundAnchorMs,
  zoomInPxPerMs,
  zoomOutPxPerMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";
import {
  advanceStudioPersistDocumentVersion,
  classifyPersistHttpFailure,
  classifyPersistNetworkFailure,
  StudioPersistOrchestrator,
  type StudioPersistResult,
  type StudioPersistSnapshot,
} from "@/lib/studio/studio-persist-orchestrator";
import {
  STUDIO_MASTER_GAIN_DB_MAX,
  STUDIO_MASTER_GAIN_DB_MIN,
} from "@/lib/studio/studio-master-mix";
import { isTrackAudible } from "@/lib/studio/studio-track-ops";
import {
  DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE,
  readStudioTransportKeyboardModeLive,
  setStudioTransportKeyboardModeLive,
  subscribeStudioTransportKeyboardMode,
  resolveStudioTransportKeyAction,
} from "@/lib/studio/transport-keyboard-mode";
import {
  planDoubledClipStartMs,
  planVocalDoubler,
} from "@/lib/studio/vocal-doubler-plan";
import {
  canAddStudioTrack,
  shouldShowStudioTrackUpgradeCta,
  countRecordingTracks,
} from "@/lib/studio/studio-track-capacity";
import { STUDIO_MAX_SONG_MS } from "@/config/studio";
import {
  EMPTY_STUDIO_UNDO_HISTORY,
  pickStudioPatchBefore,
  pushStudioUndoEntry,
  studioUndoShortcut,
  takeStudioRedo,
  takeStudioUndo,
  type MasterSessionSnap,
  type StudioUndoEntry,
  type StudioUndoHistory,
  type StudioUndoOp,
} from "@/lib/studio/studio-undo-history";
import {
  canRunStudioStructuralOp,
  isStudioStructuralUndoOp,
  resolveStudioStructuralOpIds,
  resolveStudioUndoId,
  runStudioStructuralOp,
  type StudioApiCall,
  type StudioStructuralUndoOp,
} from "@/lib/studio/studio-undo-structural";
import { StudioBitekChat } from "@/components/studio/studio-bitek-chat";
import { StudioBitekDock, type BitekBubble, type BitekMood } from "@/components/studio/studio-bitek-dock";
import { useBitekProject } from "@/components/studio/use-bitek-project";
import { bitekAutoMixMasterForTier } from "@/config/plan-policy";
import {
  autoMixMasterMaterial,
  autoMixRecordOffer,
  readBitekAutoMixMaster,
  saveAutoMixHandoff,
  subscribeBitekAutoMixMaster,
  writeBitekAutoMixMaster,
} from "@/lib/studio/bitek/auto-mix-master";
import { bitekRulesGuide, type BitekAction } from "@/lib/studio/bitek/bitek-guide";
import { parseBitekBubbleState, type BitekBubbleState } from "@/lib/studio/bitek/store/messages";
import type { BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { StudioMixStep } from "@/components/studio/studio-mix-step";
import { StudioMasterStep } from "@/components/studio/studio-master-step";
import { buildBitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { labelStudioTrackType } from "@/lib/ui/labels";
import type { PremiumTier } from "@/types/premium";

type TimelineMode = StudioTimelineMode;
type FxPanelTarget =
  | { role: "master" }
  | { role: "track"; trackId: string };

/** Server-resolved capacity: plan-policy maxRecordingTracks (Bit not counted). */
export type StudioTrackCapacityProps = {
  maxTracks: number;
  premiumTier: PremiumTier;
};

/** Phase 7.1.1 — primary track chips ≥44px hit area (visual stays compact). */

export function StudioEditor({
  initialDocument,
  initialBeatTitle = null,
  trackCapacity,
}: {
  initialDocument: StudioProjectDocument;
  /** Title of the attached beat (the beat track is always named "Bit"). */
  initialBeatTitle?: string | null;
  trackCapacity: StudioTrackCapacityProps;
}) {
  const [doc, setDoc] = useState(initialDocument);
  const [beatTitle, setBeatTitle] = useState<string | null>(initialBeatTitle);
  /** Stage 2 — A/B: "before BITEK" mix plane heard instead of the saved one (playback only). */
  const [mixAbOverride, setMixAbOverride] = useState<StudioProjectDocument | null>(null);
  const beatRef = useMemo(
    () =>
      resolvePrimaryBeatRef({
        tracks: doc.tracks,
        clips: doc.clips,
        projectBeatId: doc.project.beatId,
      }),
    [doc.tracks, doc.clips, doc.project.beatId],
  );

  const engineDocument: StudioEngineDocument = useMemo(
    () => {
      const mix = mixAbOverride;
      const mixTrack = (id: string) => mix?.tracks.find((x) => x.id === id);
      return {
      timelineLengthMs: doc.project.timelineLengthMs,
      masterGainDb: mix ? mix.project.masterGainDb : doc.project.masterGainDb,
      masterPan: mix ? mix.project.masterPan : doc.project.masterPan,
      masterFxChain: mix ? mix.project.masterFxChain : doc.project.masterFxChain,
      // AUD-01 SSOT — schedule path rejects mismatched BEAT_REF via this field.
      projectBeatId: doc.project.beatId,
      tracks: doc.tracks.map((t) => {
        const m = mixTrack(t.id) ?? t;
        return {
          id: t.id,
          gainDb: m.gainDb,
          pan: m.pan,
          muted: t.muted,
          solo: t.solo,
          effectsChain: m.effectsChain,
          automation: m.automation,
          midi: m.midi,
          trackType: t.trackType,
        };
      }),
      // Drop stale BEAT_REF from the engine graph (defense before planVoices).
      clips: doc.clips
        .filter((c) => {
          if (c.sourceKind !== "BEAT_REF") return true;
          return beatRefMatchesProjectSsot({
            projectBeatId: doc.project.beatId,
            sourceBeatId: c.sourceBeatId,
          });
        })
        .map((c) => ({
          id: c.id,
          trackId: c.trackId,
          sourceKind: c.sourceKind,
          sourceTakeId: c.sourceTakeId,
          sourceBeatId: c.sourceBeatId,
          sourceOffsetMs: c.sourceOffsetMs,
          timelineStartMs: c.timelineStartMs,
          durationMs: c.durationMs || doc.project.timelineLengthMs,
          gainDb: c.gainDb,
          muted: c.muted,
          fadeInMs: c.fadeInMs,
          fadeOutMs: c.fadeOutMs,
          scratchCueMs: c.scratchCueMs,
          scratchReverse: c.scratchReverse,
          scratchRate: c.scratchRate,
          stretchRatio: c.stretchRatio,
          pitchCents: c.pitchCents,
        })),
      };
    },
    [doc, mixAbOverride],
  );

  return (
    <StudioTransportProvider
      key={`${doc.project.id}:${beatRef?.beatId ?? "none"}`}
      timelineLengthMs={doc.project.timelineLengthMs}
      beatId={beatRef?.beatId ?? null}
      engineDocument={engineDocument}
      tempoBpm={doc.project.tempoBpm}
      timeSignatureNum={doc.project.timeSignatureNum}
    >
      <StudioEditorInner
        doc={doc}
        setDoc={setDoc}
        trackCapacity={trackCapacity}
        onMixAbOverride={setMixAbOverride}
        beatTitle={beatTitle}
        onBeatTitle={setBeatTitle}
      />
    </StudioTransportProvider>
  );
}

function StudioEditorInner({
  doc,
  setDoc,
  trackCapacity,
  onMixAbOverride,
  beatTitle,
  onBeatTitle,
}: {
  doc: StudioProjectDocument;
  setDoc: Dispatch<SetStateAction<StudioProjectDocument>>;
  trackCapacity: StudioTrackCapacityProps;
  onMixAbOverride: (before: StudioProjectDocument | null) => void;
  beatTitle: string | null;
  onBeatTitle: (title: string | null) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const { playheadMs } = useStudioTransportPlayhead();
  const tInspector = useTranslations("studio.inspectorTitle");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [persistSnap, setPersistSnap] = useState<StudioPersistSnapshot>({
    status: "CLEAN",
    generation: 0,
    inFlight: false,
    queued: false,
    autoRetryCount: 0,
    label: "Gotowe",
    conflict: false,
    lastError: null,
  });
  const persistRef = useRef<StudioPersistOrchestrator | null>(null);
  const docRef = useRef(doc);
  /** Stage 0 undo — last server-acked document (drag previews never land here). */
  const committedDocRef = useRef(doc);
  const [undoHistory, setUndoHistory] = useState<StudioUndoHistory>(
    EMPTY_STUDIO_UNDO_HISTORY,
  );
  const undoHistoryRef = useRef(undoHistory);
  /** Stage 0 undo — recreated rows: old id → new id (history keeps old ids). */
  const undoAliasRef = useRef(new Map<string, string>());
  /** Disable conflicting controls while a persist is in-flight or queued. */
  const pending = persistSnap.inFlight || persistSnap.queued;
  const [mode, setMode] = useState<TimelineMode>("seek");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pxPerMs, setPxPerMs] = useState(STUDIO_TIMELINE_DEFAULT_PX_PER_MS);
  /** When true, skip auto-fit on resize (user zoomed in/out). Fit button clears it. */
  const userAdjustedZoomRef = useRef(false);
  const [snapConfig, setSnapConfig] = useState<StudioSnapConfig>(() =>
    createDefaultSnapConfig(),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Fragment bar confirm. Separate from the inspector and the simple-view delete. */
  const [fragmentConfirmDelete, setFragmentConfirmDelete] = useState(false);
  /** Phase 5 — pending track delete confirmation (track id). */
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<
    string | null
  >(null);
  /** Phase 6 — open ⋮ menu for a non-BEAT track. */
  const [trackMenuId, setTrackMenuId] = useState<string | null>(null);
  /** Silver/Gold: which track / parameter has its automation envelope open on the timeline. */
  const [automationEdit, setAutomationEdit] = useState<{ trackId: string; param: AutomationParam } | null>(null);
  const [recordingLocked, setRecordingLocked] = useState(false);
  /** Stage 1 — Studio steps: record → mix (→ mastering, soon). */
  const [studioStep, setStudioStep] = useState<"record" | "mix" | "master">("record");
  /** Sample tab sits beside Nagranie. It is not a mix or mastering step. */
  const [sampleTab, setSampleTab] = useState(false);
  /** Silver/Gold start in the advanced studio. Free/Bronze cannot leave the simple record surface. */
  const [recordFullView, setRecordFullView] = useState(() => studioAdvancedRecordAllowed(trackCapacity.premiumTier));
  // After a reload: an approved master for the unchanged mix reopens Mastering (with downloads).
  const restoreProjectId = doc.project.id;
  useEffect(() => {
    let live = true;
    void fetch(`/api/studio/projects/${restoreProjectId}/master`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.approved?.id) {
          setSampleTab(false);
          setStudioStep((cur) => (cur === "record" ? "master" : cur));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [restoreProjectId]);
  const tMix = useTranslations("studio.mixStep");
  const bitekBase = useMemo(() => {
    const beatTrackIds = new Set(doc.tracks.filter((t) => t.trackType === "BEAT").map((t) => t.id));
    const vocalTrackIds = new Set(
      doc.tracks.filter((t) => t.trackType !== "BEAT" && t.trackRole !== "beat" && t.trackRole !== "instrument").map((t) => t.id),
    );
    return {
      hasBeat: Boolean(doc.project.beatId) || doc.clips.some((c) => beatTrackIds.has(c.trackId)),
      vocalTrackCount: vocalTrackIds.size,
      vocalClipCount: doc.clips.filter((c) => vocalTrackIds.has(c.trackId)).length,
    };
  }, [doc.tracks, doc.clips, doc.project.beatId]);
  const canGoMix = !recordingLocked && doc.clips.some((c) => !doc.tracks.some((t) => t.id === c.trackId && t.trackType === "BEAT"));
  const studioLocale = useLocale();
  /** BITEK proposal → same optimistic local update + patchTrack path as the mixer controls (undoable). */
  function applyBitekProposal(trackId: string, patch: Record<string, number | boolean>) {
    if (recordingLockedRef.current) return;
    if (!docRef.current.tracks.some((t) => t.id === trackId)) return;
    setDoc((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    }));
    patchTrack(trackId, patch);
  }
  const getRecordChatContext = () =>
    buildBitekClientContext({ doc: docRef.current, lang: studioLocale === "en" ? "en" : "pl", step: "record" });
  /** STU-14 — re-read browser-local recovery copies. */
  const [recoveryRefreshKey, setRecoveryRefreshKey] = useState(0);
  const [recoverySavedKey, setRecoverySavedKey] = useState(0);
  const [beatPickerOpen, setBeatPickerOpen] = useState(false);
  const [fxPanel, setFxPanel] = useState<FxPanelTarget | null>(null);
  /** Mix Track selection (SoT) — drives P6.6.1 Track meter target. */
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  /**
   * Phase 7.1.4 + Visual Parity V2 — dock / overlay open (XOR with Inspector).
   * xl default expanded is applied via matchMedia (not mobile overlay-on-load).
   */
  const [mixerOpen, setMixerOpen] = useState(false);
  /** Phase 7.1.3 — overlay open (tablet drawer / mobile sheet). Desktop dock always visible. */
  const [inspectorOverlayOpen, setInspectorOverlayOpen] = useState(false);
  /** Explicit Record context when user opens Nagraj without active capture. */
  const [inspectorPreferRecord, setInspectorPreferRecord] = useState(false);
  /** Top-bar REC presses not yet consumed by StudioRecordingPanel (0 = none). */
  const [transportRecordRequest, setTransportRecordRequest] = useState(0);
  /** Space/R vs Space=Play — Owner GO; default remains Szybki REC. */
  const transportKeyboardMode = useSyncExternalStore(
    subscribeStudioTransportKeyboardMode,
    readStudioTransportKeyboardModeLive,
    () => DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE,
  );
  const transportKeyboardModeRef = useRef(transportKeyboardMode);
  useLayoutEffect(() => {
    transportKeyboardModeRef.current = transportKeyboardMode;
  }, [transportKeyboardMode]);
  /** Scratch session SSOT — survives Record panel unmount. */
  const [lastScratchClipId, setLastScratchClipId] = useState<string | null>(
    null,
  );
  const [inspectorCloseRejected, setInspectorCloseRejected] = useState(false);
  const [captureInterruptedNotice, setCaptureInterruptedNotice] = useState<
    string | null
  >(null);
  /** xl dock vs overlay — ensure Inspector content mounts once (no dual RecordingPanel). */
  const [inspectorDesktopRail, setInspectorDesktopRail] = useState(false);
  const mixerPanelId = useId();
  const inspectorPanelId = useId();
  /** Phase 7.1.5 — controls only; playhead/meters via leaf hooks. */
  const transport = useStudioTransportControls();
  const { setTrackMeterTarget, resolveClipSourceUrl, getPlayheadMs } = transport;
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const studioShellRef = useRef<HTMLDivElement | null>(null);
  const recordingLockedRef = useRef(false);
  const unloadAllowedRef = useRef<() => boolean>(() => false);
  const leaveGuard = useStudioLeaveGuard(recordingLocked, studioShellRef);
  const pendingZoomScrollLeftRef = useRef<number | null>(null);
  const pxPerMsRef = useRef(pxPerMs);
  const anySolo = doc.tracks.some((t) => t.solo);
  const length = doc.project.timelineLengthMs;
  const timelineMode: TimelineMode = recordingLocked ? "seek" : mode;
  const activeSelectedId = resolveSelectedClipId(
    selectedClipId,
    doc.clips.map((c) => c.id),
  );
  const selectedClip =
    doc.clips.find((c) => c.id === activeSelectedId) ?? null;
  const trackPendingDelete = confirmDeleteTrackId
    ? (doc.tracks.find((t) => t.id === confirmDeleteTrackId) ?? null)
    : null;
  const trackMenuTrack = trackMenuId
    ? (doc.tracks.find((t) => t.id === trackMenuId) ?? null)
    : null;
  // Recording tracks only — the Bit track does not count against the plan.
  const trackCount = countRecordingTracks(doc.tracks);
  const maxTracks = trackCapacity.maxTracks;
  const atTrackCapacity = !canAddStudioTrack({
    currentTrackCount: trackCount,
    maxTracks,
  });
  const showUpgradeCta = shouldShowStudioTrackUpgradeCta({
    premiumTier: trackCapacity.premiumTier,
    trackCount,
    maxTracks,
  });
  const activeSelectedTrackId =
    selectedTrackId && doc.tracks.some((t) => t.id === selectedTrackId)
      ? selectedTrackId
      : null;
  const selectedTrack =
    activeSelectedTrackId
      ? (doc.tracks.find((t) => t.id === activeSelectedTrackId) ?? null)
      : null;
  const snapPreset = snapPresetFromConfig(snapConfig);
  const recordingContextActive = recordingLocked || inspectorPreferRecord;
  const advancedRecord = studioAdvancedRecordAllowed(trackCapacity.premiumTier);
  const onSampleTab = sampleTab && studioStep === "record";
  const recordSimple =
    onSampleTab ||
    studioRecordView({ step: studioStep, fullView: recordFullView, advancedAllowed: advancedRecord }) === "simple";
  const inspectorContext = deriveStudioInspectorContext({
    recordingActive: recordingContextActive || recordSimple,
    selectedClipId: activeSelectedId,
    selectedTrackId: activeSelectedTrackId,
  });

  // Stage 2b — BITEK the raccoon: per-project memory, bubble + chat overlay.
  const tBitek = useTranslations("studio.bitek");
  const autoMixMasterAllowed = bitekAutoMixMasterForTier(trackCapacity.premiumTier);
  const autoOn = useSyncExternalStore(
    subscribeBitekAutoMixMaster,
    () => readBitekAutoMixMaster(trackCapacity.premiumTier),
    () => false,
  );
  const bitekStore = useBitekProject(doc.project.id);
  const [bitekChatOpen, setBitekChatOpen] = useState(false);
  const [bitekChatBusy, setBitekChatBusy] = useState(false);
  const [mixBubble, setMixBubble] = useState<BitekBubble | null>(null);
  const mixChatContextRef = useRef<(() => BitekClientContext) | null>(null);
  const [masterBubble, setMasterBubble] = useState<BitekBubble | null>(null);
  // Recording P0 — latency / Bluetooth / take-lane notices from the record panel.
  const [recToolsBubble, setRecToolsBubble] = useState<BitekBubble | null>(null);
  const masterChatContextRef = useRef<(() => BitekClientContext) | null>(null);
  const masterApplyRef = useRef<((key: "loudness" | "bright" | "bass" | "width" | "squash", value: number) => void) | null>(null);
  const masterSessionRef = useRef<{ apply: (snap: MasterSessionSnap) => void } | null>(null);
  const [bitekBubbleUi, setBitekBubbleUi] = useState<BitekBubbleState | null>(null);
  const bitekBubbleState = bitekBubbleUi ?? parseBitekBubbleState(bitekStore.messages);
  const saveBitekBubbleState = (next: BitekBubbleState) => {
    setBitekBubbleUi(next);
    bitekStore.append([{ kind: "state", content: JSON.stringify(next) }]);
  };
  const welcomeSavedRef = useRef(false);
  useEffect(() => {
    if (!bitekStore.loaded || !bitekStore.fresh || welcomeSavedRef.current) return;
    welcomeSavedRef.current = true;
    bitekStore.append([{ kind: "welcome", content: tBitek("dock.powitanie") }]);
  }, [bitekStore, tBitek]);
  const onRecordBitekAction = (action: BitekAction) => {
    if (action === "goMix" && canGoMix) {
      setSampleTab(false);
      setStudioStep("mix");
    }
    if (action === "chooseBeat") setBeatPickerOpen(true);
    if (action === "record") {
      setInspectorPreferRecord(true);
      openInspectorOverlay();
    }
  };
  const takeContentEndMs = doc.clips.reduce(
    (m, c) => (c.sourceKind === "TAKE" ? Math.max(m, c.timelineStartMs + c.durationMs) : m),
    0,
  );
  const songCapMs = Math.min(length, STUDIO_MAX_SONG_MS);
  const recordBubble: BitekBubble = (() => {
    if (recToolsBubble && !recordingLocked) return recToolsBubble;
    if (!recordingLocked && takeContentEndMs > 0 && takeContentEndMs >= songCapMs - 500) {
      const sec = Math.round(STUDIO_MAX_SONG_MS / 1000);
      const max = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      return {
        key: "rec-songLimit",
        mood: "thinking",
        text: tBitek("msg.songLimit", { max }),
        details: [],
        actions: canGoMix
          ? [{ id: "goMix", label: tBitek("akcja.goMix"), primary: true, onClick: () => onRecordBitekAction("goMix") }]
          : [],
      };
    }
    const keysTrack =
      doc.tracks.find((track) => track.id === activeSelectedTrackId && reviewPlayedNotes(track.midi)) ??
      doc.tracks.find((track) => reviewPlayedNotes(track.midi));
    const keysReview = keysTrack ? reviewPlayedNotes(keysTrack.midi) : null;
    const material = autoMixMasterMaterial({
      beatId: doc.project.beatId,
      tracks: doc.tracks,
      clips: doc.clips,
    });
    const offer = autoMixRecordOffer({
      enabled: autoOn,
      recording: recordingLocked,
      vocal: material.vocal,
      beat: material.beat,
    });
    if (offer !== "ready" && !recordingLocked && keysTrack && keysReview) {
      const ok = keysReview.code === "line-ok" || keysReview.code === "drums-ok";
      const msgKey =
        keysReview.code === "short" ? "keysShort"
        : keysReview.code === "same" ? "keysSame"
        : keysReview.code === "leap" ? "keysLeap"
        : keysReview.code === "drums-one" ? "keysDrumsOne"
        : keysReview.code === "drums-ok" ? "keysDrumsOk"
        : "keysLineOk";
      return {
        key: `keys-${keysTrack.id}-${keysReview.code}-${keysReview.count}`,
        mood: ok ? "done" : "thinking",
        text: tBitek(`msg.${msgKey}`, { count: keysReview.count }),
        actions: [],
      };
    }
    if (offer !== "hidden") {
      const text =
        offer === "ready"
          ? tBitek("msg.autoReady")
          : offer === "need-vocal"
            ? tBitek("msg.autoNeedVocal")
            : offer === "need-beat"
              ? tBitek("msg.autoNeedBeat")
              : tBitek("msg.autoNeedBoth");
      const actions: BitekBubble["actions"] =
        offer === "ready"
          ? [{
              id: "autoMix",
              label: tBitek("akcja.autoMix"),
              primary: true,
              onClick: () => {
                saveAutoMixHandoff(doc.project.id);
                setSampleTab(false);
                setStudioStep("mix");
              },
            }]
          : offer === "need-beat"
            ? [{ id: "chooseBeat", label: tBitek("akcja.chooseBeat"), primary: true, onClick: () => onRecordBitekAction("chooseBeat") }]
            : offer === "need-vocal"
              ? [{ id: "record", label: tBitek("akcja.record"), primary: true, onClick: () => onRecordBitekAction("record") }]
              : [
                  { id: "chooseBeat", label: tBitek("akcja.chooseBeat"), primary: true, onClick: () => onRecordBitekAction("chooseBeat") },
                  { id: "record", label: tBitek("akcja.record"), onClick: () => onRecordBitekAction("record") },
                ];
      return { key: `auto-offer-${offer}`, mood: offer === "ready" ? "done" : "alert", text, actions };
    }
    const msgs = bitekRulesGuide({ step: "record", recording: recordingLocked, ...bitekBase, analysis: { status: "idle" } });
    const first = msgs[0];
    const mood: BitekMood = recordingLocked ? "thinking" : first?.key === "readyForMix" ? "done" : "happy";
    return {
      key: `rec-${first?.id ?? "idle"}`,
      mood,
      text: first ? tBitek(`msg.${first.key}`, first.params ?? {}) : tBitek("dock.gotowy"),
      details: msgs.slice(1).map((m) => tBitek(`msg.${m.key}`, m.params ?? {})),
      actions: first?.action
        ? [{ id: first.action, label: tBitek(`akcja.${first.action}`), primary: true, onClick: () => onRecordBitekAction(first.action as BitekAction) }]
        : [],
    };
  })();
  const welcomeBubble: BitekBubble | null = bitekStore.fresh
    ? {
        key: "welcome",
        mood: "happy",
        hero: true,
        text: tBitek("dock.powitanie"),
        details: [tBitek("dock.powitanieKrok1"), tBitek("dock.powitanieKrok2"), tBitek("dock.powitanieKrok3")],
        actions: [{ id: "welcome-ok", label: tBitek("dock.zaczynamy"), primary: true, onClick: () => saveBitekBubbleState({ minimized: false, dismissedKey: "welcome" }) }],
      }
    : null;
  const stepBubble = studioStep === "master" ? masterBubble : studioStep === "mix" ? mixBubble : recordBubble;
  const bitekBubble =
    welcomeBubble && bitekBubbleState.dismissedKey !== "welcome" && !bitekBubbleUi?.dismissedKey ? welcomeBubble : stepBubble;

  function openInspectorOverlay() {
    setMixerOpen(false);
    setInspectorOverlayOpen(true);
  }

  function closeInspectorOverlay(): boolean {
    if (
      studioInspectorOverlayCloseBlocked({
        recordingLocked,
        overlayHostsInspector: inspectorOverlayOpen && !inspectorDesktopRail,
      })
    ) {
      setInspectorCloseRejected(true);
      return false;
    }
    setInspectorCloseRejected(false);
    setInspectorOverlayOpen(false);
    return true;
  }

  function openMixerSurface() {
    if (!closeInspectorOverlay()) return;
    setMixerOpen(true);
  }

  function closeMixerSurface() {
    setMixerOpen(false);
  }

  function toggleMixerSurface() {
    if (mixerOpen) closeMixerSurface();
    else openMixerSurface();
  }

  useEffect(() => {
    setTrackMeterTarget(activeSelectedTrackId);
  }, [activeSelectedTrackId, setTrackMeterTarget]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const apply = () => {
      const desktop = mq.matches;
      setInspectorDesktopRail(desktop);
      if (desktop) {
        setInspectorOverlayOpen(false);
        // Visual Parity V2 — Mixer Contract C: xl expanded by default.
        setMixerOpen(true);
      } else {
        // Avoid auto-opening <xl Mixer overlay when leaving desktop.
        setMixerOpen(false);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    const orch = new StudioPersistOrchestrator({
      onChange: (snap) => setPersistSnap(snap),
    });
    persistRef.current = orch;
    const onOnline = () => orch.onOnline();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      orch.dispose();
      persistRef.current = null;
    };
  }, []);

  useEffect(() => {
    recordingLockedRef.current = recordingLocked;
    unloadAllowedRef.current = leaveGuard.unloadAllowed;
  });

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const snap = persistRef.current?.getSnapshot();
      const persistGuarded = Boolean(
        snap &&
          (snap.status === "DIRTY" ||
            snap.status === "SAVING" ||
            snap.status === "SAVE_FAILED" ||
            snap.queued ||
            snap.inFlight),
      );
      if (
        !studioPageUnloadPrompt({
          unloadAllowed: unloadAllowedRef.current(),
          captureActive: recordingLockedRef.current,
          persistGuarded,
        })
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    pxPerMsRef.current = pxPerMs;
  }, [pxPerMs]);

  function enqueuePersist(executor: () => Promise<StudioPersistResult>) {
    persistRef.current?.requestPersist(executor);
  }

  async function enqueuePersistAsync(
    executor: () => Promise<StudioPersistResult>,
  ): Promise<StudioPersistResult> {
    const orch = persistRef.current;
    if (!orch) {
      return {
        ok: false,
        kind: "unknown",
        message: tr("persistNiedostepny"),
        retryable: false,
      };
    }
    return orch.requestPersistAsync(executor);
  }

  async function flushPersist(
    executor?: () => Promise<StudioPersistResult>,
  ): Promise<void> {
    await persistRef.current?.flush(executor);
  }

  /**
   * Apply CAS ack into React state and sync docRef immediately so the next
   * queued persist reads documentVersion N+1 (not a stale closure).
   */
  function applyPersistedDoc(
    mutate: (prev: StudioProjectDocument) => StudioProjectDocument,
  ): void {
    setDoc((prev) => {
      const next = mutate(prev);
      docRef.current = next;
      committedDocRef.current = next;
      return next;
    });
  }

  function recordUndo(entry: StudioUndoEntry): void {
    const next = pushStudioUndoEntry(undoHistoryRef.current, entry);
    undoHistoryRef.current = next;
    setUndoHistory(next);
  }

  function commitMasterSession(before: MasterSessionSnap, after: MasterSessionSnap): void {
    recordUndo({
      undo: { kind: "master_session", snap: before },
      redo: { kind: "master_session", snap: after },
    });
  }

  function committedClip(clipId: string): StudioClipDto | undefined {
    return committedDocRef.current.clips.find((c) => c.id === clipId);
  }

  function clipGeometryOp(clip: StudioClipDto): StudioUndoOp {
    return {
      kind: "clip_geometry",
      clipId: clip.id,
      timelineStartMs: clip.timelineStartMs,
      durationMs: clip.durationMs,
      sourceOffsetMs: clip.sourceOffsetMs,
    };
  }

  /** Replays one history op through the normal CAS path (never re-recorded). */
  function runUndoOp(rawOp: StudioUndoOp): boolean {
    const quiet = { history: false } as const;
    const r = (id: string) => resolveStudioUndoId(undoAliasRef.current, id);
    if (isStudioStructuralUndoOp(rawOp)) {
      const sop = resolveStudioStructuralOpIds(rawOp, r);
      if (!canRunStudioStructuralOp(sop, committedDocRef.current)) return false;
      runStructuralUndoOp(sop);
      return true;
    }
    const op: StudioUndoOp =
      "clipId" in rawOp
        ? { ...rawOp, clipId: r(rawOp.clipId) }
        : "trackId" in rawOp
          ? { ...rawOp, trackId: r(rawOp.trackId) }
          : rawOp;
    switch (op.kind) {
      case "track":
        if (!committedDocRef.current.tracks.some((t) => t.id === op.trackId)) return false;
        patchTrack(op.trackId, op.patch, quiet);
        return true;
      case "master":
        patchMasterMix(op.patch, quiet);
        return true;
      case "clip_geometry":
        if (!committedClip(op.clipId)) return false;
        persistClipGeometryCommit(
          op.clipId,
          {
            kind: "set_geometry",
            timelineStartMs: op.timelineStartMs,
            durationMs: op.durationMs,
            sourceOffsetMs: op.sourceOffsetMs,
          },
          quiet,
        );
        return true;
      case "clip_fades":
        if (!committedClip(op.clipId)) return false;
        saveClipFades(op.fadeInMs, op.fadeOutMs, { ...quiet, clipId: op.clipId });
        return true;
      case "clip_gain":
        if (!committedClip(op.clipId)) return false;
        saveClipGain(op.gainDb, { ...quiet, clipId: op.clipId });
        return true;
      case "clip_mute":
        if (!committedClip(op.clipId)) return false;
        saveClipMute(op.muted, { ...quiet, clipId: op.clipId });
        return true;
      case "clip_scratch":
        if (!committedClip(op.clipId)) return false;
        saveClipScratch(
          { clipId: op.clipId, cueMs: op.cueMs, reverse: op.reverse, rate: op.rate },
          quiet,
        );
        return true;
      case "track_fx":
      case "master_fx":
        if (op.kind === "track_fx" && !committedDocRef.current.tracks.some((t) => t.id === op.trackId)) return false;
        persistFxChainForHistory(op);
        return true;
      case "mix_ops": {
        const ops = op.ops.map((o) => ("trackId" in o ? { ...o, trackId: r(o.trackId) } : o));
        if (ops.some((o) => "trackId" in o && !committedDocRef.current.tracks.some((t) => t.id === o.trackId))) return false;
        void persistMixWorkingOps(ops, null);
        return true;
      }
      case "master_session": {
        const apply = masterSessionRef.current?.apply;
        if (!apply) return false;
        apply(op.snap);
        return true;
      }
    }
  }

  /**
   * Stage 2 — atomic Mix Working apply (same CAS path as history restore).
   * `revision` = BITEK "AI" version meta; null for undo/redo replays.
   */
  async function persistMixWorkingOps(
    ops: MixWorkingOp[],
    revision: { author: "AI"; description: string } | null,
    options?: { asUser?: boolean },
  ): Promise<StudioPersistResult> {
    setError(null);
    return enqueuePersistAsync(async () => {
      try {
        const res = await fetch(`/api/studio/projects/${docRef.current.project.id}/mix-working/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDocumentVersion: docRef.current.project.documentVersion,
            requestId: crypto.randomUUID(),
            ops,
            ...(revision ? { revision } : {}),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (!res.ok || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZapisac"),
            code: json.code,
          });
          if (!revision || options?.asUser) {
            if (failure.kind === "conflict") setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
            else if (!failure.retryable) setError(failure.message);
          }
          return failure;
        }
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => {
              const next = applyMixOpsToDocument(prev, ops);
              return { ...next, project: { ...next.project, documentVersion } };
            });
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Stage 2 — BITEK auto-fix: one atomic apply, one undo entry, "AI" version. */
  async function applyMixAutofix(
    ops: MixWorkingOp[],
    description: string,
    options?: { asUser?: boolean },
  ): Promise<{ ok: true; before: StudioProjectDocument } | { ok: false; conflict: boolean }> {
    if (recordingLockedRef.current || ops.length === 0) return { ok: false, conflict: false };
    await flushPersist();
    const before = committedDocRef.current;
    const inverse = inverseMixAutofixOps(before, ops);
    // Gaps P0 #3 — user-picked vocal sets are a USER version (server default), BITEK fixes stay "AI".
    const result = await persistMixWorkingOps(ops, options?.asUser ? null : { author: "AI", description }, options);
    if (!result.ok) return { ok: false, conflict: result.kind === "conflict" };
    recordUndo({ undo: { kind: "mix_ops", ops: inverse }, redo: { kind: "mix_ops", ops } });
    return { ok: true, before };
  }

  const studioApiCall: StudioApiCall = async (method, path, body) => {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    return { ok: res.ok, status: res.status, json };
  };

  /** Structural undo/redo (add/delete/split/duplicate) — one serial persist. */
  function runStructuralUndoOp(op: StudioStructuralUndoOp): void {
    setError(null);
    enqueuePersist(async () => {
      try {
        const result = await runStudioStructuralOp(op, {
          projectId: projectId(),
          documentVersion: expectedDocumentVersion(),
          doc: committedDocRef.current,
          api: studioApiCall,
        });
        if (!result.ok) {
          const failure = classifyPersistHttpFailure({
            status: result.status,
            message: result.message,
            code: result.code,
          });
          if (failure.kind === "conflict") setError(result.message ?? FX_CHAIN_CONFLICT_UI_PL);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        for (const [oldId, newId] of result.aliases) {
          if (oldId !== newId) undoAliasRef.current.set(oldId, newId);
        }
        const documentVersion = result.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...result.mutate(prev),
              project: { ...prev.project, documentVersion },
            }));
            setSelectedClipId((prev) =>
              prev && !docRef.current.clips.some((c) => c.id === prev) ? null : prev,
            );
            setSelectedTrackId((prev) =>
              prev && !docRef.current.tracks.some((t) => t.id === prev) ? null : prev,
            );
            if (result.partial) setError(tr("cofnietoCzesciowo"));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function undoStudioEdit(): void {
    const taken = takeStudioUndo(undoHistoryRef.current);
    if (!taken) return;
    undoHistoryRef.current = taken.history;
    setUndoHistory(taken.history);
    if (runUndoOp(taken.op)) setStatus(tr("cofnietoZmiane"));
    else setStatus(tr("nieMoznaCofnac"));
  }

  function redoStudioEdit(): void {
    const taken = takeStudioRedo(undoHistoryRef.current);
    if (!taken) return;
    undoHistoryRef.current = taken.history;
    setUndoHistory(taken.history);
    if (runUndoOp(taken.op)) setStatus(tr("ponowionoZmiane"));
    else setStatus(tr("nieMoznaCofnac"));
  }

  function persistFxChainForHistory(
    op: Extract<StudioUndoOp, { kind: "track_fx" | "master_fx" }>,
  ): void {
    setError(null);
    enqueuePersist(async () => {
      try {
        const path =
          op.kind === "master_fx"
            ? `/api/studio/projects/${docRef.current.project.id}/master-fx`
            : `/api/studio/projects/${docRef.current.project.id}/tracks/${op.trackId}/effects`;
        const res = await fetch(path, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDocumentVersion: docRef.current.project.documentVersion,
            chain: op.chain,
          }),
        });
        const json = (await res.json()) as {
          documentVersion?: number;
          effectsChain?: StudioFxChainV1;
          masterFxChain?: StudioFxChainV1;
          error?: string;
          code?: string;
        };
        const chain = op.kind === "master_fx" ? json.masterFxChain : json.effectsChain;
        if (!res.ok || !chain || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZapisac"),
            code: json.code,
          });
          if (failure.kind === "conflict") setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) =>
              op.kind === "master_fx"
                ? { ...prev, project: { ...prev.project, documentVersion, masterFxChain: chain } }
                : {
                    ...prev,
                    project: { ...prev.project, documentVersion },
                    tracks: prev.tracks.map((t) =>
                      t.id === op.trackId ? { ...t, effectsChain: chain } : t,
                    ),
                  },
            );
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function expectedDocumentVersion(): number {
    return docRef.current.project.documentVersion;
  }

  /**
   * Marker / Inspector CAS ack → same applyPersistedDoc path as clip place.
   * Clip-move reads docRef, not the Inspector tip.
   */
  function applyAckedDocumentVersion(ack: unknown): number {
    const next = advanceStudioPersistDocumentVersion(
      expectedDocumentVersion(),
      ack,
    );
    applyPersistedDoc((prev) => {
      if (next <= prev.project.documentVersion) return prev;
      return {
        ...prev,
        project: { ...prev.project, documentVersion: next },
      };
    });
    return next;
  }

  function projectId(): string {
    return docRef.current.project.id;
  }

  useLayoutEffect(() => {
    const nextLeft = pendingZoomScrollLeftRef.current;
    if (nextLeft == null) return;
    pendingZoomScrollLeftRef.current = null;
    const el = timelineScrollRef.current;
    if (el) el.scrollLeft = nextLeft;
  }, [pxPerMs]);

  /** Fit target: end of the last clip + room (view only), read by the auto-fit observer. */
  const fitLength = studioTimelineFitLengthMs(length, doc.clips);
  const fitLengthRef = useRef(fitLength);
  useLayoutEffect(() => {
    fitLengthRef.current = fitLength;
  }, [fitLength]);
  /** Mobile / narrow lane: auto-Fit while the user has not manually zoomed. */
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;

    function maybeAutoFit(el: HTMLDivElement) {
      if (userAdjustedZoomRef.current) return;
      const viewport = el.clientWidth;
      if (
        !timelineContentOverflowsViewport(
          length,
          viewport,
          pxPerMsRef.current,
        )
      ) {
        return;
      }
      const next = fitPxPerMs(fitLengthRef.current, viewport);
      zoomAroundViewportX(next, viewport / 2);
    }

    function attach() {
      const el = timelineScrollRef.current;
      if (!el) {
        if (tries++ < 90) raf = requestAnimationFrame(attach);
        return;
      }
      maybeAutoFit(el);
      ro = new ResizeObserver(() => {
        maybeAutoFit(el);
      });
      ro.observe(el);
    }

    attach();
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // zoomAroundViewportX uses refs for density; length is the intentional dep.
  }, [length]);

  function applySnap(ms: number, bounds?: { minMs?: number; maxMs?: number }) {
    return snapTimelineMs(ms, snapConfig, bounds);
  }

  function seekSnapped(ms: number) {
    if (recordingLocked) return;
    // Integer ms via snapTimelineMs (OFF → round only; grid → interval).
    transport.seek(applySnap(ms, { minMs: 0, maxMs: length }));
  }

  /** Phase 2 — zoom keeping the anchor time under the same viewport X. */
  function zoomAroundViewportX(nextPxPerMs: number, viewportOffsetPx: number) {
    const el = timelineScrollRef.current;
    const current = pxPerMsRef.current;
    if (!el) {
      setPxPerMs(clampPxPerMs(nextPxPerMs));
      return;
    }
    const anchorMs = timelineMsAtViewportX({
      scrollLeft: el.scrollLeft,
      viewportOffsetPx,
      pxPerMs: current,
    });
    const result = zoomAroundAnchorMs({
      currentPxPerMs: current,
      nextPxPerMs,
      anchorMs,
      viewportOffsetPx,
    });
    pendingZoomScrollLeftRef.current = result.scrollLeft;
    pxPerMsRef.current = result.pxPerMs;
    setPxPerMs(result.pxPerMs);
  }

  function zoomAtViewportCenter(nextPxPerMs: number) {
    const el = timelineScrollRef.current;
    const center = el ? el.clientWidth / 2 : 0;
    zoomAroundViewportX(nextPxPerMs, center);
  }

  /** Persist clip move via existing PATCH/CAS — used by drag + keyboard nudge. */
  function persistClipMove(
    clipId: string,
    timelineStartMs: number,
    options?: { applySnapGrid?: boolean },
  ): void {
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const maxStart = Math.max(0, length - clip.durationMs);
    const applyGrid = options?.applySnapGrid !== false;
    const target = applyGrid
      ? applySnap(timelineStartMs, { minMs: 0, maxMs: maxStart })
      : Math.min(maxStart, Math.max(0, Math.round(timelineStartMs)));
    if (target === clip.timelineStartMs) return;
    persistClipGeometryCommit(clipId, {
      kind: "move",
      timelineStartMs: target,
    });
  }

  /** Phase 4 / 7.1.6 — MOVE / TRIM / set_geometry via CAS + serial orchestrator. */
  function persistClipGeometryCommit(
    clipId: string,
    commit: Exclude<StudioClipEditCommit, { kind: "noop" }>,
    opts?: { history?: boolean },
  ): void {
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
      try {
        const body: Record<string, unknown> = {
          expectedDocumentVersion: docRef.current.project.documentVersion,
        };
        if (commit.kind === "move") {
          body.op = "move";
          body.timelineStartMs = commit.timelineStartMs;
        } else if (commit.kind === "trim_left") {
          body.op = "trim_left";
          body.trimMs = commit.trimMs;
        } else if (commit.kind === "trim_right") {
          body.op = "trim_right";
          body.trimMs = commit.trimMs;
        } else {
          body.op = "set_geometry";
          body.timelineStartMs = commit.timelineStartMs;
          body.durationMs = commit.durationMs;
          body.sourceOffsetMs = commit.sourceOffsetMs;
        }

        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = (await res.json()) as {
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          !json.clip ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZapisac"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const clip = json.clip;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            if (record && beforeClip) {
              recordUndo({ undo: clipGeometryOp(beforeClip), redo: clipGeometryOp(clip) });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: prev.clips.map((c) => (c.id === clip.id ? clip : c)),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function patchTrack(
    trackId: string,
    body: Record<string, unknown>,
    opts?: { history?: boolean },
  ): void {
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const beforeTrack = committedDocRef.current.tracks.find((t) => t.id === trackId);
      const before = beforeTrack
        ? pickStudioPatchBefore(beforeTrack as unknown as Record<string, unknown>, body)
        : null;
      try {
        const expected = docRef.current.project.documentVersion;
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/tracks/${trackId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...body,
              expectedDocumentVersion: expected,
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          track?: StudioTrackDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (!res.ok || !json.track || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZaktualizowac"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const track = json.track;
        const documentVersion = json.documentVersion;
        return {
          ok: true,
          documentVersion,
          apply: () => {
            if (record && before) {
              recordUndo({
                undo: { kind: "track", trackId, patch: before },
                redo: { kind: "track", trackId, patch: pickStudioPatchBefore(track as unknown as Record<string, unknown>, body) },
              });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: prev.tracks.map((t) =>
                t.id === trackId ? track : t,
              ),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Silver/Gold: replace a track's gain / pan automation (CAS). Shows the new envelope at once, then confirms. */
  function saveTrackAutomation(trackId: string, automation: StudioAutomationV1): void {
    setError(null);
    setDoc((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, automation } : t)) }));
    enqueuePersist(async () => {
      try {
        const expected = docRef.current.project.documentVersion;
        const res = await fetch(`/api/studio/projects/${docRef.current.project.id}/tracks/${trackId}/automation`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedDocumentVersion: expected, automation }),
        });
        const json = (await res.json()) as { success?: boolean; automation?: StudioAutomationV1; documentVersion?: number; error?: string; code?: string };
        if (!res.ok || !json.automation || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZaktualizowac"),
            code: json.code,
          });
          if (failure.kind === "conflict") setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        const saved = json.automation;
        const documentVersion = json.documentVersion;
        return {
          ok: true,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, automation: saved } : t)),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Replace a track's MIDI notes (CAS). Empty notes clear the column. */
  function saveTrackMidi(trackId: string, midi: StudioMidiV1): void {
    setError(null);
    setDoc((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, midi } : t)) }));
    enqueuePersist(async () => {
      try {
        const expected = docRef.current.project.documentVersion;
        const res = await fetch(`/api/studio/projects/${docRef.current.project.id}/tracks/${trackId}/midi`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedDocumentVersion: expected, midi }),
        });
        const json = (await res.json()) as { success?: boolean; midi?: StudioMidiV1; documentVersion?: number; error?: string; code?: string };
        if (!res.ok || !json.midi || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZaktualizowac"),
            code: json.code,
          });
          if (failure.kind === "conflict") setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        const saved = json.midi;
        const documentVersion = json.documentVersion;
        return {
          ok: true,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, midi: saved } : t)),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function patchMasterMix(body: {
    masterGainDb?: number;
    masterPan?: number;
  }, opts?: { history?: boolean }): void {
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const before = pickStudioPatchBefore(
        committedDocRef.current.project as unknown as Record<string, unknown>,
        body,
      ) as { masterGainDb?: number; masterPan?: number };
      try {
        const expected = docRef.current.project.documentVersion;
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: expected,
              ...body,
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          documentVersion?: number;
          masterGainDb?: number;
          masterPan?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          typeof json.documentVersion !== "number" ||
          typeof json.masterGainDb !== "number" ||
          typeof json.masterPan !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZapisac2"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const documentVersion = json.documentVersion;
        const masterGainDb = json.masterGainDb;
        const masterPan = json.masterPan;
        return {
          ok: true,
          documentVersion,
          apply: () => {
            if (record) {
              recordUndo({
                undo: { kind: "master", patch: before },
                redo: {
                  kind: "master",
                  patch: pickStudioPatchBefore({ masterGainDb, masterPan }, body),
                },
              });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion,
                masterGainDb,
                masterPan,
              },
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function reorder(trackId: string, direction: "up" | "down") {
    setError(null);
    enqueuePersist(async () => {
      try {
        const expected = docRef.current.project.documentVersion;
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/tracks/${trackId}/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              direction,
              expectedDocumentVersion: expected,
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          tracks?: StudioTrackDto[];
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          !json.tracks ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZmienic"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const tracks = json.tracks;
        const documentVersion = json.documentVersion;
        return {
          ok: true,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks,
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Phase 5 / 7.1.6 — add VOCAL track via CAS + serial orchestrator. */
  function addTrack(): void {
    setError(null);
    enqueuePersist(async () => {
      try {
        const res = await fetch(`/api/studio/projects/${projectId()}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDocumentVersion: expectedDocumentVersion(),
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          track?: StudioTrackDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (json.code === "TRACK_CAPACITY_REACHED") {
          setError(json.error ?? tr("osiagnietoLimitSciezek"));
          return classifyPersistHttpFailure({
            status: 403,
            message: json.error ?? tr("osiagnietoLimitSciezek"),
            code: json.code,
          });
        }
        if (!res.ok || !json.track || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieDodac"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const track = json.track;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: [...prev.tracks, track].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              ),
            }));
            setSelectedTrackId(track.id);
            recordUndo({
              undo: { kind: "track_remove", trackId: track.id, clipIds: [] },
              redo: { kind: "track_add", track },
            });
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Phase 6 / 7.1.6 — duplicate track via CAS + serial orchestrator. */
  function duplicateTrack(trackId: string, opts?: { asVocalDouble?: boolean }): void {
    setError(null);
    setTrackMenuId(null);
    const asDouble = Boolean(opts?.asVocalDouble);
    const doublePlan = asDouble ? planVocalDoubler("R") : null;
    enqueuePersist(async () => {
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId()}/tracks/${trackId}/duplicate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: expectedDocumentVersion(),
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          track?: StudioTrackDto;
          clips?: StudioClipDto[];
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (json.code === "TRACK_CAPACITY_REACHED") {
          setError(json.error ?? tr("osiagnietoLimitSciezek"));
          return classifyPersistHttpFailure({
            status: 403,
            message: json.error ?? tr("osiagnietoLimitSciezek"),
            code: json.code,
          });
        }
        if (json.code === "BEAT_TRACK_PROTECTED") {
          setError(json.error ?? tr("sciezkiBitNieMozna"));
          return classifyPersistHttpFailure({
            status: 403,
            message: json.error ?? tr("sciezkiBitNieMozna"),
            code: json.code,
          });
        }
        if (
          !res.ok ||
          !json.track ||
          !Array.isArray(json.clips) ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZduplikowac"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const track = json.track;
        const clips = json.clips;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: [...prev.tracks, track].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              ),
              clips: [...prev.clips, ...clips].sort(
                (a, b) => a.timelineStartMs - b.timelineStartMs,
              ),
            }));
            setSelectedTrackId(track.id);
            setSelectedClipId(null);
            const dupClipIds = [...clips]
              .sort((a, b) => a.timelineStartMs - b.timelineStartMs)
              .map((c) => c.id);
            recordUndo({
              undo: { kind: "track_remove", trackId: track.id, clipIds: dupClipIds },
              redo: {
                kind: "track_duplicate",
                sourceTrackId: trackId,
                duplicateTrackId: track.id,
                duplicateClipIds: dupClipIds,
              },
            });
            if (doublePlan) {
              patchTrack(track.id, {
                pan: doublePlan.pan,
                gainDb: doublePlan.gainDb,
                trackRole: doublePlan.trackRole,
                name: `${track.name} · ${doublePlan.nameSuffix}`.slice(0, 80),
              });
              for (const clip of clips) {
                persistClipMove(
                  clip.id,
                  planDoubledClipStartMs(clip.timelineStartMs, doublePlan.offsetMs),
                  { applySnapGrid: false },
                );
                if (clipPitchForTier(trackCapacity.premiumTier)) {
                  saveClipPlayback(clip.id, {
                    stretch: clip.stretchRatio ?? 1,
                    pitchCents: doublePlan.pitchCents,
                  });
                }
              }
              setStatus(tr("dubelGotowy"));
            }
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Phase 5 / 7.1.6 — delete track via CAS + serial orchestrator. */
  function deleteTrack(trackId: string): void {
    setError(null);
    enqueuePersist(async () => {
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId()}/tracks/${trackId}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: expectedDocumentVersion(),
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          deletedTrackId?: string;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          !json.deletedTrackId ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieUsunac"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const deletedTrackId = json.deletedTrackId;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: prev.tracks.filter((t) => t.id !== deletedTrackId),
              clips: prev.clips.filter((c) => c.trackId !== deletedTrackId),
            }));
            setSelectedTrackId((prev) =>
              prev === trackId ? null : prev,
            );
            setSelectedClipId((prev) => {
              const clip = docRef.current.clips.find((c) => c.id === prev);
              if (clip?.trackId === trackId) {
                setConfirmDelete(false);
                return null;
              }
              return prev;
            });
            setConfirmDeleteTrackId(null);
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Clip PATCH ops (move/trim/…) via CAS + serial orchestrator. */
  function patchClip(body: Record<string, unknown>): void {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId()}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...body,
              expectedDocumentVersion: expectedDocumentVersion(),
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (!res.ok || !json.clip || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieZapisac3"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const clip = json.clip;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            if (beforeClip) {
              recordUndo({ undo: clipGeometryOp(beforeClip), redo: clipGeometryOp(clip) });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: prev.clips.map((c) => (c.id === clip.id ? clip : c)),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** P6.7.3 / 7.1.6 — Fade In/Out auto-commit via set_fades + CAS + orchestrator. */
  function saveClipFades(
    fadeInMs: number,
    fadeOutMs: number,
    opts?: { history?: boolean; clipId?: string },
  ) {
    const clipId = opts?.clipId ?? selectedClip?.id;
    if (!clipId) return;
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
      try {
        const body = buildStudioClipFadesPatchBody({
          fadeInMs,
          fadeOutMs,
          expectedDocumentVersion: docRef.current.project.documentVersion,
        });
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        const result = interpretStudioClipFadesPersistResponse(res.status, json);
        if (!result.ok) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: result.message,
            code: json.code,
          });
          if (failure.kind === "conflict") setError(result.message);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        return {
          ok: true as const,
          documentVersion: result.documentVersion,
          apply: () => {
            if (record && beforeClip) {
              recordUndo({
                undo: { kind: "clip_fades", clipId, fadeInMs: beforeClip.fadeInMs, fadeOutMs: beforeClip.fadeOutMs },
                redo: { kind: "clip_fades", clipId, fadeInMs: result.clip.fadeInMs, fadeOutMs: result.clip.fadeOutMs },
              });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion: result.documentVersion,
              },
              clips: prev.clips.map((c) =>
                c.id === result.clip.id ? result.clip : c,
              ),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** V1 / 7.1.6 — Clip Gain auto-commit via CAS + orchestrator. */
  function saveClipGain(
    gainDb: number,
    opts?: { history?: boolean; clipId?: string },
  ) {
    const clipId = opts?.clipId ?? selectedClip?.id;
    if (!clipId) return;
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
      try {
        const body = buildStudioClipGainPatchBody({
          gainDb,
          expectedDocumentVersion: docRef.current.project.documentVersion,
        });
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        const result = interpretStudioClipMixPersistResponse(res.status, json);
        if (!result.ok) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: result.message,
            code: json.code,
          });
          if (failure.kind === "conflict") setError(result.message);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        return {
          ok: true as const,
          documentVersion: result.documentVersion,
          apply: () => {
            if (record && beforeClip) {
              recordUndo({
                undo: { kind: "clip_gain", clipId, gainDb: beforeClip.gainDb },
                redo: { kind: "clip_gain", clipId, gainDb: result.clip.gainDb },
              });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion: result.documentVersion,
              },
              clips: prev.clips.map((c) =>
                c.id === result.clip.id ? result.clip : c,
              ),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** V1 / 7.1.6 — Clip Mute CAS via orchestrator. */
  function saveClipMute(
    muted: boolean,
    opts?: { history?: boolean; clipId?: string },
  ) {
    const clipId = opts?.clipId ?? selectedClip?.id;
    if (!clipId) return;
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
      try {
        const body = buildStudioClipMutePatchBody({
          muted,
          expectedDocumentVersion: docRef.current.project.documentVersion,
        });
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        const result = interpretStudioClipMixPersistResponse(res.status, json);
        if (!result.ok) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: result.message,
            code: json.code,
          });
          if (failure.kind === "conflict") setError(result.message);
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        return {
          ok: true as const,
          documentVersion: result.documentVersion,
          apply: () => {
            if (record && beforeClip) {
              recordUndo({
                undo: { kind: "clip_mute", clipId, muted: beforeClip.muted },
                redo: { kind: "clip_mute", clipId, muted: result.clip.muted },
              });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion: result.documentVersion,
              },
              clips: prev.clips.map((c) =>
                c.id === result.clip.id ? result.clip : c,
              ),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function saveClipPlayback(clipId: string, next: { stretch: number; pitchCents: number }) {
    setError(null);
    enqueuePersist(async () => {
      try {
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              op: "set_playback",
              stretch: next.stretch,
              pitchCents: next.pitchCents,
              expectedDocumentVersion: docRef.current.project.documentVersion,
            }),
          },
        );
        const json = (await res.json()) as {
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (!res.ok || !json.clip || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? "Nie udało się zapisać tempa klipu.",
            code: json.code,
          });
          if (!failure.retryable || failure.kind === "conflict") setError(failure.message);
          return failure;
        }
        const saved = json.clip;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: prev.clips.map((c) => (c.id === saved.id ? saved : c)),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Saved reverse on the selected clip. Reuses scratch CAS. No new column. */
  function saveClipScratch(
    next: { clipId: string; cueMs: number; reverse: boolean; rate: number },
    opts?: { history?: boolean },
  ) {
    const clipId = next.clipId;
    setError(null);
    const record = opts?.history !== false;
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
      try {
        const res = await fetch(
          `/api/studio/projects/${docRef.current.project.id}/clips/${clipId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              op: "set_scratch",
              cueMs: next.cueMs,
              reverse: next.reverse,
              rate: next.rate,
              expectedDocumentVersion: docRef.current.project.documentVersion,
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          clip?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (!res.ok || !json.clip || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieOdwrocic"),
            code: json.code,
          });
          if (failure.kind === "conflict") setError(json.error ?? tr("nieUdaloSieOdwrocic"));
          else if (!failure.retryable) setError(failure.message);
          return failure;
        }
        const saved = json.clip;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            if (record && beforeClip) {
              recordUndo({
                undo: {
                  kind: "clip_scratch",
                  clipId,
                  cueMs: beforeClip.scratchCueMs ?? 0,
                  reverse: Boolean(beforeClip.scratchReverse),
                  rate: beforeClip.scratchRate ?? 1,
                },
                redo: {
                  kind: "clip_scratch",
                  clipId,
                  cueMs: saved.scratchCueMs ?? next.cueMs,
                  reverse: Boolean(saved.scratchReverse),
                  rate: saved.scratchRate ?? next.rate,
                },
              });
            }
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion,
              },
              clips: prev.clips.map((c) => (c.id === saved.id ? saved : c)),
            }));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  function nudgeSelectedBy(deltaMs: number): void {
    if (!selectedClip || recordingLocked || pending) return;
    const next = nudgeClipTimelineStartMs({
      timelineStartMs: selectedClip.timelineStartMs,
      durationMs: selectedClip.durationMs,
      timelineLengthMs: length,
      deltaMs,
    });
    if (next === selectedClip.timelineStartMs) return;
    setMode("edit");
    setFragmentConfirmDelete(false);
    persistClipMove(selectedClip.id, next, { applySnapGrid: false });
  }

  function splitSelectedAtPlayhead(): void {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    setFragmentConfirmDelete(false);
    const atTimelineMs = getPlayheadMs();
    const beforeSplit = committedClip(clipId);
    enqueuePersist(async () => {
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId()}/clips/${clipId}/split`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              atTimelineMs,
              expectedDocumentVersion: expectedDocumentVersion(),
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          left?: StudioClipDto;
          right?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          !json.left ||
          !json.right ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSiePodzielic"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const left = json.left;
        const right = json.right;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: [
                ...prev.clips.map((c) => (c.id === left.id ? left : c)),
                right,
              ].sort((a, b) => a.timelineStartMs - b.timelineStartMs),
            }));
            setSelectedClipId(selectClipId(null, left.id));
            if (beforeSplit) {
              recordUndo({
                undo: { kind: "clip_unsplit", leftId: left.id, rightId: right.id, original: beforeSplit },
                redo: { kind: "clip_split", clipId: left.id, atTimelineMs, rightId: right.id },
              });
            }
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return Boolean(target.closest("input, textarea, select, [contenteditable=true]"));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      // Transport keys — mode from localStorage (quick_rec vs standard_daw).
      // Record must work while recordingLocked so Space/R can stop an in-progress take.
      const transportAction = resolveStudioTransportKeyAction({
        mode: transportKeyboardModeRef.current,
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      });
      if (transportAction === "record") {
        if (pending) return;
        event.preventDefault();
        setInspectorPreferRecord(true);
        openInspectorOverlay();
        setTransportRecordRequest((n) => n + 1);
        return;
      }
      if (transportAction === "play") {
        if (recordingLocked || pending) return;
        event.preventDefault();
        if (transport.phase === "playing") transport.pause();
        else transport.play();
        return;
      }

      if (recordingLocked || pending) return;

      // Stage 0 — Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.
      const undoAction = studioUndoShortcut(event);
      if (undoAction) {
        event.preventDefault();
        if (undoAction === "undo") undoStudioEdit();
        else redoStudioEdit();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        transport.seek(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        transport.seek(length);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!selectedClip) return;
        event.preventDefault();
        const sign = event.key === "ArrowLeft" ? -1 : 1;
        const step = resolveNudgeStepMs({
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        });
        nudgeSelectedBy(sign * step);
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (!selectedClip) return;
        event.preventDefault();
        deleteSelectedClip();
        return;
      }

      if (
        (event.key === "s" || event.key === "S") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (!selectedClip) return;
        event.preventDefault();
        splitSelectedAtPlayhead();
        return;
      }

      if (event.key === "=" || event.key === "+") {
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        zoomAtViewportCenter(zoomInPxPerMs(pxPerMsRef.current));
        return;
      }
      if (event.key === "-" || event.key === "_") {
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        zoomAtViewportCenter(zoomOutPxPerMs(pxPerMsRef.current));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Intentional: handlers close over latest selected clip / length / pending / transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Phase 2 keyboard precision + 7.1.5.3
  }, [recordingLocked, pending, selectedClip, length, transport]);

  function deleteSelectedClip(): void {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    const beforeDelete = committedClip(clipId);
    enqueuePersist(async () => {
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId()}/clips/${clipId}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: expectedDocumentVersion(),
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          deletedClipId?: string;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          !json.deletedClipId ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSieUsunac2"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const deletedClipId = json.deletedClipId;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: prev.clips.filter((c) => c.id !== deletedClipId),
            }));
            setSelectedClipId(clearClipSelection());
            if (beforeDelete) {
              recordUndo({
                undo: { kind: "clip_restore", clip: beforeDelete },
                redo: { kind: "clip_remove", clipId: beforeDelete.id },
              });
            }
            setConfirmDelete(false);
            setFragmentConfirmDelete(false);
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** V1 / 7.1.6 — Duplicate Clip via CAS + serial orchestrator. */
  function duplicateSelectedClip(): void {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    enqueuePersist(async () => {
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId()}/clips/${clipId}/duplicate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDocumentVersion: expectedDocumentVersion(),
            }),
          },
        );
        const json = (await res.json()) as {
          success?: boolean;
          original?: StudioClipDto;
          duplicate?: StudioClipDto;
          documentVersion?: number;
          error?: string;
          code?: string;
        };
        if (
          !res.ok ||
          !json.original ||
          !json.duplicate ||
          typeof json.documentVersion !== "number"
        ) {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? tr("nieUdaloSiePowielic"),
            code: json.code,
          });
          if (failure.kind === "conflict") {
            setError(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
          } else if (!failure.retryable) {
            setError(failure.message);
          }
          return failure;
        }
        const original = json.original;
        const duplicate = json.duplicate;
        const documentVersion = json.documentVersion;
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: [
                ...prev.clips.map((c) =>
                  c.id === original.id ? original : c,
                ),
                duplicate,
              ].sort((a, b) => a.timelineStartMs - b.timelineStartMs),
            }));
            setSelectedClipId(selectClipId(null, duplicate.id));
            recordUndo({
              undo: { kind: "clip_remove", clipId: duplicate.id },
              redo: { kind: "clip_duplicate", sourceClipId: original.id, duplicateId: duplicate.id },
            });
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  const conflictActive =
    persistSnap?.conflict === true ||
    (Boolean(error) &&
      (error!.includes("zmieniony") || error === FX_CHAIN_CONFLICT_UI_PL));

  const saveStatusLabel = conflictActive
    ? (error ?? persistSnap?.lastError ?? FX_CHAIN_CONFLICT_UI_PL)
    : persistSnap?.status === "SAVE_FAILED"
      ? (persistSnap.lastError ?? tr("nieZapisano"))
      : persistSnap && persistSnap.label !== "Gotowe"
        ? persistSnap.label
        : pending
          ? tr("zapisywanie")
          : status
            ? status
            : tr("wszystkoZapisane");

  const clipEditHandlers = {
    onClearSelection: () => {
      setSelectedClipId(clearClipSelection());
      setConfirmDelete(false);
    },
    onSaveFades: (fadeInMs: number, fadeOutMs: number) => {
      saveClipFades(fadeInMs, fadeOutMs);
    },
    onSaveGain: (gainDb: number) => {
      saveClipGain(gainDb);
    },
    onFlushPersist: () => {
      void flushPersist();
    },
    onMarkDirty: () => {
      persistRef.current?.markDirty();
    },
    onSaveMute: (muted: boolean) => {
      saveClipMute(muted);
    },
    onMove: (timelineStartMs: number) => {
      const maxStart = selectedClip
        ? Math.max(0, length - selectedClip.durationMs)
        : 0;
      patchClip({
        op: "move",
        timelineStartMs: applySnap(timelineStartMs, {
          minMs: 0,
          maxMs: maxStart,
        }),
      });
    },
    onTrimLeftToPlayhead: () => {
      const playheadMs = getPlayheadMs();
      if (!playheadInsideClip(selectedClip, playheadMs)) {
        setStatus(tl("Ustaw głowicę wewnątrz zaznaczonego fragmentu, aby przyciąć początek."));
        return;
      }
      patchClip({ op: "trim_left_to_playhead", playheadMs });
    },
    onTrimRightToPlayhead: () => {
      const playheadMs = getPlayheadMs();
      if (!playheadInsideClip(selectedClip, playheadMs)) {
        setStatus(tl("Ustaw głowicę wewnątrz zaznaczonego fragmentu, aby przyciąć koniec."));
        return;
      }
      patchClip({ op: "trim_right_to_playhead", playheadMs });
    },
    onSplit: () => {
      splitSelectedAtPlayhead();
    },
  };

  const inspectorContent = (
    <div
      className="min-h-0 flex-1 space-y-2 overflow-y-auto"
      data-testid="studio-inspector-content"
      data-inspector-context={inspectorContext}
    >
      <div
        role="tablist"
        aria-label={tr("inspector")}
        data-testid="studio-inspector-visual-tabs"
        hidden={recordSimple}
        className={`${recordSimple ? "hidden" : "grid"} grid-cols-4 gap-1 border-b border-[var(--brd-line)] pb-2`}
      >
        {(
          [
            {
              id: "settings",
              label: tr("tabSettings"),
              active:
                inspectorContext === "track" || inspectorContext === "empty",
              onClick: () => {
                setInspectorPreferRecord(false);
                setConfirmDelete(false);
                openInspectorOverlay();
              },
            },
            {
              id: "effects",
              label: tr("tabEffects"),
              active: false,
              onClick: () => {
                setInspectorPreferRecord(false);
                if (selectedTrack) {
                  setFxPanel({ role: "track", trackId: selectedTrack.id });
                } else {
                  setFxPanel({ role: "master" });
                }
              },
            },
            {
              id: "file",
              label: tr("tabFile"),
              active: inspectorContext === "clip",
              onClick: () => {
                setInspectorPreferRecord(false);
                setConfirmDelete(false);
                openInspectorOverlay();
              },
            },
            {
              id: "record",
              label: tr("tabRecord"),
              active: inspectorContext === "record",
              onClick: () => {
                setInspectorPreferRecord(true);
                openInspectorOverlay();
              },
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.active}
            data-testid={`studio-inspector-tab-${tab.id}`}
            className={`min-h-11 rounded border px-1 text-[10px] font-medium uppercase tracking-[0.08em] ${
              tab.active
                ? "border-[var(--brd-green)] bg-[color-mix(in_srgb,var(--brd-bg)_80%,var(--brd-green)_20%)] text-[var(--brd-ink)]"
                : "border-[var(--brd-line)] bg-[var(--brd-paper)] text-[var(--brd-mute)]"
            }`}
            onClick={tab.onClick}
          >
            {tl(tab.label)}
          </button>
        ))}
      </div>
      {recordSimple ? null : (
        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          {tInspector(inspectorContext)}
        </p>
      )}

      {inspectorContext === "record" ? (
        <StudioRecordingPanel
          projectId={doc.project.id}
          getExpectedDocumentVersion={expectedDocumentVersion}
          enqueuePersistAsync={enqueuePersistAsync}
          onDocumentVersionAck={applyAckedDocumentVersion}
          recordRequest={transportRecordRequest}
          onRecordRequestHandled={() => setTransportRecordRequest(0)}
          tracks={doc.tracks}
          embedded={!recordSimple}
          simple={recordSimple}
          planLimits={{
            sessionsPerDay: PLAN_POLICY[trackCapacity.premiumTier].recording.sessionsPerDay,
            retentionDays: PLAN_POLICY[trackCapacity.premiumTier].retentionDays,
          }}
          samplesMode={onSampleTab}
          stemLimit={maxStemsForTier(trackCapacity.premiumTier)}
          trackLimit={maxTracks}
          onSaveTrackMidi={saveTrackMidi}
          preferredTrackId={activeSelectedTrackId}
          lastScratchClipId={lastScratchClipId}
          onLastScratchClipIdChange={setLastScratchClipId}
          onRecordingActiveChange={(active) => {
            setRecordingLocked(active);
            setInspectorPreferRecord((prev) =>
              studioPreferRecordAfterCaptureReport(prev, active),
            );
            if (active) {
              setMode("seek");
              setSelectedClipId(clearClipSelection());
              setConfirmDelete(false);
              setCaptureInterruptedNotice(null);
            } else {
              setInspectorCloseRejected(false);
            }
            if (active) setInspectorPreferRecord(true);
          }}
          onCaptureInterrupted={(message) => {
            transport.pause();
            setCaptureInterruptedNotice(message);
          }}
          onLocalRecoveryChanged={() => setRecoveryRefreshKey((key) => key + 1)}
          recoverySavedKey={recoverySavedKey}
          onBitekBubble={setRecToolsBubble}
          onDocumentReplaced={(next) => {
            // Comp apply = several server CAS ops → fresh document, no partial undo.
            applyPersistedDoc(() => next);
            undoHistoryRef.current = EMPTY_STUDIO_UNDO_HISTORY;
            setUndoHistory(EMPTY_STUDIO_UNDO_HISTORY);
            undoAliasRef.current = new Map();
          }}
          onClipCreated={(clip, nextDocumentVersion, options) => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion: nextDocumentVersion,
              },
              clips: [...prev.clips, clip].sort(
                (a, b) => a.timelineStartMs - b.timelineStartMs,
              ),
            }));
            recordUndo({
              undo: { kind: "clip_remove", clipId: clip.id },
              redo: { kind: "clip_restore", clip },
            });
            if (options?.keepRecordPanel) {
              setInspectorPreferRecord(
                studioPreferRecordAfterClipCreated({ keepRecordPanel: true }),
              );
              setLastScratchClipId(clip.id);
              return;
            }
            setInspectorPreferRecord(false);
            setSelectedClipId(selectClipId(null, clip.id));
            setSelectedTrackId(clip.trackId);
            setStatus(tr("nagranieDodaneNaOs"));
          }}
          onTrackCreated={(track, nextDocumentVersion) => {
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion: nextDocumentVersion,
              },
              tracks: [...prev.tracks, track].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              ),
            }));
          }}
        />
      ) : null}

      {inspectorContext === "track" && selectedTrack ? (
        <TrackInspectorPanel
          track={selectedTrack}
          trackCount={trackCount}
          maxTracks={maxTracks}
          onOpenEffects={() =>
            setFxPanel({ role: "track", trackId: selectedTrack.id })
          }
          onOpenRecord={() => {
            setInspectorPreferRecord(true);
            openInspectorOverlay();
          }}
        />
      ) : null}

      {inspectorContext === "clip" ? (
        <ClipEditPanelPlayheadBound
          clip={selectedClip}
          timelineLengthMs={length}
          pending={pending}
          confirmDelete={confirmDelete}
          onConfirmDeleteChange={setConfirmDelete}
          {...clipEditHandlers}
          onDuplicate={() => {
            duplicateSelectedClip();
          }}
          onDelete={() => {
            deleteSelectedClip();
          }}
        />
      ) : null}

      {inspectorContext === "empty" ? (
        <div
          className="space-y-3 rounded border border-dashed border-[var(--brd-line)] p-3"
          data-testid="studio-inspector-empty"
        >
          <p className="text-sm text-[var(--brd-mute)]">
            {tr("wybierzSciezkeLubKlip")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 w-full"
            disabled={recordingLocked}
            onClick={() => {
              setInspectorPreferRecord(true);
              openInspectorOverlay();
            }}
          >
            {tr("nagraj")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  /** Phase 7.1.4 — shared Mixer strips (mounted once: desktop dock XOR <xl overlay). */
  const mixerChannels = (
    <ul
      className="flex items-stretch gap-2 overflow-x-auto pb-1"
      data-testid="studio-mixer-drawer"
      data-studio-mixer="channels"
      aria-label={tr("mix")}
    >
      <li
        data-testid="studio-mix-master"
        className="studio-channel studio-channel-master sticky left-0 z-[1] flex w-[7.5rem] shrink-0 flex-col p-2"
      >
        <p className="studio-scribble truncate text-xs font-semibold">{tr("master")}</p>
        <p className="mb-1 mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--brd-mute)]">
          {tr("out")}
        </p>
        <StudioMixControl
          label={tr("level")}
          ariaLabel={tr("glosnoscMaster")}
          value={doc.project.masterGainDb}
          display={tr("db", { v0: doc.project.masterGainDb.toFixed(1) })}
          min={STUDIO_MASTER_GAIN_DB_MIN}
          max={STUDIO_MASTER_GAIN_DB_MAX}
          step={0.5}
          orientation="vertical"
          disabled={pending}
          onLocalChange={(masterGainDb) =>
            setDoc((prev) => ({
              ...prev,
              project: { ...prev.project, masterGainDb },
            }))
          }
          onCommit={(masterGainDb) => {
            patchMasterMix({ masterGainDb });
          }}
        />
        <StudioMixControl
          label={tr("pan")}
          ariaLabel={tr("panoramaMaster")}
          value={doc.project.masterPan}
          display={doc.project.masterPan.toFixed(2)}
          min={-1}
          max={1}
          step={0.01}
          compact
          disabled={pending}
          onLocalChange={(masterPan) =>
            setDoc((prev) => ({
              ...prev,
              project: { ...prev.project, masterPan },
            }))
          }
          onCommit={(masterPan) => {
            patchMasterMix({ masterPan });
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="mt-auto min-h-11 w-full truncate px-1 text-[10px]"
          aria-label={tr("efektyMaster")}
          onClick={() => setFxPanel({ role: "master" })}
        >
          {tl(studioFxEntryLabel(doc.project.masterFxChain))}
        </Button>
        {/* Visual Parity V2 — Master strip order: Level · Pan · FX · meter */}
        <StudioMasterMeterLive />
      </li>
      {doc.tracks.map((track) => {
        const audible = isTrackAudible({
          muted: track.muted,
          solo: track.solo,
          anySolo,
        });
        const isBeat = track.trackType === "BEAT";
        const fxLabel = studioFxEntryLabel(track.effectsChain);
        const isSelected = activeSelectedTrackId === track.id;
        return (
          <li
            key={track.id}
            data-testid="studio-mix-track"
            data-track-id={track.id}
            data-selected={isSelected ? "true" : "false"}
            className={
              isSelected
                ? "studio-channel flex w-[7.5rem] shrink-0 flex-col p-2"
                : "studio-channel flex w-[7.5rem] shrink-0 flex-col p-2"
            }
          >
            <button
              type="button"
              className="mb-1 min-h-11 w-full rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
              aria-pressed={isSelected}
              aria-label={
                tl(isSelected
                  ? tr("odznaczSciezke", { v0: track.name })
                  : tr("wybierzSciezke", { v0: track.name }))
              }
              data-testid="studio-mix-track-select"
              onClick={() =>
                setSelectedTrackId(isSelected ? null : track.id)
              }
            >
              <p className="studio-scribble truncate text-xs font-medium">
                {tl(track.name)}
              </p>
              <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--brd-mute)]">
                {tl(isBeat ? labelStudioTrackType("BEAT") : labelStudioTrackType(track.trackType))}
                {tl(!audible ? " · M" : "")}
                {tl(isSelected ? tr("meter") : "")}
              </p>
            </button>
            {isSelected ? (
              <StudioTrackMeterLive trackName={track.name} />
            ) : (
              <div
                className="studio-vu-idle mb-1 h-8"
                aria-hidden
              />
            )}
            <StudioMixControl
              label={tr("level")}
              ariaLabel={tr("glosnoscSciezki", { v0: track.name })}
              value={track.gainDb}
              display={tr("db", { v0: track.gainDb.toFixed(1) })}
              min={STUDIO_TRACK_GAIN_DB_MIN}
              max={STUDIO_TRACK_GAIN_DB_MAX}
              step={0.5}
              orientation="vertical"
              disabled={pending}
              onLocalChange={(gainDb) =>
                setDoc((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === track.id ? { ...t, gainDb } : t,
                  ),
                }))
              }
              onCommit={(gainDb) => {
                patchTrack(track.id, { gainDb });
              }}
            />
            <StudioMixControl
              label={tr("pan")}
              ariaLabel={tr("panoramaSciezki", { v0: track.name })}
              value={track.pan}
              display={track.pan.toFixed(2)}
              min={-1}
              max={1}
              step={0.01}
              compact
              disabled={pending}
              onLocalChange={(pan) =>
                setDoc((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === track.id ? { ...t, pan } : t,
                  ),
                }))
              }
              onCommit={(pan) => {
                patchTrack(track.id, { pan });
              }}
            />
            <div
              className="mt-1 flex justify-center gap-0.5"
              data-testid="studio-mix-track-msr"
            >
              <StudioToggleChip
                active={track.muted}
                label="M"
                title={tr("wycisz")}
                tone="mute"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => {
                  patchTrack(track.id, { muted: !track.muted });
                }}
              />
              <StudioToggleChip
                active={track.solo}
                label="S"
                title={tr("solo")}
                tone="solo"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => {
                  patchTrack(track.id, { solo: !track.solo });
                }}
              />
              <StudioToggleChip
                active={track.recordArmed}
                label="R"
                title={tr("uzbrojenieNagrywania")}
                tone="record"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => {
                  patchTrack(track.id, {
                    recordArmed: !track.recordArmed,
                  });
                }}
              />
            </div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="mt-auto min-h-11 w-full truncate px-1 text-[10px]"
              aria-label={tr("efektySciezki", { v0: track.name })}
              title={tl(fxLabel)}
              onClick={() => {
                setSelectedTrackId(track.id);
                setFxPanel({ role: "track", trackId: track.id });
              }}
            >
              {tl(fxLabel)}
            </Button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      ref={studioShellRef}
      data-testid="studio-daw-shell"
      data-studio-shell="true"
      data-studio-visual-parity="v2"
      data-record-view={studioStep === "record" ? (recordSimple ? "simple" : "full") : undefined}
      data-studio-tab={onSampleTab ? "samples" : studioStep}
      className="studio-desk flex min-h-[calc(100dvh-7rem)] flex-col gap-0.5 overflow-x-clip max-lg:pb-[var(--bitek-dock-h,0px)] max-sm:pb-[max(var(--bitek-dock-h,0px),5rem)]"
    >
      <header
        data-testid="studio-header"
        className="studio-brand-bar flex min-h-11 flex-wrap items-end gap-x-3 gap-y-1 pb-1"
      >
        <span className="studio-brand">BitRymDym</span>
        <span className="studio-kicker">{tr("studioOnline")}</span>
        <h1 className="min-w-0 flex-1 truncate text-sm leading-none text-[var(--brd-mute)]">
          {tl(doc.project.title)}
        </h1>
      </header>
      <div className="flex flex-wrap items-center gap-2 px-0.5 py-1">
        <span className="studio-gear-label">BIT</span>
        <button
          type="button"
          className="studio-bit-picker min-h-11 max-w-full truncate px-2 text-sm"
          title={tr("zmienBit")}
          onClick={() => setBeatPickerOpen(true)}
        >
          {doc.project.beatId
            ? tl(beatTitle || doc.tracks.find((t) => t.trackType === "BEAT")?.name || tr("zmienBit"))
            : tr("wybierzBit")}{" "}
          ▾
        </button>
      </div>

      <StudioStepNav
        studioStep={studioStep}
        onSampleTab={onSampleTab}
        recordingLocked={recordingLocked}
        canGoMix={canGoMix}
        songReady={autoMixMasterMaterial({ beatId: doc.project.beatId, tracks: doc.tracks, clips: doc.clips }).ready}
        advancedRecord={advancedRecord}
        recordFullView={recordFullView}
        onRecord={() => setSampleTab(false)}
        onSamples={() => {
          if (studioStep !== "record") setStudioStep("record");
          setSampleTab(true);
        }}
        onMix={() => {
          setSampleTab(false);
          setStudioStep("mix");
        }}
        onToggleFullView={() => {
          const next = !recordFullView;
          setRecordFullView(next);
          if (next) {
            setInspectorPreferRecord(true);
            if (!inspectorDesktopRail) openInspectorOverlay();
          } else {
            setFxPanel(null);
          }
        }}
      />

      <StudioTransportBar
        projectId={doc.project.id}
        trackNames={Object.fromEntries(doc.tracks.map((t) => [t.id, t.name]))}
        tipDocumentVersion={doc.project.documentVersion}
        getExpectedDocumentVersion={expectedDocumentVersion}
        onDocumentRefreshed={(next) => {
          applyPersistedDoc(() => next);
          undoHistoryRef.current = EMPTY_STUDIO_UNDO_HISTORY;
          setUndoHistory(EMPTY_STUDIO_UNDO_HISTORY);
          undoAliasRef.current = new Map();
          setError(null);
        }}
        onChooseBeat={() => setBeatPickerOpen(true)}
        onRecord={() => {
          setInspectorPreferRecord(true);
          openInspectorOverlay();
          setTransportRecordRequest((n) => n + 1);
        }}
        transportKeyboardMode={transportKeyboardMode}
        onTransportKeyboardModeChange={(mode) => {
          setStudioTransportKeyboardModeLive(mode);
        }}
        tempoBpm={doc.project.tempoBpm}
        timeSignatureNum={doc.project.timeSignatureNum}
        timeSignatureDen={doc.project.timeSignatureDen}
        durationMs={length}
        masterGainDb={doc.project.masterGainDb}
        pending={pending}
        saveStatusLabel={saveStatusLabel}
        saveIsError={Boolean(error) || persistSnap.status === "SAVE_FAILED"}
        conflictActive={conflictActive}
        onMasterGainLocal={(masterGainDb) =>
          setDoc((prev) => ({
            ...prev,
            project: { ...prev.project, masterGainDb },
          }))
        }
        onMasterGainCommit={(masterGainDb) => {
          patchMasterMix({ masterGainDb });
        }}
        canUndo={undoHistory.past.length > 0 && !recordingLocked}
        canRedo={undoHistory.future.length > 0 && !recordingLocked}
        showFragmentTools={studioStep === "record"}
        fragmentEnabled={Boolean(selectedClip) && !recordingLocked}
        fragmentConfirmDelete={fragmentConfirmDelete}
        onFragmentSplit={() => {
          setMode("edit");
          splitSelectedAtPlayhead();
        }}
        onFragmentTrimStart={() => {
          setFragmentConfirmDelete(false);
          setMode("edit");
          clipEditHandlers.onTrimLeftToPlayhead();
        }}
        onFragmentTrimEnd={() => {
          setFragmentConfirmDelete(false);
          setMode("edit");
          clipEditHandlers.onTrimRightToPlayhead();
        }}
        onFragmentNudge={(direction) => {
          nudgeSelectedBy(direction * beatDurationMs(doc.project.tempoBpm, doc.project.timeSignatureDen));
        }}
        onFragmentDuplicate={() => {
          setFragmentConfirmDelete(false);
          setMode("edit");
          duplicateSelectedClip();
        }}
        onFragmentFade={(edge) => {
          if (!selectedClip) return;
          const next = fadeEdgePreset(selectedClip.durationMs, edge, selectedClip);
          saveClipFades(next.fadeInMs, next.fadeOutMs);
        }}
        fragmentReverseOn={Boolean(selectedClip?.scratchReverse)}
        onFragmentReverse={() => {
          if (!selectedClip) return;
          setFragmentConfirmDelete(false);
          saveClipScratch({
            clipId: selectedClip.id,
            cueMs: selectedClip.scratchCueMs ?? 0,
            reverse: !selectedClip.scratchReverse,
            rate: selectedClip.scratchRate ?? 1,
          });
        }}
        fragmentStretch={selectedClip?.stretchRatio ?? 1}
        fragmentPitchCents={selectedClip?.pitchCents ?? 0}
        fragmentPitchLocked={!clipPitchForTier(trackCapacity.premiumTier)}
        onFragmentPlayback={(next) => {
          if (!selectedClip) return;
          saveClipPlayback(selectedClip.id, next);
        }}
        fragmentGainDb={selectedClip?.gainDb ?? 0}
        onFragmentGain={(gainDb) => {
          if (!selectedClip) return;
          saveClipGain(gainDb);
        }}
        onFragmentAskDelete={() => setFragmentConfirmDelete(true)}
        onFragmentDelete={() => {
          deleteSelectedClip();
          setFragmentConfirmDelete(false);
        }}
        onFragmentCancelDelete={() => setFragmentConfirmDelete(false)}
        onUndo={undoStudioEdit}
        onRedo={redoStudioEdit}
        selectionStartMs={selectedClip ? selectedClip.timelineStartMs : null}
        selectionEndMs={
          selectedClip ? selectedClip.timelineStartMs + selectedClip.durationMs : null
        }
      />

      {selectedClip ? (
        <StudioClipSpectrogram
          clipId={selectedClip.id}
          projectId={doc.project.id}
          takeId={selectedClip.sourceKind === "TAKE" ? selectedClip.sourceTakeId : null}
          resolveUrl={() => resolveClipSourceUrl(selectedClip)}
        />
      ) : null}

      <StudioBeatPicker
        projectId={doc.project.id}
        open={beatPickerOpen}
        onClose={() => setBeatPickerOpen(false)}
        getExpectedDocumentVersion={expectedDocumentVersion}
        enqueuePersistAsync={enqueuePersistAsync}
        onAttached={(document, beat) => {
          onBeatTitle(beat.title.trim() || null);
          applyPersistedDoc(() => document);
          setStatus(tr("bitPowiazanyZProjektem"));
          setError(null);
        }}
      />

      {trackMenuTrack && trackMenuTrack.trackType !== "BEAT" ? (
        <div
          role="menu"
          data-testid="studio-track-menu-panel"
          className="flex flex-wrap items-center gap-2 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 shadow-sm"
        >
          <span className="px-1 text-xs text-[var(--brd-mute)]">
            {tl(trackMenuTrack.name)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-duplicate"
            disabled={recordingLocked || pending || atTrackCapacity}
            title={
              tl(atTrackCapacity
                ? tr("osiagnietoLimitSciezek2")
                : tr("duplikujSciezke"))
            }
            onClick={() => {
              duplicateTrack(trackMenuTrack.id);
            }}
          >
            {tr("duplikuj")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-vocal-double"
            disabled={recordingLocked || pending || atTrackCapacity}
            title={tr("dubelOpis")}
            onClick={() => {
              duplicateTrack(trackMenuTrack.id, { asVocalDouble: true });
            }}
          >
            {tr("dubel")}
          </Button>
          {studioAdvancedRecordAllowed(trackCapacity.premiumTier) ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                role="menuitem"
                data-testid="studio-track-automation-gain"
                disabled={recordingLocked || pending}
                onClick={() => {
                  setAutomationEdit({ trackId: trackMenuTrack.id, param: "gainDb" });
                  setTrackMenuId(null);
                }}
              >
                {tr("automatykaGlosnosc")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                role="menuitem"
                data-testid="studio-track-automation-pan"
                disabled={recordingLocked || pending}
                onClick={() => {
                  setAutomationEdit({ trackId: trackMenuTrack.id, param: "pan" });
                  setTrackMenuId(null);
                }}
              >
                {tr("automatykaPan")}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-midi-phrase"
            disabled={recordingLocked || pending || hasMidi(trackMenuTrack.midi)}
            title={tr("melodiaOpis")}
            onClick={() => {
              if (hasMidi(trackMenuTrack.midi)) return;
              saveTrackMidi(trackMenuTrack.id, midiPhraseAt(playheadMs));
              setTrackMenuId(null);
            }}
          >
            {tr("melodia")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-midi-bass"
            disabled={recordingLocked || pending || hasMidi(trackMenuTrack.midi)}
            title={tr("basOpis")}
            onClick={() => {
              if (hasMidi(trackMenuTrack.midi)) return;
              saveTrackMidi(trackMenuTrack.id, bassLineAt(playheadMs, doc.project.tempoBpm));
              setTrackMenuId(null);
            }}
          >
            {tr("bas")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-midi-drums"
            disabled={recordingLocked || pending || hasMidi(trackMenuTrack.midi)}
            title={tr("perkusjaOpis")}
            onClick={() => {
              if (hasMidi(trackMenuTrack.midi)) return;
              saveTrackMidi(trackMenuTrack.id, drumPatternAt(playheadMs, doc.project.tempoBpm));
              setTrackMenuId(null);
            }}
          >
            {tr("perkusja")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-midi-clear"
            disabled={recordingLocked || pending || !hasMidi(trackMenuTrack.midi)}
            onClick={() => {
              saveTrackMidi(trackMenuTrack.id, emptyMidi());
              setTrackMenuId(null);
            }}
          >
            {tr("usunNuty")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            role="menuitem"
            data-testid="studio-track-delete"
            disabled={recordingLocked || pending}
            onClick={() => {
              setConfirmDeleteTrackId(trackMenuTrack.id);
              setTrackMenuId(null);
            }}
          >
            {tr("usun")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => setTrackMenuId(null)}
          >
            {tr("anuluj")}
          </Button>
        </div>
      ) : null}

      {trackPendingDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-delete-track-title"
          data-testid="studio-delete-track-confirm"
          className="rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 shadow-sm"
        >
          <p
            id="studio-delete-track-title"
            className="text-sm font-medium text-[var(--brd-ink)]"
          >
            {tr("usunacSciezke")}{" "}{tl(trackPendingDelete.name)}?
          </p>
          <p className="mt-1 text-xs text-[var(--brd-mute)]">
            {tr("sciezkaIJejKlipy")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => setConfirmDeleteTrackId(null)}
            >
              {tr("anuluj")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="min-h-11"
              data-testid="studio-delete-track-confirm-btn"
              disabled={recordingLocked || pending}
              onClick={() => {
                deleteTrack(trackPendingDelete.id);
              }}
            >
              {tr("usun")}
            </Button>
          </div>
        </div>
      ) : null}

      {recordingLocked ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          {tr("trybNagrywaniaEdycjaKlipow")}
        </p>
      ) : null}
      {captureInterruptedNotice ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {tl(captureInterruptedNotice)}
        </p>
      ) : null}

      <StudioLeaveGuardDialog
        open={leaveGuard.open}
        onStay={leaveGuard.stay}
        onLeave={leaveGuard.leave}
      />

      <TakeRecordingRecoveryBanner
        surface="STUDIO"
        scopeId={doc.project.id}
        authenticated
        refreshKey={recoveryRefreshKey}
        hidden={recordingLocked}
        onSaved={() => setRecoverySavedKey((key) => key + 1)}
      />

      <StudioBitekDock
        bubble={bitekBubble}
        mood={bitekChatBusy ? "thinking" : (bitekBubble?.mood ?? "happy")}
        minimized={bitekBubbleState.minimized}
        dismissedKey={bitekBubbleState.dismissedKey}
        onMinimizedChange={(minimized) => saveBitekBubbleState({ ...bitekBubbleState, minimized })}
        onDismiss={(key) => saveBitekBubbleState({ minimized: false, dismissedKey: key })}
        chatOpen={bitekChatOpen}
        onChatOpenChange={setBitekChatOpen}
        recording={recordingLocked}
        recordContext={studioStep === "record" || recordingContextActive}
        inspectorSheetOpen={inspectorOverlayOpen && !inspectorDesktopRail}
        chat={
          <StudioBitekChat
            projectId={doc.project.id}
            getContext={() =>
              studioStep === "master" && masterChatContextRef.current
                ? masterChatContextRef.current()
                : studioStep === "mix" && mixChatContextRef.current
                  ? mixChatContextRef.current()
                  : getRecordChatContext()
            }
            onApplyProposal={applyBitekProposal}
            onApplyFxOps={async (ops, description) => (await applyMixAutofix(ops, description)).ok}
            onApplyMasterProposal={(key, value) => masterApplyRef.current?.(key, value)}
            onBackToMix={studioStep === "master" ? () => {
              setSampleTab(false);
              setStudioStep("mix");
            } : undefined}
            disabled={recordingLocked || pending}
            store={bitekStore}
            onBusyChange={setBitekChatBusy}
          />
        }
      />

      {studioStep === "master" ? (
        <StudioMasterStep
          doc={doc}
          resolveClipSourceUrl={resolveClipSourceUrl}
          onBackToMix={() => {
            setSampleTab(false);
            setStudioStep("mix");
          }}
          onBitekBubble={setMasterBubble}
          chatContextRef={masterChatContextRef}
          applyRef={masterApplyRef}
          onCommitMasterSession={commitMasterSession}
          sessionRef={masterSessionRef}
          autoPipeline={autoOn}
        />
      ) : studioStep === "mix" ? (
        <StudioMixStep
          onGoMaster={() => {
            setSampleTab(false);
            setStudioStep("master");
          }}
          onListen={() => transport.play()}
          autoEnabled={autoOn}
          autoToggle={autoMixMasterAllowed ? { enabled: autoOn, onChange: writeBitekAutoMixMaster } : null}
          maxEffects={maxFxEffectsForTier(trackCapacity.premiumTier)}
          allowSidechain={sidechainForTier(trackCapacity.premiumTier)}
          doc={doc}
          resolveClipSourceUrl={resolveClipSourceUrl}
          onBack={() => {
            setSampleTab(false);
            setStudioStep("record");
          }}
          bitekBase={bitekBase}
          onApplyAutofix={applyMixAutofix}
          onAbOverride={onMixAbOverride}
          onBitekBubble={setMixBubble}
          onBitekNote={(content: string, meta: Record<string, unknown>) => bitekStore.append([{ kind: "fix", content, meta }])}
          chatContextRef={mixChatContextRef}
        />
      ) : (
        <>
      {recordSimple ? (
        <div data-testid="studio-record-simple" className="flex flex-col gap-2">
          {inspectorContent}
          {selectedClip && !recordingLocked ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="studio-record-simple-clip">
              {confirmDelete ? (
                <>
                  <p className="text-sm text-[var(--brd-ink)]">{tMix("usunNagraniePytanie")}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 px-3"
                    disabled={pending}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {tr("anuluj")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="min-h-11 px-3"
                    data-testid="studio-record-simple-delete"
                    disabled={pending}
                    onClick={() => {
                      deleteSelectedClip();
                      setConfirmDelete(false);
                    }}
                  >
                    {tr("usun")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 px-3"
                  disabled={pending}
                  onClick={() => setConfirmDelete(true)}
                >
                  {tMix("usunNagranie")}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : (
      <StudioEditToolbar
        timelineMode={timelineMode}
        recordingLocked={recordingLocked}
        pending={pending}
        hasSelectedClip={Boolean(selectedClip)}
        atTrackCapacity={atTrackCapacity}
        showUpgradeCta={showUpgradeCta}
        trackCount={trackCount}
        maxTracks={maxTracks}
        premiumTier={trackCapacity.premiumTier}
        inspectorOverlayOpen={inspectorOverlayOpen}
        inspectorPanelId={inspectorPanelId}
        mixerOpen={mixerOpen}
        mixerPanelId={mixerPanelId}
        snapPreset={snapPreset}
        showClipMutations={studioStep !== "record"}
        onSeekMode={() => setMode("seek")}
        onEditMode={() => setMode("edit")}
        onSplit={() => {
          splitSelectedAtPlayhead();
        }}
        onDeleteClip={() => {
          setInspectorPreferRecord(false);
          setConfirmDelete(true);
          openInspectorOverlay();
        }}
        onAddTrack={() => {
          addTrack();
        }}
        onToggleInspector={() => {
          if (inspectorOverlayOpen) closeInspectorOverlay();
          else openInspectorOverlay();
        }}
        onToggleMixer={toggleMixerSurface}
        onSnapCycle={() => setSnapConfig((prev) => cycleStudioSnapConfig(prev))}
        onZoomOut={() => {
          userAdjustedZoomRef.current = true;
          zoomAtViewportCenter(zoomOutPxPerMs(pxPerMsRef.current));
        }}
        onZoomIn={() => {
          userAdjustedZoomRef.current = true;
          zoomAtViewportCenter(zoomInPxPerMs(pxPerMsRef.current));
        }}
        onFit={() => {
          userAdjustedZoomRef.current = false;
          const el = timelineScrollRef.current;
          const viewport = el?.clientWidth;
          zoomAtViewportCenter(
            fitPxPerMs(
              studioTimelineFitLengthMs(length, doc.clips),
              typeof viewport === "number" && viewport > 0 ? viewport : 360,
            ),
          );
        }}
      />
      )}

      <div className="flex min-h-0 flex-col gap-3 xl:flex-row xl:items-stretch">
        <div className="min-w-0 flex-1">
          <StudioTimelinePlayheadBound
            tracks={doc.tracks}
            clips={doc.clips}
            timelineLengthMs={length}
            pxPerMs={pxPerMs}
            mode={timelineMode}
            interactionLocked={recordingLocked}
            selectedClipId={activeSelectedId}
            renderLaneOverlay={(track) =>
              automationEdit && automationEdit.trackId === track.id ? (
                <StudioAutomationLane
                  trackId={track.id}
                  automation={track.automation}
                  staticValue={automationEdit.param === "gainDb" ? track.gainDb : track.pan}
                  param={automationEdit.param}
                  timelineLengthMs={length}
                  pxPerMs={pxPerMs}
                  laneHeightPx={STUDIO_DAW_LANE_HEIGHT_PX}
                  disabled={recordingLocked || pending}
                  onChangeParam={(param) => setAutomationEdit({ trackId: track.id, param })}
                  onClose={() => setAutomationEdit(null)}
                  onCommit={(next) => saveTrackAutomation(track.id, next)}
                />
              ) : null
            }
            renderTrackHeader={(track, index) => (
              <StudioTrackHeader
                key={track.id}
                track={track}
                index={index}
                isSelected={activeSelectedTrackId === track.id}
                doc={doc}
                beatTitle={beatTitle}
                timelineLengthMs={length}
                recordSimple={recordSimple}
                pending={pending}
                recordingLocked={recordingLocked}
                menuOpen={trackMenuId === track.id}
                onSelect={setSelectedTrackId}
                onToggleMenu={() => setTrackMenuId((prev) => (prev === track.id ? null : track.id))}
                patchTrack={patchTrack}
                reorder={reorder}
                setDoc={setDoc}
              />
            )}
            onSeek={seekSnapped}
            onSelectClip={(id) => {
              if (recordingLocked) return;
              setInspectorPreferRecord(
                studioPreferRecordAfterTimelineSelect({
                  scratchSessionActive: lastScratchClipId != null,
                }),
              );
              setSelectedClipId(selectClipId(activeSelectedId, id));
              const clip = doc.clips.find((c) => c.id === id);
              if (clip) setSelectedTrackId(clip.trackId);
              setMode("edit");
              setConfirmDelete(false);
              setFragmentConfirmDelete(false);
            }}
            scrollContainerRef={timelineScrollRef}
            onZoomAroundViewport={(nextPxPerMs, viewportOffsetPx) => {
              userAdjustedZoomRef.current = true;
              zoomAroundViewportX(nextPxPerMs, viewportOffsetPx);
            }}
            resolveClipSourceUrl={resolveClipSourceUrl}
            snapConfig={snapConfig}
            onCommitClipGeometry={(clipId, commit) => {
              if (recordingLocked) return;
              setSelectedClipId(selectClipId(activeSelectedId, clipId));
              const clip = doc.clips.find((c) => c.id === clipId);
              if (clip) setSelectedTrackId(clip.trackId);
              persistClipGeometryCommit(clipId, commit);
            }}
          />
        </div>

        {!recordSimple ? (
        <aside
          data-testid="studio-inspector-desktop"
          data-studio-inspector="desktop"
          data-inspector-context={inspectorContext}
          className="hidden w-[300px] shrink-0 flex-col gap-1.5 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 shadow-sm xl:flex"
          aria-label={tInspector(inspectorContext)}
        >
          {inspectorDesktopRail ? inspectorContent : null}
        </aside>
        ) : null}
      </div>
        </>
      )}

      <StudioInspectorOverlay
        open={inspectorOverlayOpen && !inspectorDesktopRail && !recordSimple}
        context={inspectorContext}
        panelId={inspectorPanelId}
        onClose={closeInspectorOverlay}
        capturing={recordingLocked}
        closeBlockedMessage={
          tl(inspectorCloseRejected && recordingLocked
            ? tInspector("closeBlocked")
            : null)
        }
      >
        {inspectorContent}
      </StudioInspectorOverlay>

      {studioStep !== "master" && !recordSimple ? (
      <>
      <StudioMixerDockChrome
        expanded={Boolean(inspectorDesktopRail && mixerOpen)}
        panelId={mixerPanelId}
        onToggle={toggleMixerSurface}
      >
        {inspectorDesktopRail && mixerOpen ? mixerChannels : null}
      </StudioMixerDockChrome>

      <StudioMixerOverlay
        open={mixerOpen && !inspectorDesktopRail}
        onClose={closeMixerSurface}
        panelId={mixerPanelId}
      >
        {mixerChannels}
      </StudioMixerOverlay>
      </>
      ) : null}

      <StudioFxSheet
        open={fxPanel !== null}
        onClose={() => setFxPanel(null)}
      >
        {fxPanel?.role === "master" ? (
          <StudioFxChainEditor
            role="master"
            projectId={doc.project.id}
            maxEffects={maxFxEffectsForTier(trackCapacity.premiumTier)}
            allowSidechain={sidechainForTier(trackCapacity.premiumTier)}
            chain={doc.project.masterFxChain}
            getExpectedDocumentVersion={expectedDocumentVersion}
            enqueuePersistAsync={enqueuePersistAsync}
            title={tr("masterEfekty")}
            onClose={() => setFxPanel(null)}
            onFxPersisted={(masterFxChain, documentVersion) => {
              recordUndo({
                undo: { kind: "master_fx", chain: committedDocRef.current.project.masterFxChain },
                redo: { kind: "master_fx", chain: masterFxChain },
              });
              applyPersistedDoc((prev) => ({
                ...prev,
                project: {
                  ...prev.project,
                  documentVersion,
                  masterFxChain,
                },
              }));
            }}
          />
        ) : null}
        {fxPanel?.role === "track" ? (
          <StudioFxChainEditor
            role="track"
            projectId={doc.project.id}
            trackId={fxPanel.trackId}
            maxEffects={maxFxEffectsForTier(trackCapacity.premiumTier)}
            allowSidechain={sidechainForTier(trackCapacity.premiumTier)}
            chain={
              doc.tracks.find((t) => t.id === fxPanel.trackId)?.effectsChain ?? {
                schemaVersion: 1,
                effects: [],
              }
            }
            getExpectedDocumentVersion={expectedDocumentVersion}
            enqueuePersistAsync={enqueuePersistAsync}
            title={tr("efekty", { v0: doc.tracks.find((t) => t.id === fxPanel.trackId)?.name ?? tr("sciezka") })}
            vocalPresets={{ bpm: doc.project.tempoBpm }}
            trackClips={doc.clips.filter((c) => c.trackId === fxPanel.trackId)}
            onClose={() => setFxPanel(null)}
            onFxPersisted={(effectsChain, documentVersion) => {
              const trackId = fxPanel.trackId;
              const beforeChain = committedDocRef.current.tracks.find((t) => t.id === trackId)?.effectsChain;
              if (beforeChain) {
                recordUndo({
                  undo: { kind: "track_fx", trackId, chain: beforeChain },
                  redo: { kind: "track_fx", trackId, chain: effectsChain },
                });
              }
              applyPersistedDoc((prev) => ({
                ...prev,
                project: { ...prev.project, documentVersion },
                tracks: prev.tracks.map((t) =>
                  t.id === trackId ? { ...t, effectsChain } : t,
                ),
              }));
            }}
          />
        ) : null}
      </StudioFxSheet>
    </div>
  );
}
