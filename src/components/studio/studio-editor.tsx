"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
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
import type { StudioClipEditCommit } from "@/lib/studio/studio-clip-edit-preview";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import { StudioTrackMeter } from "@/components/studio/studio-track-meter";
import {
  StudioTransportProvider,
  useStudioTransport,
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

/** Phase 1 DAW — track header / timeline lane shared row height (px). */
const STUDIO_DAW_LANE_HEIGHT_PX = 52;
const STUDIO_DAW_HEADER_WIDTH_CLASS = "w-[240px] sm:w-[260px]";
/** Phase 7.1.1 — primary track chips ≥44px hit area (visual stays compact). */
const STUDIO_DAW_CHIP_CLASS = "h-11 min-h-11 min-w-11 w-11 px-0";

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
  const [pending, startTransition] = useTransition();
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
  /** Phase 7.1.4 — desktop dock expanded / <xl overlay open (XOR with Inspector). */
  const [mixerOpen, setMixerOpen] = useState(false);
  /** Phase 7.1.3 — overlay open (tablet drawer / mobile sheet). Desktop dock always visible. */
  const [inspectorOverlayOpen, setInspectorOverlayOpen] = useState(false);
  /** Explicit Record context when user opens Nagraj without active capture. */
  const [inspectorPreferRecord, setInspectorPreferRecord] = useState(false);
  /** xl dock vs overlay — ensure Inspector content mounts once (no dual RecordingPanel). */
  const [inspectorDesktopRail, setInspectorDesktopRail] = useState(false);
  const mixerPanelId = useId();
  const transport = useStudioTransport();
  const { setTrackMeterTarget, resolveClipSourceUrl } = transport;
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
      if (desktop) setInspectorOverlayOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    pxPerMsRef.current = pxPerMs;
  }, [pxPerMs]);

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
  async function persistClipMove(
    clipId: string,
    timelineStartMs: number,
    options?: { applySnapGrid?: boolean },
  ): Promise<void> {
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const maxStart = Math.max(0, length - clip.durationMs);
    const applyGrid = options?.applySnapGrid !== false;
    const target = applyGrid
      ? applySnap(timelineStartMs, { minMs: 0, maxMs: maxStart })
      : Math.min(maxStart, Math.max(0, Math.round(timelineStartMs)));
    if (target === clip.timelineStartMs) return;
    await persistClipGeometryCommit(clipId, {
      kind: "move",
      timelineStartMs: target,
    });
  }

  /** Phase 4 — commit MOVE / TRIM / set_geometry via existing CAS PATCH. */
  async function persistClipGeometryCommit(
    clipId: string,
    commit: Exclude<StudioClipEditCommit, { kind: "noop" }>,
  ): Promise<void> {
    setError(null);
    setStatus("Zapisywanie…");
    const body: Record<string, unknown> = {
      expectedDocumentVersion: doc.project.documentVersion,
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
      `/api/studio/projects/${doc.project.id}/clips/${clipId}`,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (!res.ok || !json.clip) {
      throw new Error(json.error ?? "Nie udało się zapisać geometrii klipu.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : prev.project.documentVersion,
      },
      clips: prev.clips.map((c) =>
        c.id === json.clip!.id ? json.clip! : c,
      ),
    }));
    setStatus("Zapisano");
  }

  async function patchTrack(
    trackId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    setError(null);
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/tracks/${trackId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json()) as {
      success?: boolean;
      track?: StudioTrackDto;
      documentVersion?: number;
      error?: string;
    };
    if (!res.ok || !json.track) {
      throw new Error(json.error ?? "Nie udało się zaktualizować ścieżki.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : prev.project.documentVersion,
      },
      tracks: prev.tracks.map((t) => (t.id === trackId ? json.track! : t)),
    }));
  }

  async function patchMasterMix(body: {
    masterGainDb?: number;
    masterPan?: number;
  }): Promise<void> {
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(`/api/studio/projects/${doc.project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedDocumentVersion: doc.project.documentVersion,
        ...body,
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      documentVersion?: number;
      masterGainDb?: number;
      masterPan?: number;
      error?: string;
      code?: string;
    };
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (
      !res.ok ||
      typeof json.documentVersion !== "number" ||
      typeof json.masterGainDb !== "number" ||
      typeof json.masterPan !== "number"
    ) {
      throw new Error(json.error ?? "Nie udało się zapisać Master.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: json.documentVersion!,
        masterGainDb: json.masterGainDb!,
        masterPan: json.masterPan!,
      },
    }));
    setStatus("Zapisano");
  }

  async function reorder(trackId: string, direction: "up" | "down") {
    setError(null);
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/tracks/${trackId}/reorder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      },
    );
    const json = (await res.json()) as {
      success?: boolean;
      tracks?: StudioTrackDto[];
      error?: string;
    };
    if (!res.ok || !json.tracks) {
      throw new Error(json.error ?? "Nie udało się zmienić kolejności.");
    }
    setDoc((prev) => ({ ...prev, tracks: json.tracks! }));
  }

  /** Phase 5 — add VOCAL track (server capacity + CAS). */
  async function addTrack(): Promise<void> {
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/tracks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDocumentVersion: doc.project.documentVersion,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (json.code === "TRACK_CAPACITY_REACHED") {
      throw new Error(json.error ?? "Osiągnięto limit ścieżek.");
    }
    if (!res.ok || !json.track || typeof json.documentVersion !== "number") {
      throw new Error(json.error ?? "Nie udało się dodać ścieżki.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: json.documentVersion!,
      },
      tracks: [...prev.tracks, json.track!].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    }));
    setSelectedTrackId(json.track.id);
    setStatus("Zapisano");
  }

  /** Phase 6 — duplicate user track + clips (atomic capacity). */
  async function duplicateTrack(trackId: string): Promise<void> {
    setError(null);
    setStatus("Zapisywanie…");
    setTrackMenuId(null);
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/tracks/${trackId}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDocumentVersion: doc.project.documentVersion,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (json.code === "TRACK_CAPACITY_REACHED") {
      throw new Error(json.error ?? "Osiągnięto limit ścieżek.");
    }
    if (json.code === "BEAT_TRACK_PROTECTED") {
      throw new Error(json.error ?? "Ścieżki Bit nie można zduplikować.");
    }
    if (
      !res.ok ||
      !json.track ||
      !Array.isArray(json.clips) ||
      typeof json.documentVersion !== "number"
    ) {
      throw new Error(json.error ?? "Nie udało się zduplikować ścieżki.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: json.documentVersion!,
      },
      tracks: [...prev.tracks, json.track!].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
      clips: [...prev.clips, ...json.clips!].sort(
        (a, b) => a.timelineStartMs - b.timelineStartMs,
      ),
    }));
    setSelectedTrackId(json.track.id);
    setSelectedClipId(null);
    setStatus("Zapisano");
  }

  /** Phase 5 — delete user track (cascades clips; Takes preserved). */
  async function deleteTrack(trackId: string): Promise<void> {
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/tracks/${trackId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDocumentVersion: doc.project.documentVersion,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (!res.ok || !json.deletedTrackId || typeof json.documentVersion !== "number") {
      throw new Error(json.error ?? "Nie udało się usunąć ścieżki.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: json.documentVersion!,
      },
      tracks: prev.tracks.filter((t) => t.id !== json.deletedTrackId),
      clips: prev.clips.filter((c) => c.trackId !== json.deletedTrackId),
    }));
    if (selectedTrackId === trackId) setSelectedTrackId(null);
    if (selectedClip?.trackId === trackId) {
      setSelectedClipId(null);
      setConfirmDelete(false);
    }
    setConfirmDeleteTrackId(null);
    setStatus("Zapisano");
  }

  async function patchClip(body: Record<string, unknown>) {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}`,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (!res.ok || !json.clip) {
      throw new Error(json.error ?? "Nie udało się zapisać klipu.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : prev.project.documentVersion,
      },
      clips: prev.clips.map((c) => (c.id === json.clip!.id ? json.clip! : c)),
    }));
    setStatus("Zapisano");
  }

  /** P6.7.3 — explicit Fade In/Out save via set_fades + CAS. */
  async function saveClipFades(fadeInMs: number, fadeOutMs: number) {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const body = buildStudioClipFadesPatchBody({
      fadeInMs,
      fadeOutMs,
      expectedDocumentVersion: doc.project.documentVersion,
    });
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}`,
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
      // No blind retry. Conflict surfaces Odśwież via conflictActive.
      throw new Error(result.message);
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: result.documentVersion,
      },
      clips: prev.clips.map((c) =>
        c.id === result.clip.id ? result.clip : c,
      ),
    }));
    setStatus("Zapisano");
  }

  /** V1 — Clip Gain CAS write path (explicit save). */
  async function saveClipGain(gainDb: number) {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const body = buildStudioClipGainPatchBody({
      gainDb,
      expectedDocumentVersion: doc.project.documentVersion,
    });
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}`,
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
      throw new Error(result.message);
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: result.documentVersion,
      },
      clips: prev.clips.map((c) =>
        c.id === result.clip.id ? result.clip : c,
      ),
    }));
    setStatus("Zapisano");
  }

  /** V1 — Clip Mute CAS write path. */
  async function saveClipMute(muted: boolean) {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const body = buildStudioClipMutePatchBody({
      muted,
      expectedDocumentVersion: doc.project.documentVersion,
    });
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}`,
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
      throw new Error(result.message);
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion: result.documentVersion,
      },
      clips: prev.clips.map((c) =>
        c.id === result.clip.id ? result.clip : c,
      ),
    }));
    setStatus("Zapisano");
  }

  async function splitSelectedAtPlayhead() {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}/split`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atTimelineMs: transport.state.playheadMs,
          expectedDocumentVersion: doc.project.documentVersion,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (!res.ok || !json.left || !json.right) {
      throw new Error(json.error ?? "Nie udało się podzielić klipu.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : prev.project.documentVersion,
      },
      clips: [
        ...prev.clips.map((c) => (c.id === json.left!.id ? json.left! : c)),
        json.right!,
      ].sort((a, b) => a.timelineStartMs - b.timelineStartMs),
    }));
    setSelectedClipId(selectClipId(activeSelectedId, json.left.id));
    setStatus("Zapisano");
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
        startTransition(async () => {
          try {
            // Nudge bypasses snap — micro-timing (±1 / ±10 / ±20 ms).
            await persistClipMove(selectedClip.id, next, {
              applySnapGrid: false,
            });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Błąd przesunięcia.",
            );
            setStatus(null);
          }
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
        startTransition(async () => {
          try {
            await splitSelectedAtPlayhead();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Błąd podziału.");
            setStatus(null);
          }
        });
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
    // Intentional: handlers close over latest selected clip / length / pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Phase 2 keyboard precision
  }, [recordingLocked, pending, selectedClip, length]);

  async function deleteSelectedClip() {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDocumentVersion: doc.project.documentVersion,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (!res.ok || !json.deletedClipId) {
      throw new Error(json.error ?? "Nie udało się usunąć klipu.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : prev.project.documentVersion,
      },
      clips: prev.clips.filter((c) => c.id !== json.deletedClipId),
    }));
    setSelectedClipId(clearClipSelection());
    setConfirmDelete(false);
    setStatus("Zapisano");
  }

  /** V1 — Duplicate Clip (same Take, independent Clip params). */
  async function duplicateSelectedClip() {
    if (!selectedClip) return;
    setError(null);
    setStatus("Zapisywanie…");
    const res = await fetch(
      `/api/studio/projects/${doc.project.id}/clips/${selectedClip.id}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDocumentVersion: doc.project.documentVersion,
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
    if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
      throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
    }
    if (!res.ok || !json.original || !json.duplicate) {
      throw new Error(json.error ?? "Nie udało się powielić klipu.");
    }
    setDoc((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : prev.project.documentVersion,
      },
      clips: [
        ...prev.clips.map((c) =>
          c.id === json.original!.id ? json.original! : c,
        ),
        json.duplicate!,
      ].sort((a, b) => a.timelineStartMs - b.timelineStartMs),
    }));
    setSelectedClipId(selectClipId(activeSelectedId, json.duplicate.id));
    setStatus("Zapisano");
  }

  const conflictActive =
    Boolean(error) &&
    (error!.includes("zmieniony") || error === FX_CHAIN_CONFLICT_UI_PL);

  const saveStatusLabel = error
    ? error
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
    onSaveFades: (fadeInMs: number, fadeOutMs: number) =>
      startTransition(async () => {
        try {
          await saveClipFades(fadeInMs, fadeOutMs);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd zapisu fade.");
          setStatus(null);
        }
      }),
    onSaveGain: (gainDb: number) =>
      startTransition(async () => {
        try {
          await saveClipGain(gainDb);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd głośności klipu.");
          setStatus(null);
        }
      }),
    onSaveMute: (muted: boolean) =>
      startTransition(async () => {
        try {
          await saveClipMute(muted);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd wyciszenia klipu.");
          setStatus(null);
        }
      }),
    onMove: (timelineStartMs: number) =>
      startTransition(async () => {
        try {
          const maxStart = selectedClip
            ? Math.max(0, length - selectedClip.durationMs)
            : 0;
          await patchClip({
            op: "move",
            timelineStartMs: applySnap(timelineStartMs, {
              minMs: 0,
              maxMs: maxStart,
            }),
            expectedDocumentVersion: doc.project.documentVersion,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd przesunięcia.");
          setStatus(null);
        }
      }),
    onTrimLeftToPlayhead: () =>
      startTransition(async () => {
        try {
          await patchClip({
            op: "trim_left_to_playhead",
            playheadMs: transport.state.playheadMs,
            expectedDocumentVersion: doc.project.documentVersion,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd przycięcia.");
          setStatus(null);
        }
      }),
    onTrimRightToPlayhead: () =>
      startTransition(async () => {
        try {
          await patchClip({
            op: "trim_right_to_playhead",
            playheadMs: transport.state.playheadMs,
            expectedDocumentVersion: doc.project.documentVersion,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd przycięcia.");
          setStatus(null);
        }
      }),
    onSplit: () =>
      startTransition(async () => {
        try {
          await splitSelectedAtPlayhead();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Błąd podziału.");
          setStatus(null);
        }
      }),
  };

  const inspectorContent = (
    <div
      className="min-h-0 flex-1 space-y-3 overflow-y-auto"
      data-testid="studio-inspector-content"
      data-inspector-context={inspectorContext}
    >
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {studioInspectorContextTitle(inspectorContext)}
      </p>

      {inspectorContext === "record" ? (
        <StudioRecordingPanel
          projectId={doc.project.id}
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
          onClipCreated={(clip) => {
            setDoc((prev) => ({
              ...prev,
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
        <ClipEditPanel
          clip={selectedClip}
          playheadMs={transport.state.playheadMs}
          timelineLengthMs={length}
          pending={pending}
          confirmDelete={confirmDelete}
          onConfirmDeleteChange={setConfirmDelete}
          {...clipEditHandlers}
          onDuplicate={() =>
            startTransition(async () => {
              try {
                await duplicateSelectedClip();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd powielania.");
                setStatus(null);
              }
            })
          }
          onDelete={() =>
            startTransition(async () => {
              try {
                await deleteSelectedClip();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd usuwania.");
                setStatus(null);
              }
            })
          }
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
      className="flex gap-3 overflow-x-auto pb-1"
      data-testid="studio-mixer-drawer"
      data-studio-mixer="channels"
      aria-label="Mix"
    >
      <li
        data-testid="studio-mix-master"
        className="sticky left-0 z-[1] min-w-[11rem] shrink-0 rounded-md border-2 border-[var(--brd-green)]/35 bg-[color-mix(in_srgb,var(--brd-bg)_88%,var(--brd-green)_12%)] p-3 shadow-[4px_0_8px_-4px_color-mix(in_srgb,var(--brd-ink)_20%,transparent)]"
      >
        <div className="mb-2">
          <p className="text-sm font-semibold text-[var(--brd-ink)]">Master</p>
          <p className="text-xs text-[var(--brd-mute)]">
            Głośność wyjścia · efekty sumy
          </p>
        </div>
        <StudioMixControl
          label="Głośność"
          ariaLabel="Głośność Master"
          value={doc.project.masterGainDb}
          display={`${doc.project.masterGainDb.toFixed(1)} dB`}
          min={-24}
          max={12}
          step={0.5}
          disabled={pending}
          onLocalChange={(masterGainDb) =>
            setDoc((prev) => ({
              ...prev,
              project: { ...prev.project, masterGainDb },
            }))
          }
          onCommit={(masterGainDb) =>
            startTransition(async () => {
              try {
                await patchMasterMix({ masterGainDb });
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Błąd Master głośności.",
                );
                setStatus(null);
              }
            })
          }
        />
        <StudioMixControl
          label="Panorama L/R"
          ariaLabel="Panorama Master"
          value={doc.project.masterPan}
          display={doc.project.masterPan.toFixed(2)}
          min={-1}
          max={1}
          step={0.01}
          disabled={pending}
          onLocalChange={(masterPan) =>
            setDoc((prev) => ({
              ...prev,
              project: { ...prev.project, masterPan },
            }))
          }
          onCommit={(masterPan) =>
            startTransition(async () => {
              try {
                await patchMasterMix({ masterPan });
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Błąd Master panoramy.",
                );
                setStatus(null);
              }
            })
          }
        />
        <StudioMasterMeter snapshot={transport.meter} />
        <div className="mt-3">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="min-h-11 w-full"
            aria-label="Efekty Master"
            onClick={() => setFxPanel({ role: "master" })}
          >
            {studioFxEntryLabel(doc.project.masterFxChain)}
          </Button>
        </div>
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
                ? "min-w-[11rem] shrink-0 rounded border border-[var(--brd-green)] bg-[var(--brd-bg)] p-3"
                : "min-w-[11rem] shrink-0 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
            }
          >
            <button
              type="button"
              className="mb-2 min-h-11 w-full rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
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
              <p className="text-sm font-medium text-[var(--brd-ink)]">
                {track.name}
                {isBeat ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--brd-mute)]">
                    Bit projektu
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--brd-mute)]">
                {labelStudioTrackType(track.trackType)}
                {!audible ? " · wyciszona w miksie" : ""}
                {isSelected ? " · miernik aktywny" : ""}
              </p>
            </button>
            <StudioMixControl
              label="Głośność"
              ariaLabel={`Głośność ścieżki ${track.name}`}
              value={track.gainDb}
              display={`${track.gainDb.toFixed(1)} dB`}
              min={-24}
              max={12}
              step={0.5}
              disabled={pending}
              onLocalChange={(gainDb) =>
                setDoc((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === track.id ? { ...t, gainDb } : t,
                  ),
                }))
              }
              onCommit={(gainDb) =>
                startTransition(async () => {
                  try {
                    await patchTrack(track.id, { gainDb });
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Błąd głośności.",
                    );
                  }
                })
              }
            />
            <StudioMixControl
              label="Panorama L/R"
              ariaLabel={`Panorama ścieżki ${track.name}`}
              value={track.pan}
              display={track.pan.toFixed(2)}
              min={-1}
              max={1}
              step={0.01}
              disabled={pending}
              onLocalChange={(pan) =>
                setDoc((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === track.id ? { ...t, pan } : t,
                  ),
                }))
              }
              onCommit={(pan) =>
                startTransition(async () => {
                  try {
                    await patchTrack(track.id, { pan });
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Błąd panoramy.",
                    );
                  }
                })
              }
            />
            {isSelected ? (
              <StudioTrackMeter
                snapshot={transport.trackMeter}
                trackName={track.name}
              />
            ) : null}
            <div className="mt-3">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="min-h-11 w-full"
                aria-label={`Efekty ścieżki ${track.name}`}
                onClick={() => {
                  setSelectedTrackId(track.id);
                  setFxPanel({ role: "track", trackId: track.id });
                }}
              >
                {fxLabel}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      data-testid="studio-daw-shell"
      data-studio-shell="true"
      className="flex min-h-[calc(100dvh-7rem)] flex-col gap-1.5 overflow-x-hidden"
    >
      <header
        data-testid="studio-header"
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--brd-line)] pb-2"
      >
        <div className="min-w-0 space-y-0.5">
          <h1 className="brd-display truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {doc.project.title}
          </h1>
          <p className="text-xs text-[var(--brd-ink-soft)]">
            {doc.project.tempoBpm} BPM ·{" "}
            {doc.project.timeSignatureNum}/{doc.project.timeSignatureDen} ·{" "}
            {formatStudioTimeMs(length)}
          </p>
        </div>
        <p
          className={`shrink-0 text-xs ${
            error ? "text-destructive" : "text-[var(--brd-mute)]"
          }`}
          role={error ? "alert" : "status"}
        >
          {saveStatusLabel}
          {conflictActive ? (
            <>
              {" "}
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => window.location.reload()}
              >
                Odśwież
              </button>
            </>
          ) : null}
        </p>
      </header>

      <StudioTransportBar onChooseBeat={() => setBeatPickerOpen(true)} />

      <StudioBeatPicker
        projectId={doc.project.id}
        open={beatPickerOpen}
        onClose={() => setBeatPickerOpen(false)}
        onAttached={(document) => {
          setDoc(document);
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
            onClick={() =>
              startTransition(async () => {
                try {
                  await duplicateTrack(trackMenuTrack.id);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Błąd duplikowania ścieżki.",
                  );
                  setStatus(null);
                }
              })
            }
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
              onClick={() =>
                startTransition(async () => {
                  try {
                    await deleteTrack(trackPendingDelete.id);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Błąd usuwania ścieżki.",
                    );
                    setStatus(null);
                  }
                })
              }
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
        className="flex flex-wrap items-center gap-2"
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
          onClick={() =>
            startTransition(async () => {
              try {
                await splitSelectedAtPlayhead();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd podziału.");
                setStatus(null);
              }
            })
          }
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
          onClick={() =>
            startTransition(async () => {
              try {
                await addTrack();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Błąd dodawania ścieżki.",
                );
                setStatus(null);
              }
            })
          }
        >
          + Dodaj ścieżkę
        </Button>
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 xl:hidden"
          aria-expanded={inspectorOverlayOpen}
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
      </div>

      <div className="flex min-h-0 flex-col gap-3 xl:flex-row xl:items-stretch">
        <div className="min-w-0 flex-1">
          <StudioTimeline
            tracks={doc.tracks}
            clips={doc.clips}
            timelineLengthMs={length}
            playheadMs={transport.state.playheadMs}
            pxPerMs={pxPerMs}
            mode={timelineMode}
            interactionLocked={recordingLocked}
            selectedClipId={activeSelectedId}
            renderTrackHeader={(track, index) => {
              const isSelected = activeSelectedTrackId === track.id;
              const isBeat = track.trackType === "BEAT";
              return (
                <div
                  data-testid="studio-track-header"
                  data-track-id={track.id}
                  data-selected={isSelected ? "true" : "false"}
                  className={`flex items-center gap-1 border-b border-[var(--brd-line)] px-1 ${
                    isSelected
                      ? "bg-[color-mix(in_srgb,var(--brd-bg)_85%,var(--brd-green)_15%)]"
                      : "bg-[var(--brd-bg)]"
                  }`}
                  style={{ height: STUDIO_DAW_LANE_HEIGHT_PX }}
                >
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 truncate rounded-sm px-1 text-left text-xs font-medium text-[var(--brd-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
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
                    <span className="truncate">
                      {track.name}
                      {isBeat ? " · bit" : ""}
                    </span>
                  </button>
                  <StudioToggleChip
                    active={track.muted}
                    label="M"
                    title="Wycisz"
                    className={STUDIO_DAW_CHIP_CLASS}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await patchTrack(track.id, { muted: !track.muted });
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Błąd wyciszenia.",
                          );
                        }
                      })
                    }
                  />
                  <StudioToggleChip
                    active={track.solo}
                    label="S"
                    title="Solo"
                    className={STUDIO_DAW_CHIP_CLASS}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await patchTrack(track.id, { solo: !track.solo });
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Błąd solo.",
                          );
                        }
                      })
                    }
                  />
                  <StudioToggleChip
                    active={track.recordArmed}
                    label="R"
                    title="Uzbrojenie nagrywania"
                    className={STUDIO_DAW_CHIP_CLASS}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await patchTrack(track.id, {
                            recordArmed: !track.recordArmed,
                          });
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Błąd REC.",
                          );
                        }
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-11 min-h-11 min-w-11 px-0"
                    disabled={pending || index === 0}
                    title="Przenieś w górę"
                    aria-label="Przenieś ścieżkę w górę"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await reorder(track.id, "up");
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Błąd kolejności.",
                          );
                        }
                      })
                    }
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
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await reorder(track.id, "down");
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Błąd kolejności.",
                          );
                        }
                      })
                    }
                  >
                    ↓
                  </Button>
                  {!isBeat ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-10 min-h-11 min-w-11 px-0"
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
              startTransition(async () => {
                try {
                  await persistClipGeometryCommit(clipId, commit);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Błąd edycji klipu.",
                  );
                  setStatus(null);
                }
              });
            }}
          />
        </div>

        <aside
          data-testid="studio-inspector-desktop"
          data-studio-inspector="desktop"
          data-inspector-context={inspectorContext}
          className="hidden w-[300px] shrink-0 flex-col gap-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3 xl:flex"
          aria-label={studioInspectorContextTitle(inspectorContext)}
        >
          {inspectorDesktopRail ? inspectorContent : null}
        </aside>
      </div>

      <StudioInspectorOverlay
        open={inspectorOverlayOpen && !inspectorDesktopRail}
        context={inspectorContext}
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
            documentVersion={doc.project.documentVersion}
            title="Master · Efekty"
            onClose={() => setFxPanel(null)}
            onDocumentVersionChange={(documentVersion) =>
              setDoc((prev) => ({
                ...prev,
                project: { ...prev.project, documentVersion },
              }))
            }
            onChainChange={(masterFxChain: StudioFxChainV1) =>
              setDoc((prev) => ({
                ...prev,
                project: { ...prev.project, masterFxChain },
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
            documentVersion={doc.project.documentVersion}
            title={`Efekty · ${
              doc.tracks.find((t) => t.id === fxPanel.trackId)?.name ?? "Ścieżka"
            }`}
            onClose={() => setFxPanel(null)}
            onDocumentVersionChange={(documentVersion) =>
              setDoc((prev) => ({
                ...prev,
                project: { ...prev.project, documentVersion },
              }))
            }
            onChainChange={(effectsChain: StudioFxChainV1) =>
              setDoc((prev) => ({
                ...prev,
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
        <p>Sterowanie M/S/R: nagłówek ścieżki · Gain/Pan/Meter: Mixer</p>
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
          onLocalChange={setDraftGainDb}
          onCommit={setDraftGainDb}
        />
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full min-w-0 sm:w-auto"
          disabled={pending || !gainDirty}
          onClick={() => onSaveGain(draftGainDb)}
          aria-label="Zapisz głośność klipu"
        >
          Zapisz głośność
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
          onLocalChange={setDraftFadeIn}
          onCommit={setDraftFadeIn}
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
          onLocalChange={setDraftFadeOut}
          onCommit={setDraftFadeOut}
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
          className="min-h-11 w-full min-w-0 sm:w-auto"
          disabled={pending || !fadeDirty}
          onClick={() => onSaveFades(draftFadeIn, draftFadeOut)}
          aria-label="Zapisz fade"
        >
          Zapisz fade
        </Button>
      </div>
    </div>
  );
}

function StudioTransportBar({
  onChooseBeat,
}: {
  onChooseBeat: () => void;
}) {
  const { state, timeLabel, play, pause, stop, audioState, error, hasBeat } =
    useStudioTransport();
  const busy = audioState === "loading";
  const noBeat = audioState === "no_beat" || (!hasBeat && audioState !== "loading");
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

  return (
    <div
      className="sticky top-14 z-20 shrink-0 space-y-1 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 py-1.5 sm:top-2"
      role="region"
      aria-label="Transport Studio"
      data-testid="studio-transport"
    >
      {noBeat ? (
        <div className="space-y-2">
          <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
            Bit w projekcie
          </p>
          <p className="text-sm text-[var(--brd-ink)]">{statusLabel}</p>
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            onClick={onChooseBeat}
          >
            + Wybierz bit
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              onClick={play}
              disabled={busy || state.phase === "playing"}
              title="Odtwórz"
              aria-label="Odtwórz"
            >
              {busy ? "Ładowanie…" : "Odtwórz"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={pause}
              disabled={state.phase !== "playing"}
              title="Pauza"
              aria-label="Pauza"
            >
              Pauza
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={stop}
              title="Stop"
              aria-label="Stop"
            >
              Stop
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={onChooseBeat}
              title="Zmień bit"
              aria-label="Zmień bit"
            >
              Zmień bit
            </Button>
            <span
              className="ml-auto font-mono text-sm tabular-nums text-[var(--brd-ink)]"
              aria-live="polite"
            >
              {timeLabel}
            </span>
          </div>
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            {statusLabel}
          </p>
        </>
      )}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
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
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[color-mix(in_oklch,var(--brd-paper),var(--brd-ink)_2%)]"
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
              className="flex h-6 shrink-0 items-center border-b border-[var(--brd-line)] px-2 text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]"
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
              <div className="sticky top-0 z-[3] h-6 border-b border-[var(--brd-line)] bg-[var(--brd-paper)]">
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
                className="pointer-events-none absolute bottom-0 top-6 z-[4] w-0.5 bg-[var(--brd-ink)] will-change-transform"
                style={{ transform: `translateX(${playheadX}px)` }}
                data-testid="studio-playhead"
                data-playhead-ms={playheadMs}
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
