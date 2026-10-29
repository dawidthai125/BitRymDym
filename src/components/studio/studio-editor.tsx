"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useTranslations } from "next-intl";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/button";
import {
  StudioFxChainEditor,
  StudioFxSheet,
} from "@/components/studio/studio-fx-chain-editor";
import { StudioMasterMeter } from "@/components/studio/studio-master-meter";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioBeatPicker } from "@/components/studio/studio-beat-picker";
import { StudioClipLaneItem } from "@/components/studio/studio-clip-lane";
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
import { StudioRecordingPanel } from "@/components/studio/studio-recording-panel";
import { TakeRecordingRecoveryBanner } from "@/components/takes/take-recording-recovery-banner";
import { StudioExportControl } from "@/components/studio/studio-export-control";
import { StudioEditToolbar } from "@/components/studio/studio-edit-toolbar";
import { StudioMixRevisionHistoryControl } from "@/components/studio/studio-mix-revision-history-control";
import type { StudioClipEditCommit } from "@/lib/studio/studio-clip-edit-preview";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import { StudioTrackMeter } from "@/components/studio/studio-track-meter";
import {
  StudioTransportProvider,
  useStudioTransportControls,
  useStudioTransportMeters,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import {
  FX_CHAIN_CONFLICT_UI_PL,
  studioFxEntryLabel,
} from "@/lib/studio/studio-fx-chain";
import {
  beatRefMatchesProjectSsot,
  resolvePrimaryBeatRef,
} from "@/lib/studio/studio-beat-audio";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  buildStudioClipFadesPatchBody,
  interpretStudioClipFadesPersistResponse,
  studioClipFadesOverlapHint,
} from "@/lib/studio/studio-clip-fade";
import {
  buildStudioClipGainPatchBody,
  buildStudioClipMutePatchBody,
  interpretStudioClipMixPersistResponse,
  STUDIO_CLIP_GAIN_DB_MAX,
  STUDIO_CLIP_GAIN_DB_MIN,
} from "@/lib/studio/studio-clip-mix";
import type {
  StudioClipDto,
  StudioProjectDocument,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  buildTimelineRulerTicks,
  clearClipSelection,
  clampPxPerMs,
  contentWidthPx,
  createDefaultSnapConfig,
  cycleStudioSnapConfig,
  fitPxPerMs,
  msToPx,
  nudgeClipTimelineStartMs,
  pxToMs,
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
  canAddStudioTrack,
  formatStudioTrackCapacityLabel,
  shouldShowStudioTrackUpgradeCta,
} from "@/lib/studio/studio-track-capacity";
import { StudioGlyph, StudioRecLamp } from "@/components/studio/studio-glyphs";
import { labelStudioTrackType } from "@/lib/ui/labels";
import type { PremiumTier } from "@/types/premium";

type TimelineMode = "seek" | "edit";
type FxPanelTarget =
  | { role: "master" }
  | { role: "track"; trackId: string };

/** Phase 6 — server-resolved capacity SSOT (limits.studioMaxTracks). */
export type StudioTrackCapacityProps = {
  maxTracks: number;
  premiumTier: PremiumTier;
};

/**
 * Visual Parity V2 — denser DAW lanes (header vol/pan + M/S/R keep min-h-11).
 * Clip geometry SSOT unchanged; height is presentation only.
 */
const STUDIO_DAW_LANE_HEIGHT_PX = 128;
const STUDIO_DAW_HEADER_WIDTH_CLASS = "w-[220px] sm:w-[240px]";
/** Phase 7.1.1 — primary track chips ≥44px hit area (visual stays compact). */
const STUDIO_DAW_CHIP_CLASS = "h-11 min-h-11 min-w-11 w-11 px-0";
/** Track gain bounds — same as Mixer strips. */
const STUDIO_TRACK_GAIN_DB_MIN = -24;
const STUDIO_TRACK_GAIN_DB_MAX = 12;

export function StudioEditor({
  initialDocument,
  trackCapacity,
}: {
  initialDocument: StudioProjectDocument;
  trackCapacity: StudioTrackCapacityProps;
}) {
  const [doc, setDoc] = useState(initialDocument);
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
    () => ({
      timelineLengthMs: doc.project.timelineLengthMs,
      masterGainDb: doc.project.masterGainDb,
      masterPan: doc.project.masterPan,
      masterFxChain: doc.project.masterFxChain,
      // AUD-01 SSOT — schedule path rejects mismatched BEAT_REF via this field.
      projectBeatId: doc.project.beatId,
      tracks: doc.tracks.map((t) => ({
        id: t.id,
        gainDb: t.gainDb,
        pan: t.pan,
        muted: t.muted,
        solo: t.solo,
        effectsChain: t.effectsChain,
      })),
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
        })),
    }),
    [doc],
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
      />
    </StudioTransportProvider>
  );
}

function StudioEditorInner({
  doc,
  setDoc,
  trackCapacity,
}: {
  doc: StudioProjectDocument;
  setDoc: Dispatch<SetStateAction<StudioProjectDocument>>;
  trackCapacity: StudioTrackCapacityProps;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
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
  /** Phase 5 — pending track delete confirmation (track id). */
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<
    string | null
  >(null);
  /** Phase 6 — open ⋮ menu for a non-BEAT track. */
  const [trackMenuId, setTrackMenuId] = useState<string | null>(null);
  const [recordingLocked, setRecordingLocked] = useState(false);
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
  const trackCount = doc.tracks.length;
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
  const inspectorContext = deriveStudioInspectorContext({
    recordingActive: recordingContextActive,
    selectedClipId: activeSelectedId,
    selectedTrackId: activeSelectedTrackId,
  });

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
      return next;
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
      const next = fitPxPerMs(length, viewport);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: length + mount only
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
  ): void {
    setError(null);
    enqueuePersist(async () => {
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

  function patchTrack(trackId: string, body: Record<string, unknown>): void {
    setError(null);
    enqueuePersist(async () => {
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

  function patchMasterMix(body: {
    masterGainDb?: number;
    masterPan?: number;
  }): void {
    setError(null);
    enqueuePersist(async () => {
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
          },
        };
      } catch {
        return classifyPersistNetworkFailure();
      }
    });
  }

  /** Phase 6 / 7.1.6 — duplicate track via CAS + serial orchestrator. */
  function duplicateTrack(trackId: string): void {
    setError(null);
    setTrackMenuId(null);
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
  function saveClipFades(fadeInMs: number, fadeOutMs: number) {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    enqueuePersist(async () => {
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
  function saveClipGain(gainDb: number) {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    enqueuePersist(async () => {
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
  function saveClipMute(muted: boolean) {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    enqueuePersist(async () => {
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

  function splitSelectedAtPlayhead(): void {
    const clipId = selectedClip?.id;
    if (!clipId) return;
    setError(null);
    const atTimelineMs = getPlayheadMs();
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
      if (recordingLocked || pending) return;

      // Phase 7.1.5.3 — minimal transport shortcuts (Space required; Home/End if safe).
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (transport.phase === "playing") transport.pause();
        else transport.play();
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
        const next = nudgeClipTimelineStartMs({
          timelineStartMs: selectedClip.timelineStartMs,
          durationMs: selectedClip.durationMs,
          timelineLengthMs: length,
          deltaMs: sign * step,
        });
        if (next === selectedClip.timelineStartMs) return;
        // Nudge bypasses snap — micro-timing (±1 / ±10 / ±20 ms).
        persistClipMove(selectedClip.id, next, {
          applySnapGrid: false,
        });
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
            setConfirmDelete(false);
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
      : persistSnap
        ? persistSnap.label
        : pending
          ? tr("zapisywanie")
          : status
            ? status
            : "Gotowe";

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
      patchClip({
        op: "trim_left_to_playhead",
        playheadMs: getPlayheadMs(),
      });
    },
    onTrimRightToPlayhead: () => {
      patchClip({
        op: "trim_right_to_playhead",
        playheadMs: getPlayheadMs(),
      });
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
        className="grid grid-cols-4 gap-1 border-b border-[var(--brd-line)] pb-2"
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
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {tInspector(inspectorContext)}
      </p>

      {inspectorContext === "record" ? (
        <StudioRecordingPanel
          projectId={doc.project.id}
          getExpectedDocumentVersion={expectedDocumentVersion}
          enqueuePersistAsync={enqueuePersistAsync}
          onDocumentVersionAck={applyAckedDocumentVersion}
          tracks={doc.tracks}
          embedded
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
      className="flex min-h-[calc(100dvh-7rem)] flex-col gap-0.5 overflow-x-hidden"
    >
      <header
        data-testid="studio-header"
        className="flex min-h-10 items-center border-b border-[var(--brd-line)] pb-0.5"
      >
        <h1 className="brd-display truncate text-xl leading-none tracking-tight sm:text-2xl">
          {tl(doc.project.title)}
        </h1>
      </header>

      <StudioTransportBar
        projectId={doc.project.id}
        tipDocumentVersion={doc.project.documentVersion}
        getExpectedDocumentVersion={expectedDocumentVersion}
        onDocumentRefreshed={(next) => {
          applyPersistedDoc(() => next);
          setError(null);
        }}
        onChooseBeat={() => setBeatPickerOpen(true)}
        onRecord={() => {
          setInspectorPreferRecord(true);
          openInspectorOverlay();
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
      />

      <StudioBeatPicker
        projectId={doc.project.id}
        open={beatPickerOpen}
        onClose={() => setBeatPickerOpen(false)}
        getExpectedDocumentVersion={expectedDocumentVersion}
        enqueuePersistAsync={enqueuePersistAsync}
        onAttached={(document) => {
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
              length,
              typeof viewport === "number" && viewport > 0 ? viewport : 360,
            ),
          );
        }}
      />

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
            renderTrackHeader={(track, index) => {
              const isSelected = activeSelectedTrackId === track.id;
              const isBeat = track.trackType === "BEAT";
              const typeLabel = labelStudioTrackType(track.trackType);
              return (
                <div
                  key={track.id}
                  data-testid="studio-track-header"
                  data-track-id={track.id}
                  data-track-type={track.trackType}
                  data-selected={isSelected ? "true" : "false"}
                  className="studio-track-strip flex flex-col justify-center gap-0.5 border-b border-[var(--brd-line)] px-1 py-0.5"
                  style={{ height: STUDIO_DAW_LANE_HEIGHT_PX }}
                >
                  {/*
                    Mobile: 220px header cannot fit name + M/S/R + ↑↓⋮ (6×44).
                    Row1 = name (min 4.5rem) + M/S/R; row2 = reorder/menu + mix.
                  */}
                  <div className="flex min-h-11 items-center gap-0.5">
                    <button
                      type="button"
                      className="min-h-11 min-w-[4.5rem] flex-1 truncate rounded-sm px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                      aria-pressed={isSelected}
                      aria-label={
                        tl(isSelected
                          ? tr("odznaczSciezke", { v0: track.name })
                          : tr("wybierzSciezke", { v0: track.name }))
                      }
                      data-testid="studio-track-header-select"
                      onClick={() =>
                        setSelectedTrackId(isSelected ? null : track.id)
                      }
                    >
                      <span className="block truncate text-xs font-medium text-[var(--brd-ink)]">
                        {tl(track.name)}
                      </span>
                      <span className="studio-type-label mt-0.5 inline-block max-w-full truncate font-mono text-[9px] uppercase tracking-[0.12em]">
                        {tl(isBeat ? labelStudioTrackType("BEAT") : typeLabel)}
                      </span>
                    </button>
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
                  <div className="flex min-h-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-9 min-h-9 min-w-9 shrink-0 px-0 sm:h-11 sm:min-h-11 sm:min-w-11"
                      disabled={pending || index === 0}
                      title={tr("przeniesWGore")}
                      aria-label={tr("przeniesSciezkeWGore")}
                      onClick={() => {
                        reorder(track.id, "up");
                      }}
                    >
                      <StudioGlyph name="up" className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-9 min-h-9 min-w-9 shrink-0 px-0 sm:h-11 sm:min-h-11 sm:min-w-11"
                      disabled={pending || index === doc.tracks.length - 1}
                      title={tr("przeniesWDol")}
                      aria-label={tr("przeniesSciezkeWDol")}
                      onClick={() => {
                        reorder(track.id, "down");
                      }}
                    >
                      <StudioGlyph name="down" className="size-3.5" />
                    </Button>
                    {!isBeat ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-9 min-h-9 min-w-9 shrink-0 px-0 sm:h-11 sm:min-h-11 sm:min-w-11"
                        data-testid="studio-track-menu"
                        data-track-id={track.id}
                        disabled={recordingLocked || pending}
                        title={tr("menuSciezki")}
                        aria-label={tr("menuSciezki2", { v0: track.name })}
                        aria-expanded={trackMenuId === track.id}
                        onClick={() =>
                          setTrackMenuId((prev) =>
                            prev === track.id ? null : track.id,
                          )
                        }
                      >
                        <StudioGlyph name="more" className="size-3.5" />
                      </Button>
                    ) : null}
                    <div
                      className="grid min-w-0 flex-1 grid-cols-2 gap-1"
                      data-testid="studio-track-header-mix"
                    >
                    <StudioMixControl
                      label={tr("vol")}
                      ariaLabel={tr("glosnoscSciezki", { v0: track.name })}
                      value={track.gainDb}
                      display={`${track.gainDb.toFixed(0)}`}
                      min={STUDIO_TRACK_GAIN_DB_MIN}
                      max={STUDIO_TRACK_GAIN_DB_MAX}
                      step={0.5}
                      compact
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
                      display={track.pan.toFixed(1)}
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
                    </div>
                  </div>
                </div>
              );
            }}
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

        <aside
          data-testid="studio-inspector-desktop"
          data-studio-inspector="desktop"
          data-inspector-context={inspectorContext}
          className="hidden w-[300px] shrink-0 flex-col gap-1.5 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 shadow-sm xl:flex"
          aria-label={tInspector(inspectorContext)}
        >
          {inspectorDesktopRail ? inspectorContent : null}
        </aside>
      </div>

      <StudioInspectorOverlay
        open={inspectorOverlayOpen && !inspectorDesktopRail}
        context={inspectorContext}
        panelId={inspectorPanelId}
        onClose={closeInspectorOverlay}
        closeBlockedMessage={
          tl(inspectorCloseRejected && recordingLocked
            ? tInspector("closeBlocked")
            : null)
        }
      >
        {inspectorContent}
      </StudioInspectorOverlay>

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

      <StudioFxSheet
        open={fxPanel !== null}
        onClose={() => setFxPanel(null)}
      >
        {fxPanel?.role === "master" ? (
          <StudioFxChainEditor
            role="master"
            projectId={doc.project.id}
            chain={doc.project.masterFxChain}
            getExpectedDocumentVersion={expectedDocumentVersion}
            enqueuePersistAsync={enqueuePersistAsync}
            title={tr("masterEfekty")}
            onClose={() => setFxPanel(null)}
            onFxPersisted={(masterFxChain, documentVersion) =>
              applyPersistedDoc((prev) => ({
                ...prev,
                project: {
                  ...prev.project,
                  documentVersion,
                  masterFxChain,
                },
              }))
            }
          />
        ) : null}
        {fxPanel?.role === "track" ? (
          <StudioFxChainEditor
            role="track"
            projectId={doc.project.id}
            trackId={fxPanel.trackId}
            chain={
              doc.tracks.find((t) => t.id === fxPanel.trackId)?.effectsChain ?? {
                schemaVersion: 1,
                effects: [],
              }
            }
            getExpectedDocumentVersion={expectedDocumentVersion}
            enqueuePersistAsync={enqueuePersistAsync}
            title={tr("efekty", { v0: doc.tracks.find((t) => t.id === fxPanel.trackId)?.name ?? tr("sciezka") })}
            onClose={() => setFxPanel(null)}
            onFxPersisted={(effectsChain, documentVersion) =>
              applyPersistedDoc((prev) => ({
                ...prev,
                project: { ...prev.project, documentVersion },
                tracks: prev.tracks.map((t) =>
                  t.id === fxPanel.trackId ? { ...t, effectsChain } : t,
                ),
              }))
            }
          />
        ) : null}
      </StudioFxSheet>
    </div>
  );
}

function TrackInspectorPanel({
  track,
  trackCount,
  maxTracks,
  onOpenEffects,
  onOpenRecord,
}: {
  track: StudioTrackDto;
  trackCount: number;
  maxTracks: number;
  onOpenEffects: () => void;
  onOpenRecord: () => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const isBeat = track.trackType === "BEAT";
  return (
    <div className="space-y-3" data-testid="studio-inspector-track">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--brd-ink)]">{tl(track.name)}</p>
        <p className="text-xs text-[var(--brd-mute)]">
          {tl(labelStudioTrackType(track.trackType))}
          {tl(isBeat ? tr("bitProjektuChroniony") : "")}
        </p>
        <p className="font-mono text-xs tabular-nums text-[var(--brd-mute)]">
          {tl(formatStudioTrackCapacityLabel(trackCount, maxTracks))}
        </p>
      </div>

      <div
        className="space-y-1 rounded border border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]"
        aria-label={tr("stanSciezkiSkrot")}
      >
        <p>
          M: {tl(track.muted ? "wyciszona" : "otwarta")} · S:{" "}
          {tl(track.solo ? "solo" : "—")} · R:{" "}
          {tl(track.recordArmed ? "uzbrojona" : "—")}
        </p>
        <p className="font-mono tabular-nums">
          {tr("gain")}{" "}{tl(track.gainDb.toFixed(1))} {tr("dbPan")}{" "}{tl(track.pan.toFixed(2))}
        </p>
        <p>
          {tr("mSRVol")}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full"
        aria-label={tr("efektySciezki", { v0: track.name })}
        data-testid="studio-inspector-track-fx"
        onClick={onOpenEffects}
      >
        {tl(studioFxEntryLabel(track.effectsChain))}
      </Button>

      {!isBeat ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full"
          onClick={onOpenRecord}
        >
          {tr("nagrajNaTejSciezce")}
        </Button>
      ) : null}
    </div>
  );
}

function ClipEditPanel({
  clip,
  playheadMs,
  timelineLengthMs,
  pending,
  confirmDelete,
  onConfirmDeleteChange,
  onClearSelection,
  onSaveFades,
  onSaveGain,
  onFlushPersist,
  onMarkDirty,
  onSaveMute,
  onMove,
  onTrimLeftToPlayhead,
  onTrimRightToPlayhead,
  onSplit,
  onDuplicate,
  onDelete,
}: {
  clip: StudioClipDto | null;
  playheadMs: number;
  timelineLengthMs: number;
  pending: boolean;
  confirmDelete: boolean;
  onConfirmDeleteChange: (next: boolean) => void;
  onClearSelection: () => void;
  onSaveFades: (fadeInMs: number, fadeOutMs: number) => void;
  onSaveGain: (gainDb: number) => void;
  onFlushPersist: () => void;
  onMarkDirty: () => void;
  onSaveMute: (muted: boolean) => void;
  onMove: (timelineStartMs: number) => void;
  onTrimLeftToPlayhead: () => void;
  onTrimRightToPlayhead: () => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const [draftStart, setDraftStart] = useState<number | null>(null);
  const fadeBaselineKey = clip
    ? `${clip.id}:${clip.fadeInMs}:${clip.fadeOutMs}`
    : "";
  const [fadeEdit, setFadeEdit] = useState<{
    baselineKey: string;
    fadeInMs: number;
    fadeOutMs: number;
  } | null>(null);
  const gainBaselineKey = clip ? `${clip.id}:${clip.gainDb}` : "";
  const [gainEdit, setGainEdit] = useState<{
    baselineKey: string;
    gainDb: number;
  } | null>(null);
  const maxStart = clip
    ? Math.max(0, timelineLengthMs - clip.durationMs)
    : 0;
  const startValue = clip
    ? (draftStart ?? Math.min(clip.timelineStartMs, maxStart))
    : 0;
  const activeFadeEdit =
    fadeEdit && fadeEdit.baselineKey === fadeBaselineKey ? fadeEdit : null;
  const draftFadeIn = activeFadeEdit?.fadeInMs ?? clip?.fadeInMs ?? 0;
  const draftFadeOut = activeFadeEdit?.fadeOutMs ?? clip?.fadeOutMs ?? 0;
  const activeGainEdit =
    gainEdit && gainEdit.baselineKey === gainBaselineKey ? gainEdit : null;
  const draftGainDb = activeGainEdit?.gainDb ?? clip?.gainDb ?? 0;

  if (!clip) {
    return (
      <div className="rounded border border-dashed border-[var(--brd-line)] p-3 text-sm text-[var(--brd-mute)]">
        {tr("wybierzKlipAbyEdytowac")}
      </div>
    );
  }

  const fadeMax = Math.max(0, clip.durationMs);
  const fadeDirty =
    draftFadeIn !== clip.fadeInMs || draftFadeOut !== clip.fadeOutMs;
  const gainDirty = draftGainDb !== clip.gainDb;
  const fadeOverlapHint = studioClipFadesOverlapHint(
    draftFadeIn,
    draftFadeOut,
    clip.durationMs,
  );

  function setDraftFadeIn(next: number) {
    setFadeEdit({
      baselineKey: fadeBaselineKey,
      fadeInMs: next,
      fadeOutMs: draftFadeOut,
    });
  }

  function setDraftFadeOut(next: number) {
    setFadeEdit({
      baselineKey: fadeBaselineKey,
      fadeInMs: draftFadeIn,
      fadeOutMs: next,
    });
  }

  function setDraftGainDb(next: number) {
    setGainEdit({
      baselineKey: gainBaselineKey,
      gainDb: next,
    });
  }

  return (
    <div
      className="min-w-0 space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
      data-testid="studio-inspector-clip"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--brd-ink)]">
            {tr("zaznaczonyKlipStart")}{" "}{tl(formatStudioTimeMs(startValue))} {tr("dlugosc")}{" "}
            {tl(formatStudioTimeMs(clip.durationMs))}
          </p>
          <p className="text-xs text-[var(--brd-mute)]">
            {tr("playhead")}{" "}{tl(formatStudioTimeMs(playheadMs))} {tr("offsetZrodla")}{" "}
            {tl(formatStudioTimeMs(clip.sourceOffsetMs))}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11"
          disabled={pending}
          onClick={onClearSelection}
        >
          {tr("odznacz")}
        </Button>
      </div>

      <div
        className="space-y-1 rounded border border-dashed border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]"
        data-testid="studio-inspector-clip-source"
        aria-label={tr("zrodloPlikuTylkoOdczyt")}
      >
        <p className="font-medium text-[var(--brd-ink)]">{tr("zrodloPlik")}</p>
        <p>{tr("rodzaj")}{" "}{tl(clip.sourceKind)}</p>
        {clip.sourceTakeId ? (
          <p className="font-mono break-all">{tr("take")}{" "}{tl(clip.sourceTakeId)}</p>
        ) : null}
        {clip.sourceBeatId ? (
          <p className="font-mono break-all">{tr("bit")}{" "}{tl(clip.sourceBeatId)}</p>
        ) : null}
        <p className="font-mono tabular-nums">
          {tr("offsetZrodla2")}{" "}{tl(formatStudioTimeMs(clip.sourceOffsetMs))}
        </p>
        <p>{tr("takeBitJestNiemodyfikowalny")}</p>
      </div>

      <div
        className="min-w-0 space-y-2 border-b border-[var(--brd-line)] pb-3"
        aria-label={tr("glosnoscIWyciszenieKlipu")}
      >
        <p className="text-xs font-medium text-[var(--brd-ink)]">
          {tr("glosnoscKlipu")}
        </p>
        <StudioMixControl
          label={tr("gain")}
          ariaLabel={tr("glosnoscKlipu2")}
          value={draftGainDb}
          display={tr("db", { v0: draftGainDb.toFixed(1) })}
          min={STUDIO_CLIP_GAIN_DB_MIN}
          max={STUDIO_CLIP_GAIN_DB_MAX}
          step={0.5}
          disabled={pending}
          onLocalChange={(next) => {
            setDraftGainDb(next);
            onMarkDirty();
          }}
          onCommit={(next) => {
            setDraftGainDb(next);
            if (clip && next !== clip.gainDb) onSaveGain(next);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full min-w-0 sm:w-auto"
          disabled={pending || !gainDirty}
          onClick={() => {
            onSaveGain(draftGainDb);
            onFlushPersist();
          }}
          aria-label={tr("zapiszTerazGlosnoscKlipu")}
        >
          {tr("zapiszTeraz")}
        </Button>
        <StudioToggleChip
          active={clip.muted}
          label={tr("wyciszKlip")}
          title={tr("wyciszTenKlipTake")}
          disabled={pending}
          onClick={() => onSaveMute(!clip.muted)}
        />
      </div>

      <label className="block min-w-0 text-xs text-[var(--brd-mute)]">
        {tr("przesunPozycjaStartu")}
        <input
          type="range"
          min={0}
          max={maxStart}
          step={1}
          value={startValue}
          className="mt-1 h-11 w-full min-w-0"
          aria-label={tr("przesunKlip")}
          disabled={pending}
          onChange={(e) => setDraftStart(Number(e.target.value))}
          onPointerUp={(e) => {
            const next = Number((e.target as HTMLInputElement).value);
            setDraftStart(null);
            if (next !== clip.timelineStartMs) onMove(next);
          }}
        />
      </label>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onTrimLeftToPlayhead}
          title={tr("przytnijPoczatekDoPlayhead")}
        >
          {tr("przytnijPoczatek")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onTrimRightToPlayhead}
          title={tr("przytnijKoniecDoPlayhead")}
        >
          {tr("przytnijKoniec")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onSplit}
          title={tr("podzielWPlayhead")}
        >
          {tr("podziel")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onDuplicate}
          title={tr("powielKlipToSamo")}
          aria-label={tr("powielKlip")}
        >
          {tr("powiel")}
        </Button>
        {!confirmDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => onConfirmDeleteChange(true)}
            title={tr("usunKlipZOsi")}
          >
            {tr("usun")}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={onDelete}
              title={tr("potwierdzUsuniecieKlipu")}
            >
              {tr("potwierdzUsuniecie")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={() => onConfirmDeleteChange(false)}
            >
              {tr("anuluj")}
            </Button>
          </>
        )}
      </div>
      {confirmDelete ? (
        <p className="text-xs text-destructive" role="status">
          {tr("usuniecieDotyczyTylkoKlipu")}
        </p>
      ) : null}

      <div
        className="min-w-0 space-y-2 border-t border-[var(--brd-line)] pt-3"
        aria-label={tr("fadeKlipu")}
      >
        <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("fade")}</p>
        <p className="text-xs text-[var(--brd-mute)]">
          {tr("aktualnieFadeIn")}{" "}{tl(formatStudioTimeMs(clip.fadeInMs))} {tr("fadeOut")}{" "}
          {tl(formatStudioTimeMs(clip.fadeOutMs))}
        </p>
        <StudioMixControl
          label={tr("fadeIn")}
          ariaLabel={tr("fadeIn2")}
          value={draftFadeIn}
          display={formatStudioTimeMs(draftFadeIn)}
          min={0}
          max={fadeMax}
          step={1}
          disabled={pending}
          onLocalChange={(next) => {
            setDraftFadeIn(next);
            onMarkDirty();
          }}
          onCommit={(next) => {
            setDraftFadeIn(next);
            if (clip && (next !== clip.fadeInMs || draftFadeOut !== clip.fadeOutMs)) {
              onSaveFades(next, draftFadeOut);
            }
          }}
        />
        <StudioMixControl
          label={tr("fadeOut2")}
          ariaLabel={tr("fadeOut3")}
          value={draftFadeOut}
          display={formatStudioTimeMs(draftFadeOut)}
          min={0}
          max={fadeMax}
          step={1}
          disabled={pending}
          onLocalChange={(next) => {
            setDraftFadeOut(next);
            onMarkDirty();
          }}
          onCommit={(next) => {
            setDraftFadeOut(next);
            if (clip && (draftFadeIn !== clip.fadeInMs || next !== clip.fadeOutMs)) {
              onSaveFades(draftFadeIn, next);
            }
          }}
        />
        {fadeOverlapHint ? (
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            {tr("sumaFadeInI")}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full min-w-0 sm:w-auto"
          disabled={pending || !fadeDirty}
          onClick={() => {
            onSaveFades(draftFadeIn, draftFadeOut);
            onFlushPersist();
          }}
          aria-label={tr("zapiszTerazFade")}
        >
          {tr("zapiszTeraz")}
        </Button>
      </div>
    </div>
  );
}

/** Phase 7.1.5.1 — meter leaf (avoids Inner subscription to meter ticks). */
function StudioMasterMeterLive() {
  const { meter } = useStudioTransportMeters();
  return <StudioMasterMeter snapshot={meter} />;
}

function StudioTrackMeterLive({ trackName }: { trackName: string }) {
  const { trackMeter } = useStudioTransportMeters();
  return <StudioTrackMeter snapshot={trackMeter} trackName={trackName} />;
}

/** Phase 7.1.5.1 — playhead leaf for timeline. */
function StudioTimelinePlayheadBound(
  props: Omit<Parameters<typeof StudioTimeline>[0], "playheadMs">,
) {
  const { playheadMs } = useStudioTransportPlayhead();
  return <StudioTimeline {...props} playheadMs={playheadMs} />;
}

function ClipEditPanelPlayheadBound(
  props: Omit<Parameters<typeof ClipEditPanel>[0], "playheadMs">,
) {
  const { playheadMs } = useStudioTransportPlayhead();
  return <ClipEditPanel {...props} playheadMs={playheadMs} />;
}

function StudioTransportBar({
  projectId,
  tipDocumentVersion,
  getExpectedDocumentVersion,
  onDocumentRefreshed,
  onChooseBeat,
  onRecord,
  tempoBpm,
  timeSignatureNum,
  timeSignatureDen,
  durationMs,
  masterGainDb,
  pending,
  saveStatusLabel,
  saveIsError,
  conflictActive,
  onMasterGainLocal,
  onMasterGainCommit,
}: {
  projectId: string;
  tipDocumentVersion: number;
  getExpectedDocumentVersion: () => number;
  onDocumentRefreshed: (document: StudioProjectDocument) => void;
  onChooseBeat: () => void;
  onRecord: () => void;
  tempoBpm: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  durationMs: number;
  masterGainDb: number;
  pending: boolean;
  saveStatusLabel: string;
  saveIsError: boolean;
  conflictActive: boolean;
  onMasterGainLocal: (gainDb: number) => void;
  onMasterGainCommit: (gainDb: number) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const {
    phase,
    play,
    pause,
    stop,
    audioState,
    error,
    hasBeat,
    metronomeEnabled,
    setMetronomeEnabled,
    loopEnabled,
    setLoop,
  } = useStudioTransportControls();
  const { timeLabel } = useStudioTransportPlayhead();
  const busy = audioState === "loading";
  const noBeat =
    audioState === "no_beat" || (!hasBeat && audioState !== "loading");
  const statusLabel =
    audioState === "loading"
      ? tr("ladowanieBitu")
      : audioState === "idle"
        ? tr("bitOczekujeNaZaladowanie")
        : audioState === "no_beat"
          ? tr("nieMaszJeszczeWybranego")
          : audioState === "error"
            ? tr("bladOdtwarzania")
            : audioState === "playing"
              ? "Odtwarzanie"
              : audioState === "paused"
                ? "Pauza"
                : audioState === "ready"
                  ? "Gotowy"
                  : hasBeat
                    ? tr("bitOczekujeNaZaladowanie")
                    : tr("nieMaszJeszczeWybranego");

  const beatControlsDisabled = noBeat || busy;

  return (
    <div
      className="studio-transport sticky top-14 z-20 shrink-0 px-1.5 py-1 sm:top-2 sm:px-2 sm:py-1.5"
      role="region"
      aria-label={tr("transportStudio")}
      data-testid="studio-transport"
      data-studio-transport-empty={noBeat ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          className="flex flex-wrap items-center gap-1"
          data-testid="studio-transport-ops"
        >
          <Button
            type="button"
            size="sm"
            className="studio-key studio-key-play min-h-11 min-w-11 px-2"
            onClick={play}
            disabled={beatControlsDisabled || phase === "playing"}
            title={tl(noBeat ? tr("odtworzNajpierwWybierzBit") : tr("odtworz"))}
            aria-label={tl(noBeat ? tr("odtworzWymagaBitu") : tr("odtworz"))}
          >
            {busy ? "…" : <StudioGlyph name="play" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="studio-key min-h-11 min-w-11 px-2"
            onClick={pause}
            disabled={noBeat || phase !== "playing"}
            title={tr("pauza")}
            aria-label={tr("pauza")}
          >
            <StudioGlyph name="pause" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="studio-key min-h-11 min-w-11 px-2"
            onClick={stop}
            disabled={noBeat}
            title={tr("stop")}
            aria-label={tr("stop")}
          >
            <StudioGlyph name="stop" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="studio-rec-button min-h-11 min-w-11 gap-1.5 px-2.5"
            onClick={onRecord}
            disabled={noBeat}
            title={
              tl(noBeat
                ? tr("nagrajNajpierwWybierzBit")
                : tr("nagrajOtwieraIstniejacyKontekst"))
            }
            aria-label={
              tl(noBeat
                ? tr("nagrajWymagaBitu")
                : tr("nagrajOtwieraPanelNagrywania"))
            }
            data-testid="studio-transport-record"
          >
            <StudioRecLamp />
            <span className="font-mono text-[11px] font-semibold tracking-[0.08em]">{tr("rec")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={
              loopEnabled
                ? "studio-key studio-key-on min-h-11 min-w-11 px-2"
                : "studio-key min-h-11 min-w-11 px-2"
            }
            disabled={noBeat}
            aria-pressed={loopEnabled}
            title={tl(loopEnabled ? tr("loopWlaczony") : tr("loopRegionu"))}
            aria-label={tl(loopEnabled ? tr("loopWlaczony") : tr("wlaczLoopRegionu"))}
            data-testid="studio-transport-loop"
            onClick={() =>
              setLoop({
                enabled: !loopEnabled,
                startMs: 0,
                endMs: durationMs,
              })
            }
          >
            <StudioGlyph name="loop" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={
              metronomeEnabled
                ? "studio-key studio-key-on min-h-11 min-w-11 px-2"
                : "studio-key min-h-11 min-w-11 px-2"
            }
            disabled={noBeat}
            aria-pressed={metronomeEnabled}
            title={
              tl(metronomeEnabled ? tr("metronomWlaczony") : tr("metronomKlikRuntime"))
            }
            aria-label={
              tl(metronomeEnabled ? tr("metronomWlaczony") : tr("wlaczMetronom"))
            }
            data-testid="studio-transport-metronome"
            onClick={() => setMetronomeEnabled(!metronomeEnabled)}
          >
            <StudioGlyph name="metronome" />
          </Button>
          <Button
            type="button"
            size="sm"
            className={
              noBeat
                ? "min-h-11 border-[var(--brd-green)] bg-[var(--brd-green)] px-2 text-[var(--brd-paper)] hover:opacity-90"
                : "studio-key min-h-11 px-2"
            }
            variant={noBeat ? "default" : "outline"}
            onClick={onChooseBeat}
            title={tl(noBeat ? tr("wybierzBit") : tr("zmienBit"))}
            aria-label={tl(noBeat ? tr("wybierzBit") : tr("zmienBit"))}
            data-testid="studio-transport-choose-beat"
          >
            {tl(noBeat ? tr("wybierzBit2") : tr("beatButton"))}
          </Button>
        </div>

        <div
          className="studio-counter flex min-h-11 flex-wrap items-center gap-2 px-2.5 font-mono text-xs tabular-nums"
          data-testid="studio-transport-meta"
        >
          <span
            aria-live="polite"
            className="studio-counter-time text-sm font-medium tracking-tight"
          >
            {tl(timeLabel)}
            <span className="studio-counter-dim"> / </span>
            {tl(formatStudioTimeMs(durationMs))}
          </span>
          <span className="studio-counter-dim" aria-label={tr("tempo")}>
            {tempoBpm} {tr("bpm")}
          </span>
          <span className="studio-counter-dim" aria-label={tr("metrum")}>
            {timeSignatureNum}/{timeSignatureDen}
          </span>
        </div>

        <div
          className="ml-auto flex min-w-[9rem] max-w-[14rem] flex-1 items-center gap-2 [&_label]:!text-[11px] [&_label]:!text-[var(--tape-cream-soft)] [&_label_span_span]:!text-[var(--tape-amber)]"
          data-testid="studio-transport-master"
        >
          <StudioMixControl
            label={tr("master")}
            ariaLabel={tr("glosnoscMaster")}
            value={masterGainDb}
            display={tr("db", { v0: masterGainDb.toFixed(1) })}
            min={STUDIO_MASTER_GAIN_DB_MIN}
            max={STUDIO_MASTER_GAIN_DB_MAX}
            step={0.5}
            compact
            disabled={pending}
            onLocalChange={onMasterGainLocal}
            onCommit={onMasterGainCommit}
          />
        </div>

        <p
          className={`min-h-11 max-w-[12rem] truncate text-xs leading-[2.75rem] ${
            saveIsError || conflictActive
              ? "text-[var(--brd-warn)]"
              : "text-[var(--brd-mute)]"
          }`}
          role={saveIsError || conflictActive ? "alert" : "status"}
          data-testid="studio-transport-save"
        >
          {tl(saveStatusLabel)}
          {conflictActive ? (
            <>
              {" "}
              <button
                type="button"
                className="underline"
                onClick={() => window.location.reload()}
              >
                {tr("odswiez")}
              </button>
            </>
          ) : null}
        </p>

        <StudioMixRevisionHistoryControl
          projectId={projectId}
          tipDocumentVersion={tipDocumentVersion}
          getExpectedDocumentVersion={getExpectedDocumentVersion}
          onDocumentRefreshed={onDocumentRefreshed}
          disabled={pending}
        />
        <StudioExportControl
          projectId={projectId}
          getExpectedDocumentVersion={getExpectedDocumentVersion}
        />
      </div>
      {noBeat ? (
        <p
          className="mt-1 text-[11px] text-[var(--brd-mute)]"
          role="status"
          data-testid="studio-transport-nobeat-status"
        >
          {tl(statusLabel)} {tr("wybierzBitAbyOdblokowac")}
        </p>
      ) : (
        <p className="sr-only" role="status">
          {tl(statusLabel)}
        </p>
      )}
      {error ? (
        <p className="mt-1 text-xs text-[var(--brd-warn)]" role="alert">
          {tl(error)}
        </p>
      ) : null}
    </div>
  );
}

function StudioTimeline({
  tracks,
  clips,
  timelineLengthMs,
  playheadMs,
  pxPerMs,
  mode,
  interactionLocked = false,
  selectedClipId,
  renderTrackHeader,
  scrollContainerRef,
  onZoomAroundViewport,
  resolveClipSourceUrl,
  snapConfig,
  onSeek,
  onSelectClip,
  onCommitClipGeometry,
}: {
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
  timelineLengthMs: number;
  playheadMs: number;
  pxPerMs: number;
  mode: TimelineMode;
  interactionLocked?: boolean;
  selectedClipId: string | null;
  renderTrackHeader?: (track: StudioTrackDto, index: number) => ReactNode;
  scrollContainerRef?: { current: HTMLDivElement | null };
  onZoomAroundViewport?: (nextPxPerMs: number, viewportOffsetPx: number) => void;
  resolveClipSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  snapConfig: StudioSnapConfig;
  onSeek: (ms: number) => void;
  onSelectClip: (clipId: string) => void;
  onCommitClipGeometry: (
    clipId: string,
    commit: Exclude<StudioClipEditCommit, { kind: "noop" }>,
  ) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const seekEnabled = mode === "seek" && !interactionLocked;
  const density = clampPxPerMs(pxPerMs);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScroll = useRef(false);
  const [laneViewportWidthPx, setLaneViewportWidthPx] = useState(0);
  const widthPx = contentWidthPx(timelineLengthMs, density, {
    viewportWidthPx:
      laneViewportWidthPx > 0 ? laneViewportWidthPx : undefined,
  });
  const playheadX = msToPx(playheadMs, density);
  const ticks = buildTimelineRulerTicks({
    timelineLengthMs,
    pxPerMs: density,
  });

  function assignLaneScrollEl(el: HTMLDivElement | null) {
    laneScrollRef.current = el;
    if (scrollContainerRef) scrollContainerRef.current = el;
  }

  useEffect(() => {
    const el = laneScrollRef.current;
    if (!el) return;
    const sync = () => setLaneViewportWidthPx(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tracks.length]);

  useEffect(() => {
    const el = laneScrollRef.current;
    if (!el || !onZoomAroundViewport) return;

    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const target = laneScrollRef.current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const viewportOffsetPx = Math.min(
        rect.width,
        Math.max(0, event.clientX - rect.left),
      );
      const next =
        event.deltaY < 0
          ? zoomInPxPerMs(density)
          : zoomOutPxPerMs(density);
      onZoomAroundViewport!(next, viewportOffsetPx);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [density, onZoomAroundViewport]);

  function syncVerticalScroll(source: "header" | "lane") {
    if (syncingScroll.current) return;
    const headerEl = headerScrollRef.current;
    const laneEl = laneScrollRef.current;
    if (!headerEl || !laneEl) return;
    syncingScroll.current = true;
    if (source === "header") {
      laneEl.scrollTop = headerEl.scrollTop;
    } else {
      headerEl.scrollTop = laneEl.scrollTop;
    }
    // Release sync guard after nested scroll handlers settle (no rAF — meter UI contract).
    queueMicrotask(() => {
      syncingScroll.current = false;
    });
  }

  function seekFromPointer(event: {
    currentTarget: HTMLDivElement;
    clientX: number;
  }) {
    if (!seekEnabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = Math.min(
      widthPx,
      Math.max(0, event.clientX - rect.left),
    );
    // px → integer ms (no coarse second rounding).
    onSeek(pxToMs(localX, density));
  }

  const hasHeaders = typeof renderTrackHeader === "function";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[color-mix(in_oklch,var(--brd-paper),var(--brd-ink)_3%)]"
      role="region"
      aria-label={tr("osCzasuProjektu")}
      data-testid="studio-timeline"
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        {hasHeaders ? (
          <div
            className={`${STUDIO_DAW_HEADER_WIDTH_CLASS} flex shrink-0 flex-col border-r border-[var(--brd-line)]`}
            data-testid="studio-track-list"
          >
            <div
              className="flex h-7 shrink-0 items-center border-b border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-paper)_92%,var(--brd-ink)_8%)] px-2 text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]"
              aria-hidden
            >
              {tr("sciezki")}
            </div>
            <div
              ref={headerScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
              onScroll={() => syncVerticalScroll("header")}
              data-testid="studio-track-header-scroll"
            >
              {tracks.map((track, index) => renderTrackHeader!(track, index))}
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
          <div
            ref={assignLaneScrollEl}
            className="min-h-0 min-w-0 flex-1 overflow-auto touch-pan-x"
            data-studio-timeline-scroll="true"
            data-testid="studio-timeline-scroll"
            onScroll={() => {
              if (hasHeaders) syncVerticalScroll("lane");
            }}
          >
            <div
              className={`relative ${
                seekEnabled
                  ? "cursor-pointer"
                  : interactionLocked
                    ? "touch-pan-x"
                    : "touch-none"
              }`}
              style={{ width: widthPx, minWidth: "100%" }}
              onClick={seekFromPointer}
              role="slider"
              aria-label={
                tl(interactionLocked
                  ? tr("osCzasuTrybNagrywania")
                  : seekEnabled
                    ? tr("osCzasuKliknijAby")
                    : tr("osCzasuTrybEdycji"))
              }
              aria-valuemin={0}
              aria-valuemax={timelineLengthMs}
              aria-valuenow={playheadMs}
              aria-disabled={interactionLocked || undefined}
            >
              <div className="sticky top-0 z-[3] h-7 border-b border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-paper)_92%,var(--brd-ink)_8%)]">
                {ticks.map((tick) => (
                  <span
                    key={tick.ms}
                    className={`absolute top-0 -translate-x-1/2 text-[10px] ${
                      tick.major
                        ? "text-[var(--brd-ink)]"
                        : "text-[var(--brd-mute)]"
                    }`}
                    style={{ left: msToPx(tick.ms, density) }}
                  >
                    {tl(tick.major ? formatStudioTimeMs(tick.ms) : "·")}
                  </span>
                ))}
              </div>
              {tracks.map((track) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                return (
                  <div
                    key={track.id}
                    className="relative border-b border-[var(--brd-line)]/60 bg-[var(--brd-paper-deep)]/30"
                    data-studio-clip-lane={track.id}
                    style={{
                      width: widthPx,
                      height: STUDIO_DAW_LANE_HEIGHT_PX,
                    }}
                  >
                    {trackClips.map((clip) => (
                      <StudioClipLaneItem
                        key={clip.id}
                        clip={clip}
                        timelineLengthMs={timelineLengthMs}
                        pxPerMs={density}
                        mode={mode}
                        selected={clip.id === selectedClipId}
                        interactionLocked={interactionLocked}
                        laneHeightPx={STUDIO_DAW_LANE_HEIGHT_PX}
                        snapConfig={snapConfig}
                        resolveSourceUrl={resolveClipSourceUrl}
                        onSelectClip={onSelectClip}
                        onSeek={onSeek}
                        onCommitGeometry={onCommitClipGeometry}
                      />
                    ))}
                  </div>
                );
              })}
              <div
                className="pointer-events-none absolute bottom-0 top-6 z-[4] w-0.5 bg-[var(--brd-audio-playhead)] will-change-transform"
                style={{ transform: `translateX(${playheadX}px)` }}
                data-testid="studio-playhead"
                data-playhead-ms={playheadMs}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute top-6 z-[4] size-2 -translate-x-1/2 rounded-full bg-[var(--brd-rec)]"
                style={{ left: playheadX }}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
      <label className="block shrink-0 border-t border-[var(--brd-line)] px-2 py-1.5 text-xs text-[var(--brd-mute)]">
        {tr("playhead2")}{" "}{tl(formatStudioTimeMs(playheadMs))}
        <input
          type="range"
          min={0}
          max={timelineLengthMs}
          step={1}
          value={playheadMs}
          disabled={interactionLocked}
          className="mt-1 h-11 w-full"
          aria-label={tr("pozycjaPlayhead")}
          onChange={(e) => onSeek(Math.round(Number(e.target.value)))}
        />
      </label>
    </div>
  );
}
