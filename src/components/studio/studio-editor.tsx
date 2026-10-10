"use client";

import Link from "next/link";
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
  studioInspectorContextTitle,
} from "@/components/studio/studio-inspector-context";
import { StudioInspectorOverlay } from "@/components/studio/studio-inspector-shell";
import {
  StudioMixerDockChrome,
  StudioMixerOverlay,
} from "@/components/studio/studio-mixer-shell";
import { StudioRecordingPanel } from "@/components/studio/studio-recording-panel";
import { StudioExportControl } from "@/components/studio/studio-export-control";
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
  studioSnapPresetLabel,
  STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
  timelineMsAtViewportX,
  zoomAroundAnchorMs,
  zoomInPxPerMs,
  zoomOutPxPerMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";
import {
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
  formatStudioTrackCapacityLabelCompact,
  shouldShowStudioTrackUpgradeCta,
  STUDIO_TRACK_UPGRADE_HREF,
} from "@/lib/studio/studio-track-capacity";
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
  const [beatPickerOpen, setBeatPickerOpen] = useState(false);
  const [fxPanel, setFxPanel] = useState<FxPanelTarget | null>(null);
  /** Mix Track selection (SoT) — drives P6.6.1 Track meter target. */
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  /**
   * Phase 7.1.4 + Visual Parity V2 — dock / overlay open (XOR with Inspector).
   * xl default expanded is applied via matchMedia (not mobile overlay-on-load).
   */
  const [mixerOpen, setMixerOpen] = useState(false);
  /** Phase 7.1.5.4 — mobile edit-toolbar overflow (local UI only). */
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  /** Phase 7.1.3 — overlay open (tablet drawer / mobile sheet). Desktop dock always visible. */
  const [inspectorOverlayOpen, setInspectorOverlayOpen] = useState(false);
  /** Explicit Record context when user opens Nagraj without active capture. */
  const [inspectorPreferRecord, setInspectorPreferRecord] = useState(false);
  /** xl dock vs overlay — ensure Inspector content mounts once (no dual RecordingPanel). */
  const [inspectorDesktopRail, setInspectorDesktopRail] = useState(false);
  const mixerPanelId = useId();
  const inspectorPanelId = useId();
  /** Phase 7.1.5 — controls only; playhead/meters via leaf hooks. */
  const transport = useStudioTransportControls();
  const { setTrackMeterTarget, resolveClipSourceUrl, getPlayheadMs } = transport;
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
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

  function closeInspectorOverlay() {
    setInspectorOverlayOpen(false);
  }

  function openMixerSurface() {
    setInspectorOverlayOpen(false);
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
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const snap = persistRef.current?.getSnapshot();
      if (
        !snap ||
        (snap.status !== "DIRTY" &&
          snap.status !== "SAVING" &&
          snap.status !== "SAVE_FAILED" &&
          !snap.queued &&
          !snap.inFlight)
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
        message: "Persist niedostępny.",
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
            message: json.error ?? "Nie udało się zapisać geometrii klipu.",
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
            message: json.error ?? "Nie udało się zaktualizować ścieżki.",
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
            message: json.error ?? "Nie udało się zapisać Master.",
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
            message: json.error ?? "Nie udało się zmienić kolejności.",
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
          setError(json.error ?? "Osiągnięto limit ścieżek.");
          return classifyPersistHttpFailure({
            status: 403,
            message: json.error ?? "Osiągnięto limit ścieżek.",
            code: json.code,
          });
        }
        if (!res.ok || !json.track || typeof json.documentVersion !== "number") {
          const failure = classifyPersistHttpFailure({
            status: res.status,
            message: json.error ?? "Nie udało się dodać ścieżki.",
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
          setError(json.error ?? "Osiągnięto limit ścieżek.");
          return classifyPersistHttpFailure({
            status: 403,
            message: json.error ?? "Osiągnięto limit ścieżek.",
            code: json.code,
          });
        }
        if (json.code === "BEAT_TRACK_PROTECTED") {
          setError(json.error ?? "Ścieżki Bit nie można zduplikować.");
          return classifyPersistHttpFailure({
            status: 403,
            message: json.error ?? "Ścieżki Bit nie można zduplikować.",
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
            message: json.error ?? "Nie udało się zduplikować ścieżki.",
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
            message: json.error ?? "Nie udało się usunąć ścieżki.",
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
            message: json.error ?? "Nie udało się zapisać klipu.",
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
            message: json.error ?? "Nie udało się podzielić klipu.",
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
            message: json.error ?? "Nie udało się usunąć klipu.",
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
            message: json.error ?? "Nie udało się powielić klipu.",
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
      ? (persistSnap.lastError ?? "Nie zapisano")
      : persistSnap
        ? persistSnap.label
        : pending
          ? "Zapisywanie…"
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
        aria-label="Inspector"
        data-testid="studio-inspector-visual-tabs"
        className="grid grid-cols-4 gap-1 border-b border-[var(--brd-line)] pb-2"
      >
        {(
          [
            {
              id: "settings",
              label: "Settings",
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
              label: "Effects",
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
              label: "File",
              active: inspectorContext === "clip",
              onClick: () => {
                setInspectorPreferRecord(false);
                setConfirmDelete(false);
                openInspectorOverlay();
              },
            },
            {
              id: "record",
              label: "Record",
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
            {tab.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {studioInspectorContextTitle(inspectorContext)}
      </p>

      {inspectorContext === "record" ? (
        <StudioRecordingPanel
          projectId={doc.project.id}
          getExpectedDocumentVersion={expectedDocumentVersion}
          enqueuePersistAsync={enqueuePersistAsync}
          tracks={doc.tracks}
          embedded
          preferredTrackId={activeSelectedTrackId}
          onRecordingActiveChange={(active) => {
            setRecordingLocked(active);
            if (active) {
              setMode("seek");
              setSelectedClipId(clearClipSelection());
              setConfirmDelete(false);
              setInspectorPreferRecord(true);
            } else {
              setInspectorPreferRecord(false);
            }
          }}
          onClipCreated={(clip, nextDocumentVersion) => {
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
            setInspectorPreferRecord(false);
            setSelectedClipId(selectClipId(null, clip.id));
            setSelectedTrackId(clip.trackId);
            setStatus("Nagranie dodane na oś czasu.");
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
            Wybierz ścieżkę lub klip, aby zobaczyć szczegóły.
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
            Nagraj
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
      aria-label="Mix"
    >
      <li
        data-testid="studio-mix-master"
        className="sticky left-0 z-[1] flex w-[7.5rem] shrink-0 flex-col rounded-md border-2 border-[var(--brd-green)]/40 bg-[color-mix(in_srgb,var(--brd-bg)_88%,var(--brd-green)_12%)] p-2 shadow-[4px_0_8px_-4px_color-mix(in_srgb,var(--brd-ink)_20%,transparent)]"
      >
        <p className="truncate text-xs font-semibold text-[var(--brd-ink)]">Master</p>
        <p className="mb-1 text-[9px] uppercase tracking-[0.1em] text-[var(--brd-mute)]">
          Out
        </p>
        <StudioMixControl
          label="Level"
          ariaLabel="Głośność Master"
          value={doc.project.masterGainDb}
          display={`${doc.project.masterGainDb.toFixed(1)} dB`}
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
          label="Pan"
          ariaLabel="Panorama Master"
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
          aria-label="Efekty Master"
          onClick={() => setFxPanel({ role: "master" })}
        >
          {studioFxEntryLabel(doc.project.masterFxChain)}
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
                ? "flex w-[7.5rem] shrink-0 flex-col rounded border border-[var(--brd-green)] bg-[var(--brd-bg)] p-2"
                : "flex w-[7.5rem] shrink-0 flex-col rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-2"
            }
          >
            <button
              type="button"
              className="mb-1 min-h-11 w-full rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
              aria-pressed={isSelected}
              aria-label={
                isSelected
                  ? `Odznacz ścieżkę ${track.name}`
                  : `Wybierz ścieżkę ${track.name}`
              }
              data-testid="studio-mix-track-select"
              onClick={() =>
                setSelectedTrackId(isSelected ? null : track.id)
              }
            >
              <p className="truncate text-xs font-medium text-[var(--brd-ink)]">
                {track.name}
              </p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--brd-mute)]">
                {isBeat ? "BEAT" : labelStudioTrackType(track.trackType)}
                {!audible ? " · M" : ""}
                {isSelected ? " · meter" : ""}
              </p>
            </button>
            {isSelected ? (
              <StudioTrackMeterLive trackName={track.name} />
            ) : (
              <div
                className="mb-1 h-8 rounded border border-dashed border-[var(--brd-line)]"
                aria-hidden
              />
            )}
            <StudioMixControl
              label="Level"
              ariaLabel={`Głośność ścieżki ${track.name}`}
              value={track.gainDb}
              display={`${track.gainDb.toFixed(1)} dB`}
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
              label="Pan"
              ariaLabel={`Panorama ścieżki ${track.name}`}
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
                title="Wycisz"
                tone="mute"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => {
                  patchTrack(track.id, { muted: !track.muted });
                }}
              />
              <StudioToggleChip
                active={track.solo}
                label="S"
                title="Solo"
                tone="solo"
                className={STUDIO_DAW_CHIP_CLASS}
                onClick={() => {
                  patchTrack(track.id, { solo: !track.solo });
                }}
              />
              <StudioToggleChip
                active={track.recordArmed}
                label="R"
                title="Uzbrojenie nagrywania"
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
              aria-label={`Efekty ścieżki ${track.name}`}
              title={fxLabel}
              onClick={() => {
                setSelectedTrackId(track.id);
                setFxPanel({ role: "track", trackId: track.id });
              }}
            >
              {fxLabel}
            </Button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      data-testid="studio-daw-shell"
      data-studio-shell="true"
      data-studio-visual-parity="v2"
      className="flex min-h-[calc(100dvh-7rem)] flex-col gap-0.5 overflow-x-hidden"
    >
      <header
        data-testid="studio-header"
        className="flex min-h-10 items-center border-b border-[var(--brd-line)] pb-0.5"
      >
        <h1 className="brd-display truncate text-sm font-semibold tracking-tight sm:text-base">
          {doc.project.title}
        </h1>
      </header>

      <StudioTransportBar
        projectId={doc.project.id}
        getExpectedDocumentVersion={expectedDocumentVersion}
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
          setStatus("Bit powiązany z projektem.");
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
            {trackMenuTrack.name}
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
              atTrackCapacity
                ? "Osiągnięto limit ścieżek"
                : "Duplikuj ścieżkę"
            }
            onClick={() => {
              duplicateTrack(trackMenuTrack.id);
            }}
          >
            Duplikuj
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
            Usuń
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => setTrackMenuId(null)}
          >
            Anuluj
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
            Usunąć ścieżkę {trackPendingDelete.name}?
          </p>
          <p className="mt-1 text-xs text-[var(--brd-mute)]">
            Ścieżka i jej klipy zostaną usunięte. Źródłowe nagrania pozostaną
            zachowane.
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
              Anuluj
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
              Usuń
            </Button>
          </div>
        </div>
      ) : null}

      {recordingLocked ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          TRYB NAGRYWANIA — edycja klipów i przewijanie są zablokowane.
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-1 border-b border-[var(--brd-line)] bg-[var(--brd-paper)] px-0.5 py-1"
        role="toolbar"
        aria-label="Edycja osi czasu"
        data-testid="studio-edit-toolbar"
      >
        <Button
          type="button"
          size="sm"
          variant={timelineMode === "seek" ? "default" : "outline"}
          className="min-h-11"
          disabled={recordingLocked}
          onClick={() => setMode("seek")}
        >
          Zaznacz
        </Button>
        <Button
          type="button"
          size="sm"
          variant={timelineMode === "edit" ? "default" : "outline"}
          className="min-h-11"
          disabled={recordingLocked}
          onClick={() => setMode("edit")}
        >
          Edycja
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={recordingLocked || pending || !selectedClip}
          title="Podziel w playhead"
          onClick={() => {
            splitSelectedAtPlayhead();
          }}
        >
          Podziel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={recordingLocked || !selectedClip}
          title="Usuń klip"
          onClick={() => {
            setInspectorPreferRecord(false);
            setConfirmDelete(true);
            openInspectorOverlay();
          }}
        >
          Usuń
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          data-testid="studio-add-track"
          disabled={recordingLocked || pending || atTrackCapacity}
          title={
            atTrackCapacity
              ? "Osiągnięto limit ścieżek"
              : "Dodaj ścieżkę wokalną"
          }
          onClick={() => {
            addTrack();
          }}
        >
          + Dodaj ścieżkę
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 xl:hidden"
          aria-expanded={inspectorOverlayOpen}
          aria-controls={inspectorPanelId}
          onClick={() => {
            if (inspectorOverlayOpen) closeInspectorOverlay();
            else openInspectorOverlay();
          }}
        >
          Inspector
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mixerOpen ? "default" : "outline"}
          className="min-h-11"
          aria-pressed={mixerOpen}
          aria-expanded={mixerOpen}
          aria-controls={mixerPanelId}
          onClick={toggleMixerSurface}
        >
          Mixer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 md:hidden"
          data-testid="studio-toolbar-more"
          aria-expanded={toolbarMoreOpen}
          aria-controls="studio-toolbar-overflow"
          onClick={() => setToolbarMoreOpen((v) => !v)}
        >
          Więcej
        </Button>
        <div
          id="studio-toolbar-overflow"
          data-testid="studio-toolbar-overflow"
          className={`flex flex-wrap items-center gap-2 ${
            toolbarMoreOpen ? "flex w-full" : "hidden"
          } md:contents`}
        >
          <span
            data-testid="studio-track-capacity"
            data-track-count={trackCount}
            data-max-tracks={maxTracks}
            data-premium-tier={trackCapacity.premiumTier}
            className="inline-flex min-h-11 items-center gap-1 px-1 font-mono text-xs text-[var(--brd-ink)]"
            title={`Ścieżki ${formatStudioTrackCapacityLabel(trackCount, maxTracks)} (Bit liczony, Master nie)`}
          >
            <span className="hidden sm:inline">
              {formatStudioTrackCapacityLabel(trackCount, maxTracks)}
            </span>
            <span className="sm:hidden">
              {formatStudioTrackCapacityLabelCompact(trackCount, maxTracks)}
            </span>
          </span>
          {showUpgradeCta ? (
            <Link
              href={STUDIO_TRACK_UPGRADE_HREF}
              data-testid="studio-track-upgrade-cta"
              className="inline-flex min-h-11 items-center rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-xs font-medium text-[var(--brd-green)] hover:bg-[var(--brd-bg)]"
            >
              Zmień pakiet
            </Link>
          ) : null}
          {atTrackCapacity && trackCapacity.premiumTier === "GOLD" ? (
            <span
              data-testid="studio-track-capacity-max"
              className="text-[10px] text-[var(--brd-mute)]"
            >
              Maksymalny limit ścieżek
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={snapPreset === "off" ? "outline" : "default"}
            className="min-h-11"
            aria-pressed={snapPreset !== "off"}
            title={`Snap: ${studioSnapPresetLabel(snapPreset)} (kliknij aby zmienić: OFF / 20 / 100 / 1000 ms)`}
            onClick={() => setSnapConfig((prev) => cycleStudioSnapConfig(prev))}
          >
            Snap {studioSnapPresetLabel(snapPreset)}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            title="Pomniejsz oś czasu"
            onClick={() =>
              zoomAtViewportCenter(zoomOutPxPerMs(pxPerMsRef.current))
            }
          >
            zoom−
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            title="Powiększ oś czasu"
            onClick={() =>
              zoomAtViewportCenter(zoomInPxPerMs(pxPerMsRef.current))
            }
          >
            zoom+
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            title="Dopasuj oś czasu do szerokości"
            onClick={() => {
              const el = timelineScrollRef.current;
              const viewport = el?.clientWidth;
              zoomAtViewportCenter(
                fitPxPerMs(
                  length,
                  typeof viewport === "number" ? viewport : 360,
                ),
              );
            }}
          >
            Fit
          </Button>
        </div>
      </div>

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
                  className={`flex flex-col justify-center gap-0.5 border-b border-[var(--brd-line)] px-1 py-0.5 ${
                    isSelected
                      ? "bg-[color-mix(in_srgb,var(--brd-bg)_85%,var(--brd-green)_15%)]"
                      : "bg-[var(--brd-bg)]"
                  }`}
                  style={{ height: STUDIO_DAW_LANE_HEIGHT_PX }}
                >
                  <div className="flex min-h-11 items-center gap-0.5">
                    <button
                      type="button"
                      className="min-h-11 min-w-0 flex-1 truncate rounded-sm px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
                      aria-pressed={isSelected}
                      aria-label={
                        isSelected
                          ? `Odznacz ścieżkę ${track.name}`
                          : `Wybierz ścieżkę ${track.name}`
                      }
                      data-testid="studio-track-header-select"
                      onClick={() =>
                        setSelectedTrackId(isSelected ? null : track.id)
                      }
                    >
                      <span className="block truncate text-xs font-medium text-[var(--brd-ink)]">
                        {track.name}
                      </span>
                      <span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                        {isBeat ? "BEAT" : typeLabel}
                      </span>
                    </button>
                    <StudioToggleChip
                      active={track.muted}
                      label="M"
                      title="Wycisz"
                      tone="mute"
                      className={STUDIO_DAW_CHIP_CLASS}
                      onClick={() => {
                        patchTrack(track.id, { muted: !track.muted });
                      }}
                    />
                    <StudioToggleChip
                      active={track.solo}
                      label="S"
                      title="Solo"
                      tone="solo"
                      className={STUDIO_DAW_CHIP_CLASS}
                      onClick={() => {
                        patchTrack(track.id, { solo: !track.solo });
                      }}
                    />
                    <StudioToggleChip
                      active={track.recordArmed}
                      label="R"
                      title="Uzbrojenie nagrywania"
                      tone="record"
                      className={STUDIO_DAW_CHIP_CLASS}
                      onClick={() => {
                        patchTrack(track.id, {
                          recordArmed: !track.recordArmed,
                        });
                      }}
                    />
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-11 min-h-11 min-w-11 px-0"
                      disabled={pending || index === 0}
                      title="Przenieś w górę"
                      aria-label="Przenieś ścieżkę w górę"
                      onClick={() => {
                        reorder(track.id, "up");
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-11 min-h-11 min-w-11 px-0"
                      disabled={pending || index === doc.tracks.length - 1}
                      title="Przenieś w dół"
                      aria-label="Przenieś ścieżkę w dół"
                      onClick={() => {
                        reorder(track.id, "down");
                      }}
                    >
                      ↓
                    </Button>
                    {!isBeat ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-11 min-h-11 min-w-11 px-0"
                        data-testid="studio-track-menu"
                        data-track-id={track.id}
                        disabled={recordingLocked || pending}
                        title="Menu ścieżki"
                        aria-label={`Menu ścieżki ${track.name}`}
                        aria-expanded={trackMenuId === track.id}
                        onClick={() =>
                          setTrackMenuId((prev) =>
                            prev === track.id ? null : track.id,
                          )
                        }
                      >
                        ⋮
                      </Button>
                    ) : null}
                  </div>
                  <div
                    className="grid grid-cols-2 gap-1"
                    data-testid="studio-track-header-mix"
                  >
                    <StudioMixControl
                      label="Vol"
                      ariaLabel={`Głośność ścieżki ${track.name}`}
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
                      label="Pan"
                      ariaLabel={`Panorama ścieżki ${track.name}`}
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
              );
            }}
            onSeek={seekSnapped}
            onSelectClip={(id) => {
              if (recordingLocked) return;
              setInspectorPreferRecord(false);
              setSelectedClipId(selectClipId(activeSelectedId, id));
              const clip = doc.clips.find((c) => c.id === id);
              if (clip) setSelectedTrackId(clip.trackId);
              setMode("edit");
              setConfirmDelete(false);
            }}
            scrollContainerRef={timelineScrollRef}
            onZoomAroundViewport={zoomAroundViewportX}
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
          aria-label={studioInspectorContextTitle(inspectorContext)}
        >
          {inspectorDesktopRail ? inspectorContent : null}
        </aside>
      </div>

      <StudioInspectorOverlay
        open={inspectorOverlayOpen && !inspectorDesktopRail}
        context={inspectorContext}
        panelId={inspectorPanelId}
        onClose={closeInspectorOverlay}
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
            title="Master · Efekty"
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
            title={`Efekty · ${
              doc.tracks.find((t) => t.id === fxPanel.trackId)?.name ?? "Ścieżka"
            }`}
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
  const isBeat = track.trackType === "BEAT";
  return (
    <div className="space-y-3" data-testid="studio-inspector-track">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--brd-ink)]">{track.name}</p>
        <p className="text-xs text-[var(--brd-mute)]">
          {labelStudioTrackType(track.trackType)}
          {isBeat ? " · Bit projektu (chroniony)" : ""}
        </p>
        <p className="font-mono text-xs tabular-nums text-[var(--brd-mute)]">
          {formatStudioTrackCapacityLabel(trackCount, maxTracks)}
        </p>
      </div>

      <div
        className="space-y-1 rounded border border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]"
        aria-label="Stan ścieżki (skrót)"
      >
        <p>
          M: {track.muted ? "wyciszona" : "otwarta"} · S:{" "}
          {track.solo ? "solo" : "—"} · R:{" "}
          {track.recordArmed ? "uzbrojona" : "—"}
        </p>
        <p className="font-mono tabular-nums">
          Gain {track.gainDb.toFixed(1)} dB · Pan {track.pan.toFixed(2)}
        </p>
        <p>
          M/S/R · Vol/Pan: nagłówek ścieżki i Mixer (ten sam stan · patchTrack)
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full"
        aria-label={`Efekty ścieżki ${track.name}`}
        data-testid="studio-inspector-track-fx"
        onClick={onOpenEffects}
      >
        {studioFxEntryLabel(track.effectsChain)}
      </Button>

      {!isBeat ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full"
          onClick={onOpenRecord}
        >
          Nagraj na tej ścieżce
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
        Wybierz klip, aby edytować: głośność, wyciszenie, fade, przycięcie,
        podział, powielenie lub usunięcie. Ustaw playhead przed przycięciem /
        podziałem.
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
            Zaznaczony klip · start {formatStudioTimeMs(startValue)} · długość{" "}
            {formatStudioTimeMs(clip.durationMs)}
          </p>
          <p className="text-xs text-[var(--brd-mute)]">
            Playhead: {formatStudioTimeMs(playheadMs)} · offset źródła{" "}
            {formatStudioTimeMs(clip.sourceOffsetMs)}
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
          Odznacz
        </Button>
      </div>

      <div
        className="space-y-1 rounded border border-dashed border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]"
        data-testid="studio-inspector-clip-source"
        aria-label="Źródło pliku (tylko odczyt)"
      >
        <p className="font-medium text-[var(--brd-ink)]">Źródło / plik</p>
        <p>Rodzaj: {clip.sourceKind}</p>
        {clip.sourceTakeId ? (
          <p className="font-mono break-all">Take: {clip.sourceTakeId}</p>
        ) : null}
        {clip.sourceBeatId ? (
          <p className="font-mono break-all">Bit: {clip.sourceBeatId}</p>
        ) : null}
        <p className="font-mono tabular-nums">
          Offset źródła: {formatStudioTimeMs(clip.sourceOffsetMs)}
        </p>
        <p>Take/bit jest niemodyfikowalny — edytujesz tylko klip na osi.</p>
      </div>

      <div
        className="min-w-0 space-y-2 border-b border-[var(--brd-line)] pb-3"
        aria-label="Głośność i wyciszenie klipu"
      >
        <p className="text-xs font-medium text-[var(--brd-ink)]">
          Głośność klipu
        </p>
        <StudioMixControl
          label="Gain"
          ariaLabel="Głośność klipu"
          value={draftGainDb}
          display={`${draftGainDb.toFixed(1)} dB`}
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
          aria-label="Zapisz teraz głośność klipu"
        >
          Zapisz teraz
        </Button>
        <StudioToggleChip
          active={clip.muted}
          label="Wycisz klip"
          title="Wycisz ten klip (Take pozostaje nietknięty)"
          disabled={pending}
          onClick={() => onSaveMute(!clip.muted)}
        />
      </div>

      <label className="block min-w-0 text-xs text-[var(--brd-mute)]">
        Przesuń (pozycja startu)
        <input
          type="range"
          min={0}
          max={maxStart}
          step={1}
          value={startValue}
          className="mt-1 h-11 w-full min-w-0"
          aria-label="Przesuń klip"
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
          title="Przytnij początek do playhead"
        >
          Przytnij początek
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onTrimRightToPlayhead}
          title="Przytnij koniec do playhead"
        >
          Przytnij koniec
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onSplit}
          title="Podziel w playhead"
        >
          Podziel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onDuplicate}
          title="Powiel klip (to samo nagranie, bez kopiowania pliku)"
          aria-label="Powiel klip"
        >
          Powiel
        </Button>
        {!confirmDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => onConfirmDeleteChange(true)}
            title="Usuń klip z osi czasu"
          >
            Usuń
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
              title="Potwierdź usunięcie klipu"
            >
              Potwierdź usunięcie
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={() => onConfirmDeleteChange(false)}
            >
              Anuluj
            </Button>
          </>
        )}
      </div>
      {confirmDelete ? (
        <p className="text-xs text-destructive" role="status">
          Usunięcie dotyczy tylko klipu na osi czasu. Źródło (nagranie / bit)
          pozostaje nietknięte.
        </p>
      ) : null}

      <div
        className="min-w-0 space-y-2 border-t border-[var(--brd-line)] pt-3"
        aria-label="Fade klipu"
      >
        <p className="text-xs font-medium text-[var(--brd-ink)]">Fade</p>
        <p className="text-xs text-[var(--brd-mute)]">
          Aktualnie: Fade In {formatStudioTimeMs(clip.fadeInMs)} · Fade Out{" "}
          {formatStudioTimeMs(clip.fadeOutMs)}
        </p>
        <StudioMixControl
          label="Fade In"
          ariaLabel="Fade In"
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
          label="Fade Out"
          ariaLabel="Fade Out"
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
            Suma Fade In i Fade Out przekracza długość klipu — przy zapisie
            wartości zostaną znormalizowane.
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
          aria-label="Zapisz teraz fade"
        >
          Zapisz teraz
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
  getExpectedDocumentVersion,
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
  getExpectedDocumentVersion: () => number;
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
  const { phase, play, pause, stop, audioState, error, hasBeat } =
    useStudioTransportControls();
  const { timeLabel } = useStudioTransportPlayhead();
  const busy = audioState === "loading";
  const noBeat =
    audioState === "no_beat" || (!hasBeat && audioState !== "loading");
  const statusLabel =
    audioState === "loading"
      ? "Ładowanie bitu…"
      : audioState === "idle"
        ? "Bit oczekuje na załadowanie"
        : audioState === "no_beat"
          ? "Nie masz jeszcze wybranego bitu."
          : audioState === "error"
            ? "Błąd odtwarzania"
            : audioState === "playing"
              ? "Odtwarzanie"
              : audioState === "paused"
                ? "Pauza"
                : audioState === "ready"
                  ? "Gotowy"
                  : hasBeat
                    ? "Bit oczekuje na załadowanie"
                    : "Nie masz jeszcze wybranego bitu.";

  const beatControlsDisabled = noBeat || busy;

  return (
    <div
      className="sticky top-14 z-20 shrink-0 border border-[var(--brd-ink)] bg-[color-mix(in_srgb,var(--brd-ink)_94%,black)] px-2 py-1.5 text-[var(--brd-paper)] sm:top-2"
      role="region"
      aria-label="Transport Studio"
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
            className="min-h-11 min-w-11 border-transparent bg-[var(--brd-paper)] px-2 text-[var(--brd-ink)] hover:bg-[var(--brd-paper)]/90"
            onClick={play}
            disabled={beatControlsDisabled || phase === "playing"}
            title={noBeat ? "Odtwórz — najpierw wybierz bit" : "Odtwórz"}
            aria-label={noBeat ? "Odtwórz — wymaga bitu" : "Odtwórz"}
          >
            {busy ? "…" : "▶"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 border-[var(--brd-paper)]/35 bg-transparent px-2 text-[var(--brd-paper)] hover:bg-[var(--brd-paper)]/10"
            onClick={pause}
            disabled={noBeat || phase !== "playing"}
            title="Pauza"
            aria-label="Pauza"
          >
            ❚❚
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 border-[var(--brd-paper)]/35 bg-transparent px-2 text-[var(--brd-paper)] hover:bg-[var(--brd-paper)]/10"
            onClick={stop}
            disabled={noBeat}
            title="Stop"
            aria-label="Stop"
          >
            ■
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="min-h-11 min-w-11 px-2"
            onClick={onRecord}
            disabled={noBeat}
            title={
              noBeat
                ? "Nagraj — najpierw wybierz bit"
                : "Nagraj — otwiera istniejący kontekst nagrywania"
            }
            aria-label={
              noBeat
                ? "Nagraj — wymaga bitu"
                : "Nagraj — otwiera panel nagrywania"
            }
            data-testid="studio-transport-record"
          >
            ●
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 border-[var(--brd-paper)]/35 bg-transparent px-2 text-[var(--brd-paper)]"
            disabled
            aria-disabled="true"
            title="Loop niedostępny"
            aria-label="Loop — niedostępne w tej wersji Studio"
            data-testid="studio-transport-loop"
          >
            ⟳
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 border-[var(--brd-paper)]/35 bg-transparent px-2 text-[var(--brd-paper)]"
            disabled
            aria-disabled="true"
            title="Metronom niedostępny"
            aria-label="Metronom — niedostępne w tej wersji Studio"
            data-testid="studio-transport-metronome"
          >
            ♩
          </Button>
          <Button
            type="button"
            size="sm"
            className={
              noBeat
                ? "min-h-11 border-[var(--brd-green)] bg-[var(--brd-green)] px-2 text-[var(--brd-paper)] hover:opacity-90"
                : "min-h-11 border-[var(--brd-paper)]/35 bg-transparent px-2 text-[var(--brd-paper)] hover:bg-[var(--brd-paper)]/10"
            }
            variant={noBeat ? "default" : "outline"}
            onClick={onChooseBeat}
            title={noBeat ? "Wybierz bit" : "Zmień bit"}
            aria-label={noBeat ? "Wybierz bit" : "Zmień bit"}
            data-testid="studio-transport-choose-beat"
          >
            {noBeat ? "+ Wybierz bit" : "Bit"}
          </Button>
        </div>

        <div
          className="flex min-h-11 flex-wrap items-center gap-2 border-l border-[var(--brd-paper)]/25 pl-2 font-mono text-xs tabular-nums text-[var(--brd-paper)]"
          data-testid="studio-transport-meta"
        >
          <span
            aria-live="polite"
            className="text-sm font-medium tracking-tight"
          >
            {timeLabel}
            <span className="text-[var(--brd-paper)]/55"> / </span>
            {formatStudioTimeMs(durationMs)}
          </span>
          <span className="text-[var(--brd-paper)]/70" aria-label="Tempo">
            {tempoBpm} BPM
          </span>
          <span className="text-[var(--brd-paper)]/70" aria-label="Metrum">
            {timeSignatureNum}/{timeSignatureDen}
          </span>
        </div>

        <div
          className="ml-auto flex min-w-[9rem] max-w-[14rem] flex-1 items-center gap-2 [&_label]:text-[var(--brd-paper)]/75 [&_span]:text-[var(--brd-paper)]"
          data-testid="studio-transport-master"
        >
          <StudioMixControl
            label="Master"
            ariaLabel="Głośność Master"
            value={masterGainDb}
            display={`${masterGainDb.toFixed(1)} dB`}
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
              : "text-[var(--brd-paper)]/70"
          }`}
          role={saveIsError || conflictActive ? "alert" : "status"}
          data-testid="studio-transport-save"
        >
          {saveStatusLabel}
          {conflictActive ? (
            <>
              {" "}
              <button
                type="button"
                className="underline"
                onClick={() => window.location.reload()}
              >
                Odśwież
              </button>
            </>
          ) : null}
        </p>

        <StudioExportControl
          projectId={projectId}
          getExpectedDocumentVersion={getExpectedDocumentVersion}
        />
      </div>
      {noBeat ? (
        <p
          className="mt-1 text-[11px] text-[var(--brd-paper)]/75"
          role="status"
          data-testid="studio-transport-nobeat-status"
        >
          {statusLabel} Wybierz bit, aby odblokować odtwarzanie i nagrywanie.
        </p>
      ) : (
        <p className="sr-only" role="status">
          {statusLabel}
        </p>
      )}
      {error ? (
        <p className="mt-1 text-xs text-[var(--brd-warn)]" role="alert">
          {error}
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
  const seekEnabled = mode === "seek" && !interactionLocked;
  const density = clampPxPerMs(pxPerMs);
  const widthPx = contentWidthPx(timelineLengthMs, density);
  const playheadX = msToPx(playheadMs, density);
  const ticks = buildTimelineRulerTicks({
    timelineLengthMs,
    pxPerMs: density,
  });
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScroll = useRef(false);

  function assignLaneScrollEl(el: HTMLDivElement | null) {
    laneScrollRef.current = el;
    if (scrollContainerRef) scrollContainerRef.current = el;
  }

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
      aria-label="Oś czasu projektu"
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
              Ścieżki
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
                interactionLocked
                  ? "Oś czasu — tryb nagrywania"
                  : seekEnabled
                    ? "Oś czasu — kliknij, aby przewinąć"
                    : "Oś czasu — tryb edycji klipu"
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
                    {tick.major ? formatStudioTimeMs(tick.ms) : "·"}
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
        Playhead · {formatStudioTimeMs(playheadMs)}
        <input
          type="range"
          min={0}
          max={timelineLengthMs}
          step={1}
          value={playheadMs}
          disabled={interactionLocked}
          className="mt-1 h-11 w-full"
          aria-label="Pozycja playhead"
          onChange={(e) => onSeek(Math.round(Number(e.target.value)))}
        />
      </label>
    </div>
  );
}
