"use client";

import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import { applyMixOpsToDocument, inverseMixAutofixOps } from "@/lib/studio/mix-autofix/plan";
import { useLibText } from "@/i18n/use-lib-text";


import { useLocale, useTranslations } from "next-intl";
import { createPortal } from "react-dom";

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
// Panels hidden on first open (Mix/Mastering steps, BITKA chat, FX sheet, spectrogram) load lazily.
import {
  StudioBitekChat,
  StudioFxChainEditor,
  StudioFxSheet,
  StudioLazyPanelsIdlePrefetch,
  StudioMasterStep,
  StudioMixStep,
  prefetchStudioStepPanels,
} from "@/components/studio/studio-lazy-panels";
import { StudioFullscreenToggle } from "@/components/studio/studio-fullscreen-toggle";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioBeatPicker } from "@/components/studio/studio-beat-picker";
import {
  deriveStudioInspectorContext,
  studioGroupOfContext,
  resolveStudioInspectorPanel,
  type StudioInspectorTab,
  studioPreferRecordAfterCaptureReport,
  studioPreferRecordAfterClipCreated,
  studioPreferRecordAfterTimelineSelect,
  studioInspectorOverlayCloseBlocked,
} from "@/components/studio/studio-inspector-context";
import { StudioInspectorFilePanel } from "@/components/studio/studio-inspector-file-panel";
import { StudioInspectorOverlay } from "@/components/studio/studio-inspector-shell";
import { StudioLeaveGuardDialog, useStudioLeaveGuard, useStudioSaveLeaveGuard } from "@/components/studio/studio-leave-guard-dialog";
import { studioPageUnloadPrompt } from "@/components/studio/studio-leave-guard";
import {
  StudioMixerDockChrome,
  StudioMixerOverlay,
} from "@/components/studio/studio-mixer-shell";
import { StudioAutomationLane } from "@/components/studio/studio-automation-lane";
import { StudioRecordingPanel } from "@/components/studio/studio-recording-panel";
import { StudioRecordSlot, useStudioRecordHost } from "@/components/studio/studio-record-slot";
import type { RecordHold } from "@/lib/takes/recording-ui-state";
import { adoptRecoveredTake } from "@/lib/studio/unplaced-take-memo";
import { PLAN_POLICY, clipPitchForTier, maxFxEffectsForTier, maxStemsForTier, sidechainForTier } from "@/config/plan-policy";
import { emptyAutomation, type AutomationParam, type StudioAutomationV1 } from "@/lib/studio/studio-automation";
import { bassLineAt, drumPatternAt, emptyMidi, hasMidi, midiPhraseAt, reviewPlayedNotes, type StudioMidiV1 } from "@/lib/studio/studio-midi";
import { fadeEdgePreset } from "@/lib/studio/studio-clip-fade";
import { TakeRecordingRecoveryBanner } from "@/components/takes/take-recording-recovery-banner";
import { StudioEditToolbar } from "@/components/studio/studio-edit-toolbar";
import { StudioShortcutsDialog } from "@/components/studio/studio-shortcuts-dialog";
import { StudioTransportBar } from "@/components/studio/studio-transport-bar";
import { StudioStepNav } from "@/components/studio/studio-step-nav";
import { StudioFeatureFinder } from "@/components/studio/studio-feature-finder";
import { StudioLyricsCard } from "@/components/studio/studio-lazy-panels";
import { StudioDockBar, StudioGroupRow, StudioGroupSection, StudioGroupTabs, StudioTextGroup } from "@/components/studio/studio-groups";
import { StudioExportControl } from "@/components/studio/studio-export-control";
import { StudioMixRevisionHistoryControl } from "@/components/studio/studio-mix-revision-history-control";
import { LockedAction } from "@/components/plans/locked-action";
import { useStoreApp } from "@/components/site/store-app-context";
import Link from "@/components/ui/app-link";
import { STUDIO_FEATURES, type StudioGroup } from "@/lib/studio/studio-feature-finder";
import { formatStudioTrackCapacityLabel, STUDIO_TRACK_UPGRADE_HREF } from "@/lib/studio/studio-track-capacity";
import { studioSnapPresetLabel } from "@/lib/studio/studio-timeline-view";
import type { StudioRecordFocus } from "@/components/studio/studio-recording-panel";
import { StudioTrackHeader } from "@/components/studio/studio-track-header";
import {
  TrackInspectorPanel,
  TrackNameField,
  StudioMasterMeterLive,
  StudioTrackMeterLive,
  ClipEditPanelPlayheadBound,
} from "@/components/studio/studio-inspector-panels";
import { StudioTimeline } from "@/components/studio/studio-timeline";
import { STUDIO_MARKERS_CHANGED_EVENT, type StudioMarkersChangedDetail } from "@/components/studio/studio-markers-events";
import { StudioProjectTitle } from "@/components/studio/studio-project-title";
import { StudioClipSpectrogramSection } from "@/components/studio/studio-clip-spectrogram-section";
import { StudioDeleteTrackDialog, StudioTrackMenu } from "@/components/studio/studio-track-menu";
import { isStudioTypingTarget, studioControlKeepsKey, studioModalState } from "@/lib/studio/studio-shortcut-guard";
import {
  STUDIO_DAW_CHIP_CLASS,
  STUDIO_DAW_LANE_HEIGHT_LOW_PX,
  STUDIO_DAW_LANE_HEIGHT_PX,
  STUDIO_TRACK_GAIN_DB_MAX,
  STUDIO_TRACK_GAIN_DB_MIN,
  type StudioTimelineMode,
} from "@/components/studio/studio-daw-layout";
import { clipSourceRate, durationAfterStretchMs, playheadInsideClip } from "@/lib/studio/studio-clip-ops";
import { applyClipGeometryCommit, type StudioClipEditCommit } from "@/lib/studio/studio-clip-edit-preview";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import {
  StudioTransportProvider,
  useStudioTransportControls,
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
import { buildStudioGrid, studioGridOriginMs, writeStudioViewPrefs } from "@/lib/studio/studio-grid";
import { useStudioViewPrefs } from "@/lib/studio/use-studio-view-prefs";
import { beatRestorePlan, isBeatClip, isClipLocked } from "@/lib/studio/studio-beat-lock";
import { studioBeatPitchCents, studioHeardBpm } from "@/lib/studio/studio-beat-speed";
import { StudioBeatSpeed } from "@/components/studio/studio-beat-speed";
import { StudioBeatPitchContext } from "@/components/studio/studio-tune-panel";
import { studioAdvancedRecordAllowed, studioRecordView } from "@/lib/studio/studio-record-view";
import {
  clearClipSelection,
  clampPxPerMs,
  createDefaultSnapConfig,
  cycleStudioSnapConfig,
  fitPxPerMs,
  studioSongEndMs,
  studioTimelineFitLengthMs,
  nudgeClipTimelineStartMs,
  resolveNudgeStepMs,
  resolveSelectedClipId,
  selectClipId,
  snapConfigFromPreset,
  snapPresetFromConfig,
  snapTimelineMs,
  withStudioSnapGrid,
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
import { planVocalDoubler } from "@/lib/studio/vocal-doubler-plan";
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
  applyTrackDouble,
  canRunStudioStructuralOp,
  isStudioStructuralUndoOp,
  resolveStudioStructuralOpIds,
  resolveStudioUndoId,
  runStudioStructuralOp,
  type StudioApiCall,
  type StudioStructuralUndoOp,
  type StudioTrackDouble,
} from "@/lib/studio/studio-undo-structural";
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

/** How long a short note replaces the save state in the transport. */
const STATUS_NOTE_MS = 6000;

/** Phase 7.1.1 — primary track chips ≥44px hit area (visual stays compact). */

export function StudioEditor({
  initialDocument,
  initialBeatTitle = null,
  initialBeatDurationMs = null,
  trackCapacity,
}: {
  initialDocument: StudioProjectDocument;
  /** Title of the attached beat (the beat track is always named "Bit"). */
  initialBeatTitle?: string | null;
  /** Full length of the attached Bit, for "put the Bit back". */
  initialBeatDurationMs?: number | null;
  trackCapacity: StudioTrackCapacityProps;
}) {
  const [doc, setDoc] = useState(initialDocument);
  const [beatTitle, setBeatTitle] = useState<string | null>(initialBeatTitle);
  const [fullBeat, setFullBeat] = useState({ beatId: initialDocument.project.beatId, ms: initialBeatDurationMs });
  // A newly chosen Bit is seeded whole: its fresh clip gives the full length (adjust during render).
  if (doc.project.beatId !== fullBeat.beatId) {
    const seeded = doc.clips.filter(isBeatClip);
    setFullBeat({
      beatId: doc.project.beatId,
      ms: seeded.length === 1 && seeded[0].sourceBeatId === doc.project.beatId ? seeded[0].durationMs : null,
    });
  }
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

  const outerViewPrefs = useStudioViewPrefs(doc.project.id);
  const metronomeOriginMs = studioGridOriginMs(
    doc.clips.filter((c) => c.sourceKind === "BEAT_REF"),
    outerViewPrefs.gridShiftMs,
  );

  return (
    <StudioTransportProvider
      // Project only: choosing a beat must not remount the editor (undo history, step, running saves).
      key={doc.project.id}
      timelineLengthMs={doc.project.timelineLengthMs}
      beatId={beatRef?.beatId ?? null}
      engineDocument={engineDocument}
      tempoBpm={studioHeardBpm(doc.project.tempoBpm, doc.clips)}
      timeSignatureNum={doc.project.timeSignatureNum}
      gridOriginMs={metronomeOriginMs}
    >
      <StudioBeatPitchContext.Provider value={studioBeatPitchCents(doc.clips)}>
      <StudioEditorInner
        doc={doc}
        setDoc={setDoc}
        trackCapacity={trackCapacity}
        onMixAbOverride={setMixAbOverride}
        beatTitle={beatTitle}
        onBeatTitle={setBeatTitle}
        fullBeatMs={doc.project.beatId === fullBeat.beatId ? fullBeat.ms : null}
      />
      </StudioBeatPitchContext.Provider>
    </StudioTransportProvider>
  );
}

/** Plan that raises the recording-track limit (lock bubble). */
const STUDIO_NEXT_TIER = { FREE: "BRONZE", BRONZE: "SILVER", SILVER: "GOLD", GOLD: "GOLD" } as const;

function StudioEditorInner({
  doc,
  setDoc,
  trackCapacity,
  onMixAbOverride,
  beatTitle,
  onBeatTitle,
  fullBeatMs,
}: {
  fullBeatMs: number | null;
  doc: StudioProjectDocument;
  setDoc: Dispatch<SetStateAction<StudioProjectDocument>>;
  trackCapacity: StudioTrackCapacityProps;
  onMixAbOverride: (before: StudioProjectDocument | null) => void;
  beatTitle: string | null;
  onBeatTitle: (title: string | null) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const tInspector = useTranslations("studio.inspectorTitle");
  const tGroups = useTranslations("studio.groups");
  const storeApp = useStoreApp();
  /** "Dodaj" and the feature search point the recording panel at one of its controls. */
  const [recordFocus, setRecordFocus] = useState<StudioRecordFocus | null>(null);
  const recordFocusIdRef = useRef(0);
  /** Files dropped on the timeline; the stem card asks for the rights statement before any upload. */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [droppedStems, setDroppedStems] = useState<{ id: number; files: File[]; atMs: number } | null>(null);
  /** Simple view below xl: which group sheet is open (the recording panel is always on the page). */
  const [simpleGroup, setSimpleGroup] = useState<Exclude<StudioGroup, "record"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // A short note ("Cofnięto zmianę"): after a moment the save state is back.
  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), STATUS_NOTE_MS);
    return () => window.clearTimeout(id);
  }, [status]);
  const [persistSnap, setPersistSnap] = useState<StudioPersistSnapshot>({
    status: "CLEAN",
    generation: 0,
    inFlight: false,
    queued: false,
    blocking: false,
    unsaved: false,
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
  /** Rows are being added / removed / split: lock controls until it is saved. Never true while a failed save waits. */
  const pending = persistSnap.blocking;
  /** History before / after the undo being saved, so a refused undo can be put back. */
  const writeSeqRef = useRef(new Map<string, number>());
  const undoRevertRef = useRef<{ before: StudioUndoHistory; after: StudioUndoHistory } | null>(null);
  const [mode, setMode] = useState<TimelineMode>("seek");
  /** The Bit cannot be moved or cut until unlocked; every visit starts locked. */
  const [beatUnlocked, setBeatUnlocked] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pxPerMs, setPxPerMs] = useState(STUDIO_TIMELINE_DEFAULT_PX_PER_MS);
  /** When true, skip auto-fit on resize (user zoomed in/out). Fit button clears it. */
  const userAdjustedZoomRef = useRef(false);
  const [snapChoice, setSnapConfig] = useState<StudioSnapConfig>(() =>
    createDefaultSnapConfig(),
  );
  /** Ruler, track height and bar 1: remembered per project on this device. */
  const viewPrefs = useStudioViewPrefs(doc.project.id);
  /** "Tempo bitu": the grid, metronome and new notes follow the tempo that is heard. */
  const heardBpm = studioHeardBpm(doc.project.tempoBpm, doc.clips);
  const beatFileStartMs = studioGridOriginMs(doc.clips.filter((c) => c.sourceKind === "BEAT_REF"), 0);
  const gridOriginMs = beatFileStartMs + viewPrefs.gridShiftMs;
  const grid = useMemo(
    () =>
      buildStudioGrid({
        bpm: heardBpm,
        timeSignatureNum: doc.project.timeSignatureNum,
        timeSignatureDen: doc.project.timeSignatureDen,
        originMs: gridOriginMs,
      }),
    [heardBpm, doc.project.timeSignatureNum, doc.project.timeSignatureDen, gridOriginMs],
  );
  const snapConfig = useMemo(() => withStudioSnapGrid(snapChoice, grid), [snapChoice, grid]);
  const laneHeightPx = viewPrefs.lanes === "low" ? STUDIO_DAW_LANE_HEIGHT_LOW_PX : STUDIO_DAW_LANE_HEIGHT_PX;
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
  /** Document version that already has a master: Mastering opens again without a new mix analysis. */
  const [masterOpenVersion, setMasterOpenVersion] = useState<number | null>(null);
  /** Document version whose mix passed the analysis (Mix step): step 3 is open for it. */
  const [mixReadyVersion, setMixReadyVersion] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    // A slow answer must not pull the user away from what they already started.
    const onUserAction = () => {
      live = false;
    };
    window.addEventListener("pointerdown", onUserAction, true);
    window.addEventListener("keydown", onUserAction, true);
    void fetch(`/api/studio/projects/${restoreProjectId}/master`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // Also a running or finished but not yet approved master of this very mix (another one would cost the limit again).
        const open = j?.latest && j.latest.sourceDocumentVersion === j.documentVersion && ["queued", "running", "succeeded"].includes(j.latest.status);
        if (j?.approved?.id || open) setMasterOpenVersion(j.documentVersion ?? null);
        if (live && (j?.approved?.id || open)) {
          setSampleTab(false);
          setStudioStep((cur) => (cur === "record" ? "master" : cur));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      window.removeEventListener("pointerdown", onUserAction, true);
      window.removeEventListener("keydown", onUserAction, true);
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
  const getRecordChatContext = () =>
    buildBitekClientContext({ doc: docRef.current, lang: studioLocale === "en" ? "en" : "pl", step: "record" });
  /** STU-14 — re-read browser-local recovery copies. */
  const [recoveryRefreshKey, setRecoveryRefreshKey] = useState(0);
  const [recoverySavedKey, setRecoverySavedKey] = useState(0);
  const [beatPickerOpen, setBeatPickerOpen] = useState(false);
  const [fxPanel, setFxPanel] = useState<FxPanelTarget | null>(null);
  /** Inspector tab chosen by the user; "effects" edits the selected track or the master. */
  const [inspectorTab, setInspectorTab] = useState<StudioInspectorTab>("settings");
  const [fxInspectorRole, setFxInspectorRole] = useState<"track" | "master">("track");
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
  const saveLeaveGuard = useStudioSaveLeaveGuard(persistSnap.unsaved && !persistSnap.conflict && !recordingLocked, studioShellRef);
  const pendingZoomScrollLeftRef = useRef<number | null>(null);
  const pxPerMsRef = useRef(pxPerMs);
  const anySolo = doc.tracks.some((t) => t.solo);
  const length = doc.project.timelineLengthMs;
  /** End of the last clip / note: clock, End key, loop and position slider (the canvas stays 6:00). */
  const songEndMs = studioSongEndMs(length, doc.clips, doc.tracks);
  /** Focus came from the mouse / touch: Space is play / record, not a second press of that button. */
  const pointerFocusRef = useRef(false);
  // The markers panel saved a change: show it on the ruler.
  useEffect(() => {
    const onMarkers = (event: Event) => {
      const detail = (event as CustomEvent<StudioMarkersChangedDetail>).detail;
      const withMarkers = (prev: StudioProjectDocument) =>
        prev.project.id === detail.projectId ? { ...prev, markers: detail.markers } : prev;
      committedDocRef.current = withMarkers(committedDocRef.current);
      docRef.current = withMarkers(docRef.current);
      setDoc(withMarkers);
    };
    window.addEventListener(STUDIO_MARKERS_CHANGED_EVENT, onMarkers);
    return () => window.removeEventListener(STUDIO_MARKERS_CHANGED_EVENT, onMarkers);
  }, [setDoc]);
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
  const selectionContext = deriveStudioInspectorContext({
    recordingActive: recordingContextActive || recordSimple,
    selectedClipId: activeSelectedId,
    selectedTrackId: activeSelectedTrackId,
  });
  const inspectorContext = resolveStudioInspectorPanel({
    recordingActive: selectionContext === "record",
    tab: inspectorTab,
    selectedClipId: activeSelectedId,
    selectedTrackId: activeSelectedTrackId,
  });

  const recordHost = useStudioRecordHost();
  /** Why the record panel may not be unmounted now (recording, undecided take, unsent take). */
  const [recordHold, setRecordHold] = useState<RecordHold>(null);
  const recordHoldRef = useRef<RecordHold>(null);
  useLayoutEffect(() => {
    recordHoldRef.current = recordHold;
  }, [recordHold]);
  const recordPanelVisible =
    inspectorContext === "record" &&
    studioStep === "record" &&
    (recordSimple || inspectorDesktopRail || inspectorOverlayOpen);
  const recordPanelMounted =
    recordHold !== null ||
    (inspectorContext === "record" && (studioStep === "record" || inspectorOverlayOpen));

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
  // The greeting never hides a question, a failed save or "working" in Mix / Mastering.
  const urgentBubble = studioStep !== "record" && (stepBubble?.mood === "alert" || stepBubble?.mood === "thinking");
  const bitekBubble =
    !urgentBubble && welcomeBubble && bitekBubbleState.dismissedKey !== "welcome" && !bitekBubbleUi?.dismissedKey ? welcomeBubble : stepBubble;

  function openInspectorOverlay() {
    // On desktop the inspector is always on screen: opening a tab must not fold the mixer dock.
    if (inspectorDesktopRail) return;
    setMixerOpen(false);
    setInspectorOverlayOpen(true);
  }

  /** Full record view: the five groups replace the crowded toolbar and the old panel tabs. */
  const groupsShown = studioStep === "record" && !recordSimple;
  const simpleDock = studioStep === "record" && recordSimple;
  const activeGroup =
    inspectorDesktopRail || inspectorOverlayOpen ? studioGroupOfContext(inspectorContext) : null;

  /** A vocal track to work on when nothing is selected: vocal tuning belongs on the voice, not on the Master. */
  function firstVocalTrack() {
    return (
      doc.tracks.find((t) => t.trackType !== "BEAT" && t.trackRole !== "beat" && t.trackRole !== "instrument") ??
      doc.tracks.find((t) => t.trackType !== "BEAT") ??
      null
    );
  }

  function openGroup(group: StudioGroup) {
    setConfirmDelete(false);
    if (group === "record") {
      setInspectorPreferRecord(true);
    } else {
      if (recordingLocked) return;
      setInspectorPreferRecord(false);
      setInspectorTab(group === "sound" ? "effects" : group);
      if (group === "sound") {
        const target = selectedTrack && selectedTrack.trackType !== "BEAT" ? selectedTrack : firstVocalTrack();
        if (target) setSelectedTrackId(target.id);
        setFxInspectorRole(target ? "track" : "master");
      }
    }
    openInspectorOverlay();
  }

  /** inPage: the simple view, where the panel is not in a sheet. */
  function focusRecordControl(target: StudioRecordFocus["target"], inPage = false) {
    recordFocusIdRef.current += 1;
    setRecordFocus({ id: recordFocusIdRef.current, target });
    setInspectorPreferRecord(true);
    if (!inPage) openInspectorOverlay();
  }

  function handleTimelineFileDrop(files: File[], atMs: number) {
    if (recordingLocked) return;
    if (maxStemsForTier(trackCapacity.premiumTier) < 1) {
      // No stem import in the plan: show the single vocal import, which has its own rules.
      setStatus(tr("upuszczanieBezStemow"));
      focusRecordControl("importVocal", !advancedRecord || !recordFullView);
      return;
    }
    // The stem card exists only in the full record view.
    setSampleTab(false);
    if (!recordFullView) setRecordFullView(true);
    recordFocusIdRef.current += 1;
    // A file dropped at the very end would have no room left.
    const startMs = Math.max(0, Math.min(atMs, doc.project.timelineLengthMs - 1000));
    setDroppedStems({ id: recordFocusIdRef.current, files, atMs: startMs });
    focusRecordControl("stems");
  }

  /** The same five buttons in the simple view, with only what that view really has. */
  function openSimpleGroup(group: StudioGroup) {
    if (group === "record") {
      setSimpleGroup(null);
      setSampleTab(false);
      window.setTimeout(
        () => document.querySelector('[data-testid="studio-record-simple"]')?.scrollIntoView({ block: "start", behavior: "smooth" }),
        50,
      );
      return;
    }
    if (recordingLocked) return;
    setSimpleGroup(group);
  }

  function goToMix() {
    setSimpleGroup(null);
    if (!canGoMix) {
      setStatus(tGroups("najpierwWokal"));
      return;
    }
    closeInspectorOverlay();
    setSampleTab(false);
    setStudioStep("mix");
  }

  /** Silver and Gold: from a simple-view sheet to a group of the full view. */
  function openFullViewGroup(group: StudioGroup | null) {
    setSimpleGroup(null);
    setSampleTab(false);
    setRecordFullView(true);
    if (group) openGroup(group);
  }

  /** Track settings or the files list: both live under "Więcej". */
  function openTrackOrFiles(tab: "settings" | "file") {
    setConfirmDelete(false);
    setInspectorPreferRecord(false);
    if (tab === "file") setSelectedClipId(clearClipSelection());
    else {
      setSelectedClipId(clearClipSelection());
      if (!selectedTrack) {
        const target = firstVocalTrack();
        if (target) setSelectedTrackId(target.id);
      }
    }
    setInspectorTab(tab);
    openInspectorOverlay();
  }

  /** "Znajdź funkcję": open the place where the chosen feature lives. */
  function openFeature(id: string) {
    const feature = STUDIO_FEATURES.find((item) => item.id === id);
    if (!feature || recordingLocked || (feature.fullOnly && !advancedRecord)) return;
    setSimpleGroup(null);
    setSampleTab(false);
    if (id === "makeSong" || id === "cleanup" || (feature.mixWithoutFullView && !advancedRecord)) {
      if (canGoMix) setStudioStep("mix");
      else setStatus(tGroups("najpierwWokal"));
      return;
    }
    if (id === "samples") {
      setStudioStep("record");
      setSampleTab(true);
      return;
    }
    if (id === "changeBeat") {
      setBeatPickerOpen(true);
      return;
    }
    if (id === "metronome") {
      transport.setMetronomeEnabled(!transport.metronomeEnabled);
      setStatus(tGroups(transport.metronomeEnabled ? "metronomWyl" : "metronomWl"));
      return;
    }
    setStudioStep("record");
    const opensFullView = feature.fullOnly || Boolean(feature.mixWithoutFullView);
    if (opensFullView && !recordFullView) setRecordFullView(true);
    if (id === "clipTools") {
      closeInspectorOverlay();
      setStatus(tGroups("dotknijKlipu"));
      return;
    }
    if (id === "beatLock") {
      closeInspectorOverlay();
      setBeatUnlocked(true);
      setStatus(tGroups("bitOdblokowany"));
      return;
    }
    if (id === "volumeAutomation") {
      const target = selectedTrack && selectedTrack.trackType !== "BEAT" ? selectedTrack : firstVocalTrack();
      if (!target) {
        setStatus(tGroups("najpierwWokal"));
        return;
      }
      closeInspectorOverlay();
      setSelectedTrackId(target.id);
      setAutomationEdit({ trackId: target.id, param: "gainDb" });
      setStatus(tGroups("automatykaOtwarta", { name: target.name }));
      return;
    }
    // From the simple view the panel controls open in the simple panel (it is always on screen there).
    const staysSimple = !advancedRecord || !recordFullView ? !opensFullView : false;
    const focus: Partial<Record<string, StudioRecordFocus["target"]>> = {
      latency: "latency",
      mic: "mic",
      countdown: "countdown",
      recMode: "recMode",
      takes: "takes",
      scratch: "scratch",
      stems: "stems",
      importVocal: "importVocal",
      ...(staysSimple ? { lyrics: "lyrics" as const } : {}),
    };
    const target = focus[id];
    if (target) {
      focusRecordControl(target, staysSimple);
      return;
    }
    if (id === "beatSpeed") {
      const beatTrack = doc.tracks.find((t) => t.trackType === "BEAT");
      if (!beatTrack) return;
      setSelectedClipId(clearClipSelection());
      setSelectedTrackId(beatTrack.id);
      if (!staysSimple && !inspectorDesktopRail) openInspectorOverlay();
      return;
    }
    if (id === "mixer") {
      openMixerSurface();
      return;
    }
    if (id === "trackSettings") {
      openTrackOrFiles("settings");
      return;
    }
    if (id === "files") {
      openTrackOrFiles("file");
      return;
    }
    if (feature.place === "sound") openGroup("sound");
    else if (id === "lyrics" || id === "markers") openGroup("text");
    else if (id === "addTrack") openGroup("add");
    else openGroup("more");
  }

  /** Effects open in the inspector when its column is on screen, otherwise in the sheet. */
  function openEffects(target: FxPanelTarget) {
    if (inspectorDesktopRail && studioStep === "record" && !recordSimple && !recordingLocked) {
      if (target.role === "track") setSelectedTrackId(target.trackId);
      setFxInspectorRole(target.role);
      setInspectorPreferRecord(false);
      setInspectorTab("effects");
      setFxPanel(null);
      return;
    }
    setFxPanel(target);
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

  /** Show the recording panel: step 1, record tab, sheet below xl. */
  function showRecordPanel() {
    setSampleTab(false);
    setStudioStep("record");
    setInspectorPreferRecord(true);
    if (!inspectorDesktopRail) openInspectorOverlay();
  }

  /**
   * One record key for the bar, the keyboard and BITEK: the panel starts, stops or calls off the
   * count-in. From Mix, Mastering and Sample the bar first goes to step 1; the keys do nothing there.
   */
  function requestRecord(source: "button" | "key") {
    if (recordingLockedRef.current || recordHoldRef.current === "arming") {
      // Stop / cancel: never move the user to another view.
      setTransportRecordRequest((n) => n + 1);
      return;
    }
    if (source === "key" && (studioStep !== "record" || sampleTab)) return;
    showRecordPanel();
    setTransportRecordRequest((n) => n + 1);
  }
  const requestRecordRef = useRef(requestRecord);
  useLayoutEffect(() => {
    requestRecordRef.current = requestRecord;
  });

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
    // The Mixer stays closed until asked for (button or F9): it opens over the bottom of the screen.
    const mq = window.matchMedia("(min-width: 1280px)");
    const apply = () => {
      const desktop = mq.matches;
      setInspectorDesktopRail(desktop);
      if (desktop) {
        setInspectorOverlayOpen(false);
      } else {
        // Avoid auto-opening <xl Mixer overlay when leaving desktop.
        setMixerOpen(false);
        // A take in progress or undecided keeps its panel on screen in the sheet.
        if (recordHoldRef.current) setInspectorOverlayOpen(true);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const { setPlayEndHold } = transport;
  // From the mic prompt on: a count-in or a take must not be cut at the song end.
  const playEndHold = recordingLocked || recordHold === "arming" || recordHold === "capture";
  useEffect(() => {
    setPlayEndHold(playEndHold);
  }, [playEndHold, setPlayEndHold]);

  useEffect(() => {
    // An older render must not take back a version the server already acknowledged.
    if (doc.project.documentVersion >= docRef.current.project.documentVersion) {
      docRef.current = doc;
    }
  }, [doc]);

  const onPersistRejectedRef = useRef<(message: string, awaited: boolean) => void>(() => {});
  useLayoutEffect(() => {
    onPersistRejectedRef.current = (message, awaited) => {
      const revert = undoRevertRef.current;
      undoRevertRef.current = null;
      if (revert && undoHistoryRef.current === revert.after) {
        undoHistoryRef.current = revert.before;
        setUndoHistory(revert.before);
      }
      setStatus(null);
      // Awaited callers show their own error.
      if (!awaited) setError(`${message} ${tr("zmianaWycofana")}`);
    };
  });

  useEffect(() => {
    const orch = new StudioPersistOrchestrator({
      onChange: (snap) => setPersistSnap(snap),
      onRejected: (failure, info) => onPersistRejectedRef.current(failure.message, info.awaited),
      onRollback: () => {
        const saved = committedDocRef.current;
        docRef.current = saved;
        setDoc(saved);
      },
    });
    persistRef.current = orch;
    const onOnline = () => orch.onOnline();
    const onVisible = () => {
      if (document.visibilityState === "visible") orch.retryNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      // Finishes the queue in the background instead of dropping it.
      orch.dispose();
      persistRef.current = null;
    };
  }, [setDoc]);

  useEffect(() => {
    recordingLockedRef.current = recordingLocked;
    unloadAllowedRef.current = () => leaveGuard.unloadAllowed() || saveLeaveGuard.unloadAllowed();
  });

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const snap = persistRef.current?.getSnapshot();
      const persistGuarded = Boolean(snap?.unsaved);
      if (
        !studioPageUnloadPrompt({
          unloadAllowed: unloadAllowedRef.current(),
          captureActive:
            recordingLockedRef.current ||
            recordHoldRef.current === "saving" ||
            recordHoldRef.current === "retry",
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

  function enqueuePersist(
    executor: () => Promise<StudioPersistResult>,
    options?: { blocking?: boolean },
  ) {
    persistRef.current?.requestPersist(executor, options);
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
  ): Promise<StudioPersistSnapshot | undefined> {
    return persistRef.current?.flush(executor);
  }

  /**
   * Apply CAS ack into React state and sync docRef immediately so the next
   * queued persist reads documentVersion N+1 (not a stale closure).
   */
  function applyPersistedDoc(
    mutate: (prev: StudioProjectDocument) => StudioProjectDocument,
    /** What the screen takes from this ack; default everything. */
    display: (prev: StudioProjectDocument) => StudioProjectDocument = mutate,
  ): void {
    // Now, not in the setDoc updater: React may run that only at the next render,
    // after the queue already started the next save with the old version.
    committedDocRef.current = mutate(committedDocRef.current);
    docRef.current = display(docRef.current);
    setDoc(display);
  }

  /** For optimistic writes: returns a check that no newer write of the same thing was made since. */
  function beginWrite(key: string): () => boolean {
    const seq = (writeSeqRef.current.get(key) ?? 0) + 1;
    writeSeqRef.current.set(key, seq);
    return () => writeSeqRef.current.get(key) === seq;
  }

  /** Ack of a write the user already changed again: only the version is news for the screen. */
  function versionOnly(documentVersion: number) {
    return (prev: StudioProjectDocument): StudioProjectDocument => ({
      ...prev,
      project: { ...prev.project, documentVersion },
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
      case "clip_playback":
        if (!committedClip(op.clipId)) return false;
        saveClipPlayback(
          op.clipId,
          { stretch: op.stretch, pitchCents: op.pitchCents },
          { ...quiet, durationMs: op.durationMs },
        );
        return true;
      case "track_automation":
      case "track_midi":
      case "track_reorder":
        if (!committedDocRef.current.tracks.some((t) => t.id === op.trackId)) return false;
        if (op.kind === "track_automation") saveTrackAutomation(op.trackId, op.automation, quiet);
        else if (op.kind === "track_midi") saveTrackMidi(op.trackId, op.midi, quiet);
        else reorder(op.trackId, op.direction, quiet);
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
    // One key per action: a retry after a lost answer is recognised, not applied twice.
    const requestId = crypto.randomUUID();
    return enqueuePersistAsync(async () => {
      try {
        const res = await fetch(`/api/studio/projects/${docRef.current.project.id}/mix-working/apply`, {
          // A hung request counts as no network: BITEK's buttons come back (the same requestId is retried).
          signal: AbortSignal.timeout(30_000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDocumentVersion: docRef.current.project.documentVersion,
            requestId,
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
    const flushed = await flushPersist();
    // Earlier changes are still waiting for the server: do not mix on top of them.
    if (flushed?.conflict) return { ok: false, conflict: true };
    if (flushed?.queued) {
      setError(flushed.lastError ?? tr("nieZapisano"));
      return { ok: false, conflict: false };
    }
    const before = committedDocRef.current;
    const inverse = inverseMixAutofixOps(before, ops);
    // Gaps P0 #3 — user-picked vocal sets are a USER version (server default), BITEK fixes stay "AI".
    const result = await persistMixWorkingOps(ops, options?.asUser ? null : { author: "AI", description }, options);
    if (!result.ok) return { ok: false, conflict: result.kind === "conflict" };
    recordUndo({ undo: { kind: "mix_ops", ops: inverse }, redo: { kind: "mix_ops", ops } });
    return { ok: true, before };
  }

  const studioApiCall: StudioApiCall = async (method, path, body) => {
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Status 0 = no network. Multi-step operations must see it as a failed step, not start over.
      return { ok: false, status: 0, json: {} };
    }
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
    }, { blocking: true });
  }

  function undoStudioEdit(): void {
    void stepStudioHistory(takeStudioUndo, "cofnietoZmiane");
  }

  function redoStudioEdit(): void {
    void stepStudioHistory(takeStudioRedo, "ponowionoZmiane");
  }

  async function stepStudioHistory(
    take: typeof takeStudioUndo,
    doneKey: "cofnietoZmiane" | "ponowionoZmiane",
  ): Promise<void> {
    const orch = persistRef.current;
    // Entries are recorded on ack: wait, so the step applies to the change just made.
    await orch?.whenIdle();
    if (orch !== persistRef.current) return;
    const before = undoHistoryRef.current;
    const taken = take(before);
    if (!taken) return;
    undoHistoryRef.current = taken.history;
    setUndoHistory(taken.history);
    if (!runUndoOp(taken.op)) {
      setStatus(tr("nieMoznaCofnac"));
      return;
    }
    setStatus(tr(doneKey));
    const revert = { before, after: taken.history };
    undoRevertRef.current = revert;
    void orch?.whenIdle().then((snap) => {
      if (!snap.queued && undoRevertRef.current === revert) undoRevertRef.current = null;
    });
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
  /** Whole song from 0: auto-fit and CAŁOŚĆ always show the start of the timeline. */
  function fitTimeline(el: HTMLDivElement | null) {
    const viewport = el?.clientWidth;
    const next = fitPxPerMs(
      fitLengthRef.current,
      typeof viewport === "number" && viewport > 0 ? viewport : 360,
    );
    pendingZoomScrollLeftRef.current = 0;
    // Same zoom = no re-render, so the layout effect below would not run.
    if (el) el.scrollLeft = 0;
    pxPerMsRef.current = next;
    setPxPerMs(next);
  }
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
      fitTimeline(el);
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
    const clip = docRef.current.clips.find((c) => c.id === clipId);
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
    // Shown at once: a dropped clip must not jump back while the save runs (rollback = onRollback).
    setDoc((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId ? { ...c, ...applyClipGeometryCommit(c, commit, clipSourceRate(c)) } : c,
      ),
    }));
    const isLatest = beginWrite(`clip:${clipId}`);
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
            const take = (prev: StudioProjectDocument): StudioProjectDocument => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              clips: prev.clips.map((c) => (c.id === clip.id ? clip : c)),
            });
            applyPersistedDoc(take, isLatest() ? take : versionOnly(documentVersion));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** M / S / R: heard and seen at once; a fast second click turns it back (never the same value twice). */
  function toggleTrackFlag(trackId: string, flag: "muted" | "solo" | "recordArmed"): void {
    const track = docRef.current.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const next = !track[flag];
    setDoc((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, [flag]: next } : t)),
    }));
    patchTrack(trackId, { [flag]: next });
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
                t.id !== trackId
                  ? t
                  : "trackRole" in body
                    ? track
                    : // Only the saved fields: another click on this track may still be waiting in the queue.
                      { ...t, ...pickStudioPatchBefore(track as unknown as Record<string, unknown>, body) },
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
  function saveTrackAutomation(trackId: string, automation: StudioAutomationV1, opts?: { history?: boolean }): void {
    setError(null);
    setDoc((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, automation } : t)) }));
    const isLatest = beginWrite(`automation:${trackId}`);
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
            if (opts?.history !== false) {
              const before = committedDocRef.current.tracks.find((t) => t.id === trackId)?.automation;
              recordUndo({
                undo: { kind: "track_automation", trackId, automation: before ?? emptyAutomation() },
                redo: { kind: "track_automation", trackId, automation: saved },
              });
            }
            const take = (prev: StudioProjectDocument): StudioProjectDocument => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, automation: saved } : t)),
            });
            applyPersistedDoc(take, isLatest() ? take : versionOnly(documentVersion));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Replace a track's MIDI notes (CAS). Empty notes clear the column. */
  function saveTrackMidi(trackId: string, midi: StudioMidiV1, opts?: { history?: boolean }): void {
    setError(null);
    setDoc((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, midi } : t)) }));
    const isLatest = beginWrite(`midi:${trackId}`);
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
            if (opts?.history !== false) {
              const before = committedDocRef.current.tracks.find((t) => t.id === trackId)?.midi;
              recordUndo({
                undo: { kind: "track_midi", trackId, midi: before ?? emptyMidi() },
                redo: { kind: "track_midi", trackId, midi: saved },
              });
            }
            const take = (prev: StudioProjectDocument): StudioProjectDocument => ({
              ...prev,
              project: { ...prev.project, documentVersion },
              tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, midi: saved } : t)),
            });
            applyPersistedDoc(take, isLatest() ? take : versionOnly(documentVersion));
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

  function reorder(trackId: string, direction: "up" | "down", opts?: { history?: boolean }) {
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
            const order = (list: readonly StudioTrackDto[]) => list.map((t) => t.id).join();
            if (opts?.history !== false && order(tracks) !== order(committedDocRef.current.tracks)) {
              recordUndo({
                undo: { kind: "track_reorder", trackId, direction: direction === "up" ? "down" : "up" },
                redo: { kind: "track_reorder", trackId, direction },
              });
            }
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
    }, { blocking: true });
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
    }, { blocking: true });
  }

  /** Phase 6 / 7.1.6 — duplicate track via CAS + serial orchestrator. */
  function duplicateTrack(trackId: string, opts?: { asVocalDouble?: boolean }): void {
    setError(null);
    setTrackMenuId(null);
    const asDouble = Boolean(opts?.asVocalDouble);
    enqueuePersist(async () => {
      // A second double goes to the other side.
      const doublePlan = asDouble
        ? planVocalDoubler(
            committedDocRef.current.tracks.some((t) => t.trackRole === "double" && t.pan > 0) ? "L" : "R",
          )
        : null;
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
        const double: StudioTrackDouble | undefined = doublePlan
          ? {
              pan: doublePlan.pan,
              gainDb: doublePlan.gainDb,
              trackRole: doublePlan.trackRole,
              nameSuffix: doublePlan.nameSuffix,
              offsetMs: doublePlan.offsetMs,
              pitchCents: clipPitchForTier(trackCapacity.premiumTier) ? doublePlan.pitchCents : null,
            }
          : undefined;
        const saved = {
          version: json.documentVersion,
          track: json.track,
          clips: json.clips,
          partial: false,
        };
        const { track, clips, version: documentVersion, partial } = double
          ? await applyTrackDouble(double, {
              base: `/api/studio/projects/${projectId()}`,
              api: studioApiCall,
              ...saved,
              timelineLengthMs: docRef.current.project.timelineLengthMs,
            })
          : saved;
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
                ...(double ? { double } : {}),
              },
            });
            if (partial) setError(tr("dubelNiepelny"));
            else if (double) setStatus(tr("dubelGotowy"));
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    }, { blocking: true });
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
    }, { blocking: true });
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
    setDoc((prev) => ({ ...prev, clips: prev.clips.map((c) => (c.id === clipId ? { ...c, gainDb } : c)) }));
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

  /** Tempo / pitch. A new tempo also changes the clip length, so the same part of the recording plays. */
  function saveClipPlayback(
    clipId: string,
    next: { stretch: number; pitchCents: number },
    opts?: { history?: boolean; durationMs?: number },
  ) {
    setError(null);
    setDoc((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id !== clipId
          ? c
          : {
              ...c,
              stretchRatio: next.stretch,
              pitchCents: next.pitchCents,
              durationMs:
                opts?.durationMs ??
                durationAfterStretchMs({
                  durationMs: c.durationMs,
                  fromStretch: c.stretchRatio ?? 1,
                  toStretch: next.stretch,
                  timelineStartMs: c.timelineStartMs,
                  timelineLengthMs: prev.project.timelineLengthMs,
                }),
            },
      ),
    }));
    enqueuePersist(async () => {
      const beforeClip = committedClip(clipId);
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
            message: json.error ?? tr("nieUdaloSieZapisacTempa"),
            code: json.code,
          });
          if (!failure.retryable || failure.kind === "conflict") setError(failure.message);
          return failure;
        }
        let saved = json.clip;
        let documentVersion = json.documentVersion;
        const fromStretch = beforeClip?.stretchRatio ?? 1;
        const toStretch = saved.stretchRatio ?? next.stretch;
        const durationMs =
          opts?.durationMs ??
          (fromStretch === toStretch
            ? saved.durationMs
            : durationAfterStretchMs({
                durationMs: saved.durationMs,
                fromStretch,
                toStretch,
                timelineStartMs: saved.timelineStartMs,
                timelineLengthMs: docRef.current.project.timelineLengthMs,
              }));
        const geometry = {
          kind: "set_geometry" as const,
          timelineStartMs: saved.timelineStartMs,
          durationMs,
          sourceOffsetMs: saved.sourceOffsetMs,
        };
        let lengthSaved = durationMs === saved.durationMs;
        if (!lengthSaved) {
          const res2 = await studioApiCall("PATCH", `/api/studio/projects/${projectId()}/clips/${clipId}`, {
            op: "set_geometry",
            timelineStartMs: geometry.timelineStartMs,
            durationMs,
            sourceOffsetMs: geometry.sourceOffsetMs,
            expectedDocumentVersion: documentVersion,
          });
          if (res2.ok && res2.json.clip && typeof res2.json.documentVersion === "number") {
            saved = res2.json.clip as StudioClipDto;
            documentVersion = res2.json.documentVersion;
            lengthSaved = true;
          }
        }
        return {
          ok: true as const,
          documentVersion,
          apply: () => {
            if (opts?.history !== false && beforeClip) {
              recordUndo({
                undo: {
                  kind: "clip_playback",
                  clipId,
                  stretch: fromStretch,
                  pitchCents: beforeClip.pitchCents ?? 0,
                  durationMs: beforeClip.durationMs,
                },
                redo: {
                  kind: "clip_playback",
                  clipId,
                  stretch: toStretch,
                  pitchCents: saved.pitchCents ?? next.pitchCents,
                  durationMs,
                },
              });
            }
            // The length did not go through yet: it stays in the queue on its own.
            if (!lengthSaved) persistClipGeometryCommit(clipId, geometry, { history: false });
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

  /** True when the action would change the locked Bit; says why nothing happened. */
  function beatLockBlocks(clip: StudioClipDto | null | undefined = selectedClip): boolean {
    if (!isClipLocked(clip, beatUnlocked)) return false;
    setStatus(tr("bitZablokowanyKrotko"));
    return true;
  }

  function restoreBeat(): void {
    const plan = beatRestorePlan(docRef.current.clips, fullBeatMs);
    if (!plan || recordingLocked) return;
    persistClipGeometryCommit(plan.clipId, {
      kind: "set_geometry",
      timelineStartMs: plan.timelineStartMs,
      durationMs: plan.durationMs,
      sourceOffsetMs: plan.sourceOffsetMs,
    });
  }

  function nudgeSelectedBy(deltaMs: number): void {
    if (!selectedClip || recordingLocked || pending || beatLockBlocks()) return;
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
    if (!clipId || beatLockBlocks()) return;
    setError(null);
    setFragmentConfirmDelete(false);
    const atTimelineMs = getPlayheadMs();
    if (!playheadInsideClip(selectedClip, atTimelineMs)) {
      setStatus(tr("glowicaPozaFragmentem"));
      return;
    }
    enqueuePersist(async () => {
      const beforeSplit = committedClip(clipId);
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
    }, { blocking: true });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") pointerFocusRef.current = false;
      // Handled by the focused part (automation point, BITEK, a dialog).
      if (event.defaultPrevented) return;
      // F9 types nothing, so it works also while a list or a field has the focus.
      if (event.key === "F9" && studioStep !== "master" && !event.repeat && studioModalState(document) !== "modal") {
        event.preventDefault();
        toggleMixerSurface();
        return;
      }
      if (isStudioTypingTarget(event.target)) return;
      const modal = studioModalState(document);
      if (modal === "modal") return;
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (
        !recordingLocked &&
        studioControlKeepsKey({
          target: event.target,
          key: event.key,
          focusedByPointer: pointerFocusRef.current,
        })
      ) {
        return;
      }

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
        // Holding the key must not start and stop the take again and again.
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        // First: Space must never scroll the page.
        event.preventDefault();
        if (pending && !recordingLockedRef.current) return;
        requestRecordRef.current("key");
        return;
      }
      if (transportAction === "play") {
        event.preventDefault();
        if (recordingLocked) return;
        if (transport.phase === "playing") transport.pause();
        else transport.play();
        return;
      }

      if (recordingLocked || pending || modal !== "none") return;

      if (event.key === "Escape") {
        if (!selectedClip) {
          if (mixerOpen && inspectorDesktopRail) closeMixerSurface();
          return;
        }
        setSelectedClipId(clearClipSelection());
        setConfirmDelete(false);
        setFragmentConfirmDelete(false);
        return;
      }

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
        transport.seek(songEndMs);
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
        userAdjustedZoomRef.current = true;
        zoomAtViewportCenter(zoomInPxPerMs(pxPerMsRef.current));
        return;
      }
      if (event.key === "-" || event.key === "_") {
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        userAdjustedZoomRef.current = true;
        zoomAtViewportCenter(zoomOutPxPerMs(pxPerMsRef.current));
      }
    }

    const onPointerDown = () => {
      pointerFocusRef.current = true;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
    // Intentional: handlers close over latest selected clip / length / pending / transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Phase 2 keyboard precision + 7.1.5.3
  }, [recordingLocked, pending, selectedClip, length, songEndMs, transport, mixerOpen, inspectorDesktopRail, studioStep]);

  function deleteSelectedClip(): void {
    const clipId = selectedClip?.id;
    if (!clipId || beatLockBlocks()) return;
    setError(null);
    enqueuePersist(async () => {
      const beforeDelete = committedClip(clipId);
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
    }, { blocking: true });
  }

  /** V1 / 7.1.6 — Duplicate Clip via CAS + serial orchestrator. */
  function duplicateSelectedClip(): void {
    const clipId = selectedClip?.id;
    if (!clipId || beatLockBlocks()) return;
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
    }, { blocking: true });
  }

  const conflictActive =
    persistSnap?.conflict === true ||
    (Boolean(error) &&
      (error!.includes("zmieniony") || error === FX_CHAIN_CONFLICT_UI_PL));

  const saveStatusLabel = conflictActive
    ? (error ?? persistSnap?.lastError ?? FX_CHAIN_CONFLICT_UI_PL)
    : persistSnap?.status === "SAVE_FAILED"
      ? (error ?? persistSnap.lastError ?? tr("nieZapisano"))
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
    onClearDirty: () => {
      persistRef.current?.clearDirty();
    },
    onSaveMute: (muted: boolean) => {
      saveClipMute(muted);
    },
    onMove: (timelineStartMs: number) => {
      if (beatLockBlocks()) return;
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
      if (beatLockBlocks()) return;
      const playheadMs = getPlayheadMs();
      if (!playheadInsideClip(selectedClip, playheadMs)) {
        setStatus(tl("Ustaw głowicę wewnątrz zaznaczonego fragmentu, aby przyciąć początek."));
        return;
      }
      patchClip({ op: "trim_left_to_playhead", playheadMs });
    },
    onTrimRightToPlayhead: () => {
      if (beatLockBlocks()) return;
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

  function renderFxEditor(target: FxPanelTarget, inline: boolean) {
    return target.role === "master" ? (
          <StudioFxChainEditor
            key="fx-master"
            inline={inline}
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
    ) : (
          <StudioFxChainEditor
            key={`fx-${target.trackId}`}
            inline={inline}
            role="track"
            projectId={doc.project.id}
            trackId={target.trackId}
            maxEffects={maxFxEffectsForTier(trackCapacity.premiumTier)}
            allowSidechain={sidechainForTier(trackCapacity.premiumTier)}
            chain={
              doc.tracks.find((t) => t.id === target.trackId)?.effectsChain ?? {
                schemaVersion: 1,
                effects: [],
              }
            }
            getExpectedDocumentVersion={expectedDocumentVersion}
            enqueuePersistAsync={enqueuePersistAsync}
            title={tr("efekty", { v0: doc.tracks.find((t) => t.id === target.trackId)?.name ?? tr("sciezka") })}
            vocalPresets={{ bpm: heardBpm }}
            trackClips={doc.clips.filter((c) => c.trackId === target.trackId)}
            onClose={() => setFxPanel(null)}
            onFxPersisted={(effectsChain, documentVersion) => {
              const trackId = target.trackId;
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
    );
  }

  /** Rendered once for the whole editor; StudioRecordSlot only shows it. Never unmounted while a take is in progress or undecided. */
  const recordPanelNode = recordHost && recordPanelMounted ? createPortal(
        <StudioRecordingPanel
          projectId={doc.project.id}
          getExpectedDocumentVersion={expectedDocumentVersion}
          enqueuePersistAsync={enqueuePersistAsync}
          onDocumentVersionAck={applyAckedDocumentVersion}
          recordRequest={transportRecordRequest}
          onRecordRequestHandled={() => setTransportRecordRequest(0)}
          tracks={doc.tracks}
          clips={doc.clips}
          embedded={!recordSimple}
          simple={recordSimple}
          visible={recordPanelVisible}
          planLimits={{
            sessionsPerDay: PLAN_POLICY[trackCapacity.premiumTier].recording.sessionsPerDay,
            maxTakeSeconds: PLAN_POLICY[trackCapacity.premiumTier].recording.maxTakeSeconds,
            takeHours: Math.round(PLAN_POLICY[trackCapacity.premiumTier].recording.takeTtlSeconds / 3600),
          }}
          samplesMode={onSampleTab}
          stemLimit={maxStemsForTier(trackCapacity.premiumTier)}
          trackLimit={maxTracks}
          droppedStems={droppedStems}
          onDroppedStemsDone={() => setDroppedStems(null)}
          onSaveTrackMidi={saveTrackMidi}
          focusRequest={recordFocus}
          onFocusRequestHandled={() => setRecordFocus(null)}
          preferredTrackId={activeSelectedTrackId}
          selectedClipId={activeSelectedId}
          lastScratchClipId={lastScratchClipId}
          onLastScratchClipIdChange={setLastScratchClipId}
          onHoldChange={setRecordHold}
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
          onClipUpdated={(clip, nextDocumentVersion) => {
            const before = committedDocRef.current.clips.find((c) => c.id === clip.id);
            applyPersistedDoc((prev) => ({
              ...prev,
              project: { ...prev.project, documentVersion: nextDocumentVersion },
              clips: prev.clips.map((c) => (c.id === clip.id ? clip : c)),
            }));
            if (before) {
              recordUndo({
                undo: { kind: "clip_scratch", clipId: clip.id, cueMs: before.scratchCueMs ?? 0, reverse: Boolean(before.scratchReverse), rate: before.scratchRate ?? 1 },
                redo: { kind: "clip_scratch", clipId: clip.id, cueMs: clip.scratchCueMs ?? 0, reverse: Boolean(clip.scratchReverse), rate: clip.scratchRate ?? 1 },
              });
            }
          }}
          onClipCreated={(clip, nextDocumentVersion, options) => {
            const removedIds = options?.removedClipIds ?? [];
            const replaced = committedDocRef.current.clips.filter((c) => removedIds.includes(c.id));
            applyPersistedDoc((prev) => ({
              ...prev,
              project: {
                ...prev.project,
                documentVersion: nextDocumentVersion,
              },
              clips: [...prev.clips.filter((c) => !removedIds.includes(c.id)), clip].sort(
                (a, b) => a.timelineStartMs - b.timelineStartMs,
              ),
            }));
            for (const old of replaced) {
              recordUndo({
                undo: { kind: "clip_restore", clip: old },
                redo: { kind: "clip_remove", clipId: old.id },
              });
            }
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
            if (!options?.stayOnRecord) {
              setInspectorPreferRecord(false);
              setInspectorTab("file");
            }
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
        />,
        recordHost,
      )
    : null;

  /** A restored mix version replaces the document: the undo history starts again. */
  function refreshDocument(next: StudioProjectDocument) {
    applyPersistedDoc(() => next);
    undoHistoryRef.current = EMPTY_STUDIO_UNDO_HISTORY;
    setUndoHistory(EMPTY_STUDIO_UNDO_HISTORY);
    undoAliasRef.current = new Map();
    setError(null);
  }
  async function flushBeforeRestore() {
    const snap = await flushPersist();
    return !snap?.unsaved;
  }
  function previewMasterGain(masterGainDb: number) {
    setDoc((prev) => ({
      ...prev,
      project: { ...prev.project, masterGainDb },
    }));
  }

  const spectrogramSection = selectedClip ? (
    <StudioClipSpectrogramSection
      key={selectedClip.id}
      clipId={selectedClip.id}
      projectId={doc.project.id}
      takeId={selectedClip.sourceKind === "TAKE" ? selectedClip.sourceTakeId : null}
      resolveUrl={() => resolveClipSourceUrl(selectedClip)}
    />
  ) : null;

  const beatSpeedSection =
    selectedTrack?.trackType === "BEAT" && activeSelectedTrackId === selectedTrack.id ? (
      <StudioBeatSpeed
        key={selectedTrack.id}
        baseBpm={doc.project.tempoBpm}
        beatClips={doc.clips.filter(isBeatClip)}
        hasRecordings={doc.clips.some((c) => !isBeatClip(c))}
        disabled={recordingLocked || pending}
        onApply={(clipId, next) => {
          transport.pause();
          saveClipPlayback(clipId, next);
        }}
      />
    ) : null;

  const inspectorContent = (
    <div
      className="min-h-0 flex-1 space-y-2 overflow-y-auto"
      data-testid="studio-inspector-content"
      data-inspector-context={inspectorContext}
    >
      <StudioGroupTabs
        active={activeGroup}
        recordingLocked={recordingLocked}
        onOpen={openGroup}
        hidden={recordSimple || !inspectorDesktopRail}
      />
      {recordSimple || !inspectorDesktopRail ? null : (
        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          {tInspector(inspectorContext)}
        </p>
      )}

      {beatSpeedSection}

      {inspectorContext === "record" ? <StudioRecordSlot host={recordHost} /> : null}

      {inspectorContext === "track" && selectedTrack ? (
        <TrackInspectorPanel
          track={selectedTrack}
          trackCount={trackCount}
          maxTracks={maxTracks}
          disabled={recordingLocked || pending}
          onRename={(name) => patchTrack(selectedTrack.id, { name })}
          onOpenEffects={() => openEffects({ role: "track", trackId: selectedTrack.id })}
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

      {inspectorContext === "clip" ? spectrogramSection : null}

      {inspectorContext === "effects" ? (
        <div className="space-y-2" data-testid="studio-inspector-effects">
          <p className="text-xs text-[var(--brd-mute)]">{tGroups("brzmienieOpis")}</p>
          <div className="grid grid-cols-2 gap-1" role="group" aria-label={tr("tabEffects")}>
            {(
              [
                { role: "track" as const, label: selectedTrack ? selectedTrack.name : tr("sciezka"), disabled: !selectedTrack },
                { role: "master" as const, label: "Master", disabled: false },
              ] as const
            ).map((item) => {
              const active = item.role === (selectedTrack ? fxInspectorRole : "master");
              return (
                <button
                  key={item.role}
                  type="button"
                  aria-pressed={active}
                  disabled={item.disabled}
                  className={`min-h-11 min-w-0 truncate rounded border px-2 text-xs disabled:opacity-50 ${
                    active
                      ? "border-[var(--brd-amber)] text-[var(--brd-ink)]"
                      : "border-[var(--brd-line)] text-[var(--brd-mute)]"
                  }`}
                  onClick={() => setFxInspectorRole(item.role)}
                >
                  {tl(item.label)}
                </button>
              );
            })}
          </div>
          {selectedTrack ? null : <p className="text-xs text-[var(--brd-mute)]">{tr("efektyWybierzSciezke")}</p>}
          {renderFxEditor(
            selectedTrack && fxInspectorRole === "track" ? { role: "track", trackId: selectedTrack.id } : { role: "master" },
            true,
          )}
        </div>
      ) : null}

      {inspectorContext === "file" ? (
        <StudioInspectorFilePanel
          clips={doc.clips}
          tracks={doc.tracks}
          beatTitle={doc.project.beatId ? (beatTitle ?? tr("bitProjektu")) : null}
          disabled={recordingLocked}
          onSelectClip={(clipId, trackId) => {
            setSelectedClipId(selectClipId(null, clipId));
            setSelectedTrackId(trackId);
            setMode("edit");
          }}
          onImport={() => {
            setInspectorPreferRecord(true);
            openInspectorOverlay();
          }}
          onChangeBeat={() => setBeatPickerOpen(true)}
        />
      ) : null}

      {inspectorContext === "text" ? (
        <StudioTextGroup
          projectId={doc.project.id}
          getExpectedDocumentVersion={expectedDocumentVersion}
          enqueuePersistAsync={enqueuePersistAsync}
          getPlayheadMs={getPlayheadMs}
          onSeek={transport.seek}
          onDocumentVersionAck={applyAckedDocumentVersion}
          tempoBpm={heardBpm}
          gridOriginMs={gridOriginMs}
        />
      ) : null}

      {inspectorContext === "add" ? (
        <div className="space-y-2" data-testid="studio-add-group">
          {atTrackCapacity && trackCapacity.premiumTier !== "GOLD" ? (
            // Plan lock with a bubble (hover/focus/tap) → plans; server enforces too.
            <LockedAction
              reason="plan"
              action="track"
              minTier={STUDIO_NEXT_TIER[trackCapacity.premiumTier]}
              testId="studio-add-track"
              buttonClassName="px-3"
              dataAttrs={{ "data-capacity": "full" }}
            >
              {tGroups("dodajSciezke")}
            </LockedAction>
          ) : (
            <StudioGroupRow
              testId="studio-add-track"
              title={tGroups("dodajSciezke")}
              hint={tGroups("dodajSciezkeOpis")}
              disabled={recordingLocked || pending || atTrackCapacity}
              onClick={() => {
                addTrack();
              }}
            />
          )}
          <p
            className="px-1 font-mono text-xs text-[var(--brd-mute)]"
            data-testid="studio-track-capacity"
            data-track-count={trackCount}
            data-max-tracks={maxTracks}
            data-premium-tier={trackCapacity.premiumTier}
          >
            {tl(formatStudioTrackCapacityLabel(trackCount, maxTracks))}
          </p>
          {showUpgradeCta && !storeApp ? (
            <Link
              href={STUDIO_TRACK_UPGRADE_HREF}
              data-testid="studio-track-upgrade-cta"
              className="inline-flex min-h-11 items-center px-1 text-xs font-medium text-[var(--brd-green)] underline-offset-4 hover:underline"
            >
              {tr("zmienPakiet")}
            </Link>
          ) : null}
          <StudioGroupRow testId="studio-add-vocal-file" title={tGroups("importWokal")} hint={tGroups("importWokalOpis")} onClick={() => focusRecordControl("importVocal")} />
          {maxStemsForTier(trackCapacity.premiumTier) > 0 ? (
            <StudioGroupRow testId="studio-add-stems" title={tGroups("stemy")} hint={tGroups("stemyOpis")} onClick={() => focusRecordControl("stems")} />
          ) : null}
          <StudioGroupRow
            testId="studio-add-samples"
            title={tGroups("sample")}
            hint={tGroups("sampleOpis")}
            onClick={() => openFeature("samples")}
          />
          <StudioGroupRow testId="studio-add-scratch" title={tGroups("scratch")} hint={tGroups("scratchOpis")} onClick={() => focusRecordControl("scratch")} />
        </div>
      ) : null}

      {inspectorContext === "more" ? (
        <div className="space-y-4" data-testid="studio-more-group">
          <StudioGroupSection title={tGroups("sekcjaMix")}>
            <StudioGroupRow testId="studio-more-mixer" title={tGroups("mixer")} hint={tGroups("mixerOpis")} onClick={openMixerSurface} />
            <div className="flex flex-wrap items-center gap-2" data-testid="studio-more-file">
              <StudioMixRevisionHistoryControl
                projectId={doc.project.id}
                tipDocumentVersion={doc.project.documentVersion}
                getExpectedDocumentVersion={expectedDocumentVersion}
                onDocumentRefreshed={refreshDocument}
                trackNames={Object.fromEntries(doc.tracks.map((t) => [t.id, t.name]))}
                onBeforeRestore={flushBeforeRestore}
                disabled={pending}
              />
              <StudioExportControl
                projectId={doc.project.id}
                getExpectedDocumentVersion={expectedDocumentVersion}
                planLocked={trackCapacity.premiumTier !== "GOLD"}
              />
            </div>
            <div className="studio-transport rounded px-2 py-1 [&_label]:!text-[11px] [&_label]:!text-[var(--tape-cream-soft)] [&_label_span_span]:!text-[var(--tape-amber)]" data-testid="studio-more-master">
              <StudioMixControl
                label={tr("master")}
                ariaLabel={tr("glosnoscMaster")}
                value={doc.project.masterGainDb}
                display={tr("db", { v0: doc.project.masterGainDb.toFixed(1) })}
                min={STUDIO_MASTER_GAIN_DB_MIN}
                max={STUDIO_MASTER_GAIN_DB_MAX}
                step={0.5}
                stacked
                disabled={pending}
                onLocalChange={previewMasterGain}
                onCommit={(masterGainDb) => patchMasterMix({ masterGainDb })}
              />
            </div>
          </StudioGroupSection>
          <StudioGroupSection title={tGroups("sekcjaOs")}>
            <Button
              type="button"
              size="sm"
              variant={snapPreset === "off" ? "outline" : "default"}
              className="min-h-11 w-full"
              data-testid="studio-more-snap"
              aria-pressed={snapPreset !== "off"}
              onClick={() => setSnapConfig((prev) => cycleStudioSnapConfig(prev))}
            >
              {tr("przyciaganie")}{" "}
              {snapPreset === "off"
                ? tr("przyciaganieWyl")
                : snapPreset === "beat"
                  ? tr("przyciaganieUderzenie")
                  : snapPreset === "bar"
                    ? tr("przyciaganieTakt")
                    : tl(studioSnapPresetLabel(snapPreset))}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 w-full"
              data-testid="studio-more-track-height"
              aria-pressed={viewPrefs.lanes === "low"}
              onClick={() => writeStudioViewPrefs(doc.project.id, { lanes: viewPrefs.lanes === "low" ? "tall" : "low" })}
            >
              {tr(viewPrefs.lanes === "low" ? "sciezkiNiskie" : "sciezkiWysokie")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 w-full"
              data-testid="studio-more-ruler"
              onClick={() => writeStudioViewPrefs(doc.project.id, { ruler: viewPrefs.ruler === "bars" ? "time" : "bars" })}
            >
              {tr(viewPrefs.ruler === "bars" ? "linijkaTakty" : "linijkaCzas")}
            </Button>
            {viewPrefs.ruler === "bars" && grid ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-11 w-full whitespace-normal"
                  data-testid="studio-more-grid-here"
                  onClick={() => {
                    // Keep bar 1 near the start of the beat: only the position inside one bar matters.
                    const barMs = grid.beatMs * grid.beatsPerBar;
                    const inBar = (((transport.getPlayheadMs() - beatFileStartMs) % barMs) + barMs) % barMs;
                    writeStudioViewPrefs(doc.project.id, { gridShiftMs: Math.round(inBar) });
                  }}
                >
                  {tr("taktTutaj")}
                </Button>
                {viewPrefs.gridShiftMs !== 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-11 w-full whitespace-normal"
                    data-testid="studio-more-grid-reset"
                    onClick={() => writeStudioViewPrefs(doc.project.id, { gridShiftMs: 0 })}
                  >
                    {tr("taktZBitu")}
                  </Button>
                ) : null}
                <p className="text-xs text-[var(--brd-mute)]">{tr("taktTutajOpis")}</p>
              </>
            ) : null}
            {/* A keyboard setting: nothing to set on a touch screen. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 w-full [@media(pointer:coarse)]:hidden"
              data-testid="studio-more-keyboard-mode"
              onClick={() => setStudioTransportKeyboardModeLive(transportKeyboardMode === "quick_rec" ? "standard_daw" : "quick_rec")}
            >
              {tGroups("spacja")}{tGroups(transportKeyboardMode === "quick_rec" ? "spacjaNagrywa" : "spacjaGra")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 w-full [@media(pointer:coarse)]:hidden"
              data-testid="studio-more-shortcuts"
              onClick={() => setShortcutsOpen(true)}
            >
              {tr("skrotyKlawiszowe")}
            </Button>
          </StudioGroupSection>
          {advancedRecord ? (
            <div className="xl:hidden">
              <StudioGroupRow
                testId="studio-more-simple-view"
                title={tGroups("widokProsty")}
                hint={tGroups("widokProstyOpis")}
                disabled={recordingLocked}
                onClick={() => {
                  if (!closeInspectorOverlay()) return;
                  setFxPanel(null);
                  setRecordFullView(false);
                }}
              />
            </div>
          ) : null}
          <StudioGroupSection title={tGroups("sekcjaProjekt")}>
            <StudioGroupRow testId="studio-more-track" title={tGroups("ustawieniaSciezki")} hint={tGroups("ustawieniaSciezkiOpis")} onClick={() => openTrackOrFiles("settings")} />
            <StudioGroupRow testId="studio-more-files" title={tGroups("pliki")} hint={tGroups("plikiOpis")} onClick={() => openTrackOrFiles("file")} />
          </StudioGroupSection>
        </div>
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
        className="studio-channel studio-channel-master sticky left-0 z-[1] flex w-[7.5rem] shrink-0 flex-col p-2 sm:w-[9.5rem]"
      >
        <p className="studio-scribble shrink-0 truncate text-xs font-semibold">{tr("master")}</p>
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
          onClick={() => openEffects({ role: "master" })}
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
            // 9.5rem = 3 × 44 px M/S/R + gaps + padding; narrower strips overlapped the next one.
            className="studio-channel flex w-[9.5rem] shrink-0 flex-col p-2"
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
            {/* Same height with and without the meter: selecting a strip must not move its sliders. */}
            <div className="mb-1 flex h-[4.5rem] shrink-0 flex-col justify-end overflow-hidden">
            {isSelected ? (
              <StudioTrackMeterLive trackName={track.name} />
            ) : (
              <div
                className="studio-vu-idle h-8"
                aria-hidden
              />
            )}
            </div>
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
                title={`${tr("wycisz")} · ${tl(track.name)}`}
                tone="mute"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => toggleTrackFlag(track.id, "muted")}
              />
              <StudioToggleChip
                active={track.solo}
                label="S"
                title={`${tr("solo")} · ${tl(track.name)}`}
                tone="solo"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => toggleTrackFlag(track.id, "solo")}
              />
              {isBeat ? null : (
              <StudioToggleChip
                active={track.recordArmed}
                label="R"
                title={`${tr("uzbrojenieNagrywania")} · ${tl(track.name)}`}
                tone="record"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => toggleTrackFlag(track.id, "recordArmed")}
              />
              )}
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
                openEffects({ role: "track", trackId: track.id });
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
      data-studio-groups={groupsShown ? "true" : undefined}
      className="studio-desk flex min-h-[calc(100dvh-3rem)] flex-col gap-0.5 overflow-x-clip max-lg:pb-[var(--bitek-dock-h,0px)] lg:pb-[min(var(--bitek-dock-h,0px),5.5rem)] max-sm:pb-[max(var(--bitek-dock-h,0px),5rem)]"
    >
      <header
        data-testid="studio-header"
        className="studio-brand-bar flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 pb-1"
      >
        {/* The Studio has no site header or bottom menu: this arrow is the way out (the leave guard covers it). */}
        <Link
          href="/studio"
          data-testid="studio-back"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[2px] border border-[var(--brd-line)] text-lg text-[var(--brd-ink)] hover:bg-[var(--brd-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
          aria-label={tGroups("wszystkieProjekty")}
          title={tGroups("wszystkieProjekty")}
        >
          ←
        </Link>
        <span className="studio-brand max-md:hidden">BitRymDym</span>
        <span className="studio-kicker max-lg:hidden">{tr("studioOnline")}</span>
        <StudioProjectTitle
          projectId={doc.project.id}
          title={doc.project.title}
          onRenamed={(title) => applyPersistedDoc((prev) => ({ ...prev, project: { ...prev.project, title } }))}
        />
      <div className="flex min-w-0 items-center gap-2 max-sm:ml-auto max-sm:max-w-[48%] sm:max-w-[50%] md:shrink">
        <span className="studio-gear-label max-sm:hidden">BIT</span>
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
        <StudioFullscreenToggle />
      </div>
        <StudioFeatureFinder
          fullViewAllowed={advancedRecord}
          disabled={recordingLocked}
          onPick={openFeature}
          className="shrink-0 max-lg:size-11 max-lg:justify-center max-lg:px-0 lg:ml-auto lg:w-56"
        />
      </header>

      <StudioStepNav
        studioStep={studioStep}
        onStepIntent={prefetchStudioStepPanels}
        onSampleTab={onSampleTab}
        showSamplesTab={onSampleTab || !(advancedRecord && recordFullView)}
        hasGroupBar={studioStep === "record"}
        recordingLocked={recordingLocked}
        canGoMix={canGoMix}
        songReady={autoMixMasterMaterial({ beatId: doc.project.beatId, tracks: doc.tracks, clips: doc.clips }).ready}
        advancedRecord={advancedRecord}
        recordFullView={recordFullView}
        onRecord={() => {
          setSampleTab(false);
          setStudioStep("record");
        }}
        onSamples={() => {
          if (studioStep !== "record") setStudioStep("record");
          setSampleTab(true);
        }}
        onMix={() => {
          setSampleTab(false);
          setStudioStep("mix");
        }}
        onMaster={
          masterOpenVersion === doc.project.documentVersion || mixReadyVersion === doc.project.documentVersion
            ? () => {
                setSampleTab(false);
                setStudioStep("master");
              }
            : undefined
        }
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
        simple={recordSimple && !onSampleTab}
        projectId={doc.project.id}
        trackNames={Object.fromEntries(doc.tracks.map((t) => [t.id, t.name]))}
        tipDocumentVersion={doc.project.documentVersion}
        getExpectedDocumentVersion={expectedDocumentVersion}
        onDocumentRefreshed={refreshDocument}
        onFlushPersist={flushBeforeRestore}
        onChooseBeat={() => setBeatPickerOpen(true)}
        onRecord={() => requestRecord("button")}
        recordState={
          recordHold === "arming" || recordHold === "capture"
            ? "recording"
            : recordHold === "saving"
              ? "busy"
              : "idle"
        }
        onRecordStop={() => requestRecord("button")}
        transportKeyboardMode={transportKeyboardMode}
        onTransportKeyboardModeChange={(mode) => {
          setStudioTransportKeyboardModeLive(mode);
        }}
        tempoBpm={heardBpm}
        timeSignatureNum={doc.project.timeSignatureNum}
        timeSignatureDen={doc.project.timeSignatureDen}
        durationMs={songEndMs}
        masterGainDb={doc.project.masterGainDb}
        pending={pending}
        saveStatusLabel={saveStatusLabel}
        saveIsError={Boolean(error) || persistSnap.status === "SAVE_FAILED"}
        conflictActive={conflictActive}
        onRetrySave={
          persistSnap.status === "SAVE_FAILED" && persistSnap.queued
            ? () => persistRef.current?.retryNow()
            : null
        }
        onMasterGainLocal={previewMasterGain}
        onMasterGainCommit={(masterGainDb) => {
          patchMasterMix({ masterGainDb });
        }}
        canUndo={undoHistory.past.length > 0 && !recordingLocked}
        canRedo={undoHistory.future.length > 0 && !recordingLocked}
        showFragmentTools={studioStep === "record"}
        toolsInGroups={groupsShown}
        clipToolsAtBottom={studioStep === "record"}
        timelineTools={
          groupsShown ? (
            <StudioEditToolbar
              timelineMode={timelineMode}
              recordingLocked={recordingLocked}
              onSeekMode={() => setMode("seek")}
              onEditMode={() => setMode("edit")}
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
                fitTimeline(timelineScrollRef.current);
              }}
              snapPreset={snapPreset}
              onSnapPreset={(preset) => setSnapConfig(snapConfigFromPreset(preset))}
              lowTracks={viewPrefs.lanes === "low"}
              onToggleTrackHeight={() =>
                writeStudioViewPrefs(doc.project.id, { lanes: viewPrefs.lanes === "low" ? "tall" : "low" })
              }
              mixerOpen={mixerOpen}
              onToggleMixer={toggleMixerSurface}
            />
          ) : null
        }
        onFragmentDetails={
          groupsShown
            ? () => {
                setInspectorTab("file");
                setInspectorPreferRecord(false);
                openInspectorOverlay();
              }
            : undefined
        }
        exportLocked={trackCapacity.premiumTier !== "GOLD"}
        fragmentClipId={activeSelectedId}
        fragmentEnabled={Boolean(selectedClip) && !recordingLocked}
        onUnlockBeat={isClipLocked(selectedClip, beatUnlocked) ? () => setBeatUnlocked(true) : null}
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
          nudgeSelectedBy(direction * beatDurationMs(heardBpm, doc.project.timeSignatureDen));
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
          if (!selectedClip || beatLockBlocks()) return;
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
          if (!selectedClip || beatLockBlocks()) return;
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

      {studioStep === "record" && trackMenuTrack && trackMenuTrack.trackType !== "BEAT" ? (
        <StudioTrackMenu
          trackId={trackMenuTrack.id}
          trackName={trackMenuTrack.name}
          onClose={() => setTrackMenuId(null)}
        >
          <TrackNameField
            key={trackMenuTrack.name}
            name={trackMenuTrack.name}
            disabled={recordingLocked || pending}
            onRename={(name) => patchTrack(trackMenuTrack.id, { name })}
          />
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
              saveTrackMidi(trackMenuTrack.id, midiPhraseAt(getPlayheadMs()));
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
              saveTrackMidi(trackMenuTrack.id, bassLineAt(getPlayheadMs(),heardBpm));
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
              saveTrackMidi(trackMenuTrack.id, drumPatternAt(getPlayheadMs(),heardBpm));
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
        </StudioTrackMenu>
      ) : null}

      {trackPendingDelete ? (
        <StudioDeleteTrackDialog
          trackName={trackPendingDelete.name}
          disabled={recordingLocked || pending}
          onCancel={() => setConfirmDeleteTrackId(null)}
          onConfirm={() => {
            setConfirmDeleteTrackId(null);
            deleteTrack(trackPendingDelete.id);
          }}
        />
      ) : null}

      {recordingLocked ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          {tr("trybNagrywaniaEdycjaKlipow")}
        </p>
      ) : null}
      {(recordHold === "decision" || recordHold === "retry") && !(recordPanelVisible && !onSampleTab) ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded border border-[var(--brd-amber)] px-3 py-2 text-sm text-[var(--brd-ink)]"
          role="status"
          data-testid="studio-take-waiting"
        >
          <span>{tr(recordHold === "decision" ? "nagranieCzeka" : "nagranieNiewyslane")}</span>
          <Button type="button" size="sm" className="min-h-10" onClick={showRecordPanel}>
            {tr("pokazNagranie")}
          </Button>
        </div>
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
      <StudioLeaveGuardDialog
        open={saveLeaveGuard.open}
        onStay={saveLeaveGuard.stay}
        onLeave={saveLeaveGuard.leave}
        title={tr("niezapisaneTytul")}
        body={tr("niezapisaneOpis")}
      />

      <TakeRecordingRecoveryBanner
        surface="STUDIO"
        scopeId={doc.project.id}
        authenticated
        refreshKey={recoveryRefreshKey}
        hidden={recordingLocked}
        onSaved={(takeId) => {
          setRecoverySavedKey((key) => key + 1);
          adoptRecoveredTake(doc.project.id, takeId);
        }}
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
        recordContext={studioStep === "record" || recordingLocked}
        inspectorSheetOpen={inspectorOverlayOpen && !inspectorDesktopRail && !recordSimple}
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
            maxEffects={maxFxEffectsForTier(trackCapacity.premiumTier)}
            allowSidechain={sidechainForTier(trackCapacity.premiumTier)}
            onApplyFxOps={async (ops, description) => (await applyMixAutofix(ops, description)).ok}
            onApplyMasterProposal={studioStep === "master" ? (key, value) => masterApplyRef.current?.(key, value) : undefined}
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
          onMasterReady={setMixReadyVersion}
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
          onSaveTrackMidi={saveTrackMidi}
          onOpenMixer={toggleMixerSurface}
          onAbOverride={onMixAbOverride}
          onBitekBubble={setMixBubble}
          onBitekNote={(content: string, meta: Record<string, unknown>) => bitekStore.append([{ kind: "fix", content, meta }])}
          chatContextRef={mixChatContextRef}
        />
      ) : (
        <>

      <div className={`flex min-h-0 flex-col gap-3 lg:items-start ${recordSimple ? "lg:flex-row" : "xl:flex-row"}`}>
        {recordSimple ? (
        <div
          data-testid="studio-record-simple"
          className={`flex flex-col gap-2 sm:max-lg:order-2 lg:order-2 lg:max-h-[max(30rem,calc(100dvh-17rem))] lg:shrink-0 lg:overflow-y-auto lg:rounded lg:border lg:border-[var(--brd-line)] lg:bg-[var(--brd-paper)] lg:p-3 ${
            onSampleTab ? "lg:w-[24rem] xl:w-[30rem]" : "lg:w-[20rem] xl:w-[24rem]"
          }`}
        >
          {inspectorContent}
          {recordingLocked ? null : spectrogramSection}
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
        ) : null}
        <div className={`min-w-0 max-xl:w-full xl:order-1 xl:w-full ${recordSimple ? "sm:max-lg:order-1 lg:order-1 lg:flex-1" : "flex-1"}`}>
          {!recordingLocked && beatRestorePlan(doc.clips, fullBeatMs) ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border border-[var(--brd-amber)] px-2 py-1 text-xs text-[var(--brd-ink)]"
              role="status"
              data-testid="studio-beat-changed"
            >
              <span>{tr("bitZmieniony")}</span>
              <Button type="button" size="sm" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={restoreBeat}>
                {tr("przywrocBit")}
              </Button>
            </div>
          ) : null}
          <StudioTimeline
            tracks={doc.tracks}
            clips={doc.clips}
            timelineLengthMs={length}
            songEndMs={songEndMs}
            markers={doc.markers}
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
                  laneHeightPx={laneHeightPx}
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
                beatUnlocked={beatUnlocked}
                onToggleBeatLock={() => setBeatUnlocked((value) => !value)}
                menuOpen={trackMenuId === track.id}
                onSelect={(id) => {
                  // A tap on the Bit track opens its menu with "Tempo bitu", also a second tap on a closed sheet.
                  const opensSheet = track.trackType === "BEAT" && !recordSimple && !inspectorDesktopRail && !recordingLocked;
                  setSelectedTrackId(opensSheet ? track.id : id);
                  if (opensSheet) openInspectorOverlay();
                }}
                onToggleMenu={() => setTrackMenuId((prev) => (prev === track.id ? null : track.id))}
                patchTrack={patchTrack}
                onToggleFlag={toggleTrackFlag}
                reorder={reorder}
                setDoc={setDoc}
                heightPx={laneHeightPx}
                low={viewPrefs.lanes === "low"}
              />
            )}
            onSeek={seekSnapped}
            onDropFiles={handleTimelineFileDrop}
            onSelectClip={(id) => {
              if (recordingLocked) return;
              setInspectorPreferRecord(
                studioPreferRecordAfterTimelineSelect({
                  scratchSessionActive: lastScratchClipId != null,
                }),
              );
              setSelectedClipId(selectClipId(activeSelectedId, id));
              setInspectorTab("file");
              const clip = doc.clips.find((c) => c.id === id);
              if (clip) setSelectedTrackId(clip.trackId);
              setMode("edit");
              setConfirmDelete(false);
              setFragmentConfirmDelete(false);
            }}
            onClearSelection={() => {
              if (recordingLocked) return;
              setSelectedClipId(clearClipSelection());
              setMode("seek");
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
            grid={grid}
            rulerMode={viewPrefs.ruler}
            laneHeightPx={laneHeightPx}
            beatLocked={!beatUnlocked}
            onCommitClipGeometry={(clipId, commit) => {
              if (recordingLocked || beatLockBlocks(doc.clips.find((c) => c.id === clipId))) return;
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
          className="hidden w-[320px] shrink-0 flex-col gap-1.5 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 shadow-sm xl:order-2 xl:flex xl:max-h-[max(30rem,calc(100dvh-17rem))] 2xl:w-[360px]"
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

      {shortcutsOpen ? (
        <StudioShortcutsDialog keyboardMode={transportKeyboardMode} onClose={() => setShortcutsOpen(false)} />
      ) : null}

      {fxPanel !== null ? (
      <StudioFxSheet
        open
        onClose={() => setFxPanel(null)}
      >
        {renderFxEditor(fxPanel, false)}
      </StudioFxSheet>
      ) : null}
      {groupsShown ? (
        <StudioDockBar active={activeGroup} recordingLocked={recordingLocked} onOpen={openGroup} />
      ) : null}
      {simpleDock ? (
        <StudioDockBar
          active={simpleGroup ?? (onSampleTab ? "add" : "record")}
          recordingLocked={recordingLocked}
          onOpen={openSimpleGroup}
        />
      ) : null}
      {simpleDock && simpleGroup && !inspectorDesktopRail ? (
        <StudioInspectorOverlay
          open
          context={simpleGroup === "sound" ? "effects" : simpleGroup}
          panelId={inspectorPanelId}
          onClose={() => setSimpleGroup(null)}
        >
          <div className="space-y-2" data-testid={`studio-simple-group-${simpleGroup}`}>
            {simpleGroup === "sound" ? (
              <>
                <p className="text-sm text-[var(--brd-ink-soft)]">{tGroups("prosteBrzmienieOpis")}</p>
                <StudioGroupRow testId="studio-simple-mix" title={tGroups("doMixu")} hint={canGoMix ? undefined : tGroups("najpierwWokal")} disabled={!canGoMix} onClick={goToMix} />
                {advancedRecord ? (
                  <StudioGroupRow testId="studio-simple-full-sound" title={tGroups("efektyPrzyNagraniu")} hint={tGroups("wPelnymWidoku")} onClick={() => openFullViewGroup("sound")} />
                ) : (
                  <p className="text-xs text-[var(--brd-mute)]">{tGroups("efektyPrzyNagraniuOdSilver")}</p>
                )}
              </>
            ) : null}
            {simpleGroup === "text" ? (
              <StudioLyricsCard projectId={doc.project.id} getPlayheadMs={getPlayheadMs} mode="single" loopStartMs={null} punchLine={null} />
            ) : null}
            {simpleGroup === "add" ? (
              <>
                <StudioGroupRow
                  testId="studio-simple-vocal-file"
                  title={tGroups("importWokal")}
                  hint={tGroups("importWokalOpis")}
                  onClick={() => {
                    setSimpleGroup(null);
                    setSampleTab(false);
                    focusRecordControl("importVocal", true);
                  }}
                />
                <StudioGroupRow testId="studio-simple-samples" title={tGroups("sample")} hint={tGroups("sampleOpis")} onClick={() => openFeature("samples")} />
              </>
            ) : null}
            {simpleGroup === "more" ? (
              <>
                <StudioGroupRow testId="studio-simple-more-mix" title={tGroups("doMixu")} hint={canGoMix ? tGroups("doMixuOpis") : tGroups("najpierwWokal")} disabled={!canGoMix} onClick={goToMix} />
                <StudioGroupRow
                  testId="studio-simple-beat"
                  title={tGroups("zmienBit")}
                  onClick={() => {
                    setSimpleGroup(null);
                    setBeatPickerOpen(true);
                  }}
                />
                {advancedRecord ? (
                  <StudioGroupRow testId="studio-simple-full-view" title={tGroups("pelnyWidok")} hint={tGroups("pelnyWidokOpis")} onClick={() => openFullViewGroup(null)} />
                ) : null}
              </>
            ) : null}
          </div>
        </StudioInspectorOverlay>
      ) : null}
      <StudioLazyPanelsIdlePrefetch />
      {recordPanelNode}
    </div>
  );
}
