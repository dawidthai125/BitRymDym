"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/button";
import {
  StudioFxChainEditor,
  StudioFxSheet,
} from "@/components/studio/studio-fx-chain-editor";
import { StudioMasterMeter } from "@/components/studio/studio-master-meter";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioRecordingPanel } from "@/components/studio/studio-recording-panel";
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
import { resolvePrimaryBeatRef } from "@/lib/studio/studio-beat-audio";
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
  fitPxPerMs,
  msToPx,
  pxToMs,
  resolveSelectedClipId,
  selectClipId,
  snapTimelineMs,
  STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
  zoomInPxPerMs,
  zoomOutPxPerMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";
import { isTrackAudible } from "@/lib/studio/studio-track-ops";
import { labelStudioTrackType } from "@/lib/ui/labels";

type TimelineMode = "seek" | "edit";
type FxPanelTarget =
  | { role: "master" }
  | { role: "track"; trackId: string };

export function StudioEditor({
  initialDocument,
}: {
  initialDocument: StudioProjectDocument;
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
      tracks: doc.tracks.map((t) => ({
        id: t.id,
        gainDb: t.gainDb,
        pan: t.pan,
        muted: t.muted,
        solo: t.solo,
        effectsChain: t.effectsChain,
      })),
      clips: doc.clips.map((c) => ({
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
      key={doc.project.id}
      timelineLengthMs={doc.project.timelineLengthMs}
      beatId={beatRef?.beatId ?? null}
      engineDocument={engineDocument}
    >
      <StudioEditorInner doc={doc} setDoc={setDoc} />
    </StudioTransportProvider>
  );
}

function StudioEditorInner({
  doc,
  setDoc,
}: {
  doc: StudioProjectDocument;
  setDoc: Dispatch<SetStateAction<StudioProjectDocument>>;
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
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [fxPanel, setFxPanel] = useState<FxPanelTarget | null>(null);
  /** Mix Track selection (SoT) — drives P6.6.1 Track meter target. */
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const transport = useStudioTransport();
  const { setTrackMeterTarget } = transport;
  const anySolo = doc.tracks.some((t) => t.solo);
  const length = doc.project.timelineLengthMs;
  const timelineMode: TimelineMode = recordingLocked ? "seek" : mode;
  const activeSelectedId = resolveSelectedClipId(
    selectedClipId,
    doc.clips.map((c) => c.id),
  );
  const selectedClip =
    doc.clips.find((c) => c.id === activeSelectedId) ?? null;
  const activeSelectedTrackId =
    selectedTrackId && doc.tracks.some((t) => t.id === selectedTrackId)
      ? selectedTrackId
      : null;

  useEffect(() => {
    setTrackMeterTarget(activeSelectedTrackId);
  }, [activeSelectedTrackId, setTrackMeterTarget]);

  function applySnap(ms: number, bounds?: { minMs?: number; maxMs?: number }) {
    return snapTimelineMs(ms, snapConfig, bounds);
  }

  function seekSnapped(ms: number) {
    if (recordingLocked) return;
    transport.seek(applySnap(ms, { minMs: 0, maxMs: length }));
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

  return (
    <div className="flex scroll-pb-[calc(4.75rem+env(safe-area-inset-bottom))] flex-col gap-6">
      <header className="space-y-1 border-b border-[var(--brd-line)] pb-4">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--brd-mute)]">
          Studio
        </p>
        <h1 className="brd-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {doc.project.title}
        </h1>
        <p className="text-sm text-[var(--brd-ink-soft)]">
          Tempo {doc.project.tempoBpm} BPM · metrum{" "}
          {doc.project.timeSignatureNum}/{doc.project.timeSignatureDen} · długość{" "}
          {formatStudioTimeMs(length)}
        </p>
      </header>

      <StudioTransportBar />

      <StudioRecordingPanel
        projectId={doc.project.id}
        tracks={doc.tracks}
        onRecordingActiveChange={(active) => {
          setRecordingLocked(active);
          if (active) {
            setMode("seek");
            setSelectedClipId(clearClipSelection());
            setConfirmDelete(false);
          }
        }}
        onClipCreated={(clip) => {
          setDoc((prev) => ({
            ...prev,
            clips: [...prev.clips, clip].sort(
              (a, b) => a.timelineStartMs - b.timelineStartMs,
            ),
          }));
          setSelectedClipId(selectClipId(null, clip.id));
          setStatus("Nagranie dodane na oś czasu.");
        }}
      />

      {recordingLocked ? (
        <p
          className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          TRYB NAGRYWANIA — edycja klipów i przewijanie są zablokowane.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
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
      ) : null}
      {status && !error ? (
        <p className="text-sm text-[var(--brd-mute)]" role="status">
          {status}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={timelineMode === "seek" ? "default" : "outline"}
          disabled={recordingLocked}
          onClick={() => setMode("seek")}
        >
          Przewijanie
        </Button>
        <Button
          type="button"
          size="sm"
          variant={timelineMode === "edit" ? "default" : "outline"}
          disabled={recordingLocked}
          onClick={() => setMode("edit")}
        >
          Edycja klipu
        </Button>
        <Button
          type="button"
          size="sm"
          variant={snapConfig.mode === "grid" ? "default" : "outline"}
          aria-pressed={snapConfig.mode === "grid"}
          title="Przyciągaj do siatki 1 s"
          onClick={() =>
            setSnapConfig((prev) =>
              createDefaultSnapConfig({
                ...prev,
                mode: prev.mode === "grid" ? "off" : "grid",
              }),
            )
          }
        >
          {snapConfig.mode === "grid" ? "Snap: włączony" : "Snap: wyłączony"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          title="Pomniejsz oś czasu"
          onClick={() => setPxPerMs((z) => zoomOutPxPerMs(z))}
        >
          Pomniejsz
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          title="Powiększ oś czasu"
          onClick={() => setPxPerMs((z) => zoomInPxPerMs(z))}
        >
          Powiększ
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          title="Dopasuj oś czasu do szerokości"
          onClick={() => {
            const viewport = document
              .querySelector('[aria-label="Oś czasu projektu"]')
              ?.clientWidth;
            setPxPerMs(
              fitPxPerMs(
                length,
                typeof viewport === "number" ? viewport : 360,
              ),
            );
          }}
        >
          Dopasuj
        </Button>
      </div>

      {timelineMode === "edit" && !recordingLocked ? (
        <ClipEditPanel
          clip={selectedClip}
          playheadMs={transport.state.playheadMs}
          timelineLengthMs={length}
          pending={pending}
          confirmDelete={confirmDelete}
          onConfirmDeleteChange={setConfirmDelete}
          onClearSelection={() => {
            setSelectedClipId(clearClipSelection());
            setConfirmDelete(false);
          }}
          onSaveFades={(fadeInMs, fadeOutMs) =>
            startTransition(async () => {
              try {
                await saveClipFades(fadeInMs, fadeOutMs);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd zapisu fade.");
                setStatus(null);
              }
            })
          }
          onSaveGain={(gainDb) =>
            startTransition(async () => {
              try {
                await saveClipGain(gainDb);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Błąd głośności klipu.",
                );
                setStatus(null);
              }
            })
          }
          onSaveMute={(muted) =>
            startTransition(async () => {
              try {
                await saveClipMute(muted);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Błąd wyciszenia klipu.",
                );
                setStatus(null);
              }
            })
          }
          onMove={(timelineStartMs) =>
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
            })
          }
          onTrimLeftToPlayhead={() =>
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
            })
          }
          onTrimRightToPlayhead={() =>
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
            })
          }
          onSplit={() =>
            startTransition(async () => {
              try {
                await splitSelectedAtPlayhead();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Błąd podziału.");
                setStatus(null);
              }
            })
          }
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

      <div className="flex flex-col gap-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-4">
        <section
          aria-label="Mix"
          className="space-y-3"
        >
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--brd-mute)]">
            Mix
          </p>
          <ul className="space-y-3">
          <li className="rounded-md border-2 border-[var(--brd-green)]/35 bg-[color-mix(in_srgb,var(--brd-bg)_88%,var(--brd-green)_12%)] p-3">
            <div className="mb-2">
              <p className="text-sm font-semibold text-[var(--brd-ink)]">
                Master
              </p>
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
                      e instanceof Error ? e.message : "Błąd Master głośności.",
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
                      e instanceof Error ? e.message : "Błąd Master panoramy.",
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
                className="min-h-11 w-full sm:w-auto"
                aria-label="Efekty Master"
                onClick={() => setFxPanel({ role: "master" })}
              >
                {studioFxEntryLabel(doc.project.masterFxChain)}
              </Button>
            </div>
          </li>
          {doc.tracks.map((track, index) => {
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
                    ? "rounded border border-[var(--brd-green)] bg-[var(--brd-bg)] p-3"
                    : "rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
                }
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
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
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="min-h-11 min-w-11"
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
                      className="min-h-11 min-w-11"
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
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StudioToggleChip
                    active={track.muted}
                    label="Wycisz"
                    title="Wycisz"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await patchTrack(track.id, { muted: !track.muted });
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Błąd wyciszenia.",
                          );
                        }
                      })
                    }
                  />
                  <StudioToggleChip
                    active={track.solo}
                    label="Odsłuch"
                    title="Solo"
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
                    label="REC"
                    title="Uzbrojenie nagrywania"
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
                </div>
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
                          err instanceof Error ? err.message : "Błąd panoramy.",
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
                    className="min-h-11 w-full sm:w-auto"
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
        </section>

        <StudioTimeline
          tracks={doc.tracks}
          clips={doc.clips}
          timelineLengthMs={length}
          playheadMs={transport.state.playheadMs}
          pxPerMs={pxPerMs}
          mode={timelineMode}
          interactionLocked={recordingLocked}
          selectedClipId={activeSelectedId}
          onSeek={seekSnapped}
          onSelectClip={(id) => {
            if (recordingLocked) return;
            setSelectedClipId(selectClipId(activeSelectedId, id));
            const clip = doc.clips.find((c) => c.id === id);
            if (clip) setSelectedTrackId(clip.trackId);
            setMode("edit");
            setConfirmDelete(false);
          }}
          onMoveClip={(clipId, timelineStartMs) => {
            if (recordingLocked) return;
            setSelectedClipId(selectClipId(activeSelectedId, clipId));
            const clip = doc.clips.find((c) => c.id === clipId);
            if (clip) setSelectedTrackId(clip.trackId);
            const maxStart = clip
              ? Math.max(0, length - clip.durationMs)
              : 0;
            const snapped = applySnap(timelineStartMs, {
              minMs: 0,
              maxMs: maxStart,
            });
            startTransition(async () => {
              try {
                setError(null);
                setStatus("Zapisywanie…");
                const res = await fetch(
                  `/api/studio/projects/${doc.project.id}/clips/${clipId}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      op: "move",
                      timelineStartMs: snapped,
                      expectedDocumentVersion: doc.project.documentVersion,
                    }),
                  },
                );
                const json = (await res.json()) as {
                  clip?: StudioClipDto;
                  documentVersion?: number;
                  error?: string;
                  code?: string;
                };
                if (
                  res.status === 409 ||
                  json.code === "FX_CHAIN_VERSION_CONFLICT"
                ) {
                  throw new Error(json.error ?? FX_CHAIN_CONFLICT_UI_PL);
                }
                if (!res.ok || !json.clip) {
                  throw new Error(json.error ?? "Nie udało się przesunąć.");
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
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Błąd przesunięcia.",
                );
                setStatus(null);
              }
            });
          }}
        />
      </div>

      <p className="text-xs text-[var(--brd-mute)]">
        P5.4 — zoom, snap i zaznaczenie na osi czasu. Usunięcie klipu nie
        usuwa źródła. Punch i nagranie wokalu w kolejnych etapach.
      </p>

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
    <div className="min-w-0 space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3">
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

function StudioTransportBar() {
  const { state, timeLabel, play, pause, stop, audioState, error, hasBeat } =
    useStudioTransport();
  const busy = audioState === "loading";
  const statusLabel =
    audioState === "loading"
      ? "Ładowanie bitu…"
      : audioState === "idle"
        ? "Bit oczekuje na załadowanie"
        : audioState === "no_beat"
          ? "Brak bitu w projekcie"
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
                    : "Brak bitu";

  return (
    <div
      className="sticky top-14 z-20 space-y-2 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 shadow-sm sm:top-2"
      role="region"
      aria-label="Transport Studio"
    >
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
  onSeek,
  onSelectClip,
  onMoveClip,
}: {
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
  timelineLengthMs: number;
  playheadMs: number;
  pxPerMs: number;
  mode: TimelineMode;
  interactionLocked?: boolean;
  selectedClipId: string | null;
  onSeek: (ms: number) => void;
  onSelectClip: (clipId: string) => void;
  onMoveClip: (clipId: string, timelineStartMs: number) => void;
}) {
  const editEnabled = mode === "edit" && !interactionLocked;
  const seekEnabled = mode === "seek" && !interactionLocked;
  const density = clampPxPerMs(pxPerMs);
  const widthPx = contentWidthPx(timelineLengthMs, density);
  const playheadX = msToPx(playheadMs, density);
  const ticks = buildTimelineRulerTicks({
    timelineLengthMs,
    pxPerMs: density,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    clipId: string;
    originX: number;
    originStart: number;
  } | null>(null);

  function seekFromPointer(event: {
    currentTarget: HTMLDivElement;
    clientX: number;
  }) {
    if (!seekEnabled) return;
    // Content node rect already shifts with scroll — do not add scrollLeft again.
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = Math.min(
      widthPx,
      Math.max(0, event.clientX - rect.left),
    );
    onSeek(pxToMs(localX, density));
  }

  return (
    <div
      className="relative min-h-[16rem] rounded border border-[var(--brd-line)] bg-[color-mix(in_oklch,var(--brd-bg),var(--brd-ink)_2%)]"
      role="region"
      aria-label="Oś czasu projektu"
    >
      <div
        ref={scrollRef}
        className="overflow-x-auto touch-pan-x"
      >
        <div
          className={`relative space-y-2 p-2 ${
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
          <div className="relative h-6 border-b border-[var(--brd-line)]">
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
                className="relative h-12 rounded bg-[var(--brd-bg)]"
                style={{ width: widthPx }}
              >
                <span className="pointer-events-none absolute left-2 top-1 z-[1] text-[10px] text-[var(--brd-mute)]">
                  {track.name}
                </span>
                {trackClips.map((clip) => {
                  const left = msToPx(clip.timelineStartMs, density);
                  const width = Math.max(8, msToPx(clip.durationMs, density));
                  const selected = clip.id === selectedClipId;
                  return (
                    <div
                      key={clip.id}
                      className={`absolute bottom-1 top-5 rounded px-1 text-[10px] text-[var(--brd-ink)] ${
                        selected
                          ? "z-[2] bg-[var(--brd-ink)]/30 ring-2 ring-[var(--brd-ink)]"
                          : "bg-[var(--brd-ink)]/15"
                      } ${editEnabled ? "pointer-events-auto cursor-grab touch-none" : "pointer-events-none"}`}
                      style={{ left, width }}
                      title={`${clip.sourceKind} · ${formatStudioTimeMs(clip.timelineStartMs)}`}
                      aria-selected={selected}
                      onPointerDown={
                        editEnabled
                          ? (e) => {
                              e.stopPropagation();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              setDragState({
                                clipId: clip.id,
                                originX: e.clientX,
                                originStart: clip.timelineStartMs,
                              });
                              onSelectClip(clip.id);
                            }
                          : undefined
                      }
                      onPointerMove={
                        editEnabled
                          ? (e) => {
                              if (!dragState || dragState.clipId !== clip.id)
                                return;
                              e.stopPropagation();
                              const deltaMs = pxToMs(
                                e.clientX - dragState.originX,
                                density,
                              );
                              const maxStart = Math.max(
                                0,
                                timelineLengthMs - clip.durationMs,
                              );
                              const next = Math.min(
                                maxStart,
                                Math.max(0, dragState.originStart + deltaMs),
                              );
                              e.currentTarget.style.left = `${msToPx(next, density)}px`;
                              (
                                e.currentTarget as HTMLElement & {
                                  dataset: DOMStringMap & {
                                    previewStart?: string;
                                  };
                                }
                              ).dataset.previewStart = String(next);
                            }
                          : undefined
                      }
                      onPointerUp={
                        editEnabled
                          ? (e) => {
                              e.stopPropagation();
                              const preview = Number(
                                (e.currentTarget as HTMLElement).dataset
                                  .previewStart,
                              );
                              setDragState(null);
                              if (
                                Number.isFinite(preview) &&
                                preview !== clip.timelineStartMs
                              ) {
                                onMoveClip(clip.id, preview);
                              }
                            }
                          : undefined
                      }
                      onClick={
                        editEnabled
                          ? (e) => {
                              e.stopPropagation();
                              onSelectClip(clip.id);
                            }
                          : undefined
                      }
                    >
                      {clip.sourceKind === "TAKE"
                        ? "Nagranie"
                        : clip.sourceKind === "BEAT_REF"
                          ? "Bit"
                          : "Artefakt"}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div
            className="pointer-events-none absolute bottom-2 top-8 w-0.5 bg-[var(--brd-ink)]"
            style={{ left: playheadX }}
            aria-hidden
          />
        </div>
      </div>
      <label className="block border-t border-[var(--brd-line)] px-2 py-2 text-xs text-[var(--brd-mute)]">
        Playhead · {formatStudioTimeMs(playheadMs)}
        <input
          type="range"
          min={0}
          max={timelineLengthMs}
          step={1}
          value={playheadMs}
          disabled={interactionLocked}
          className="mt-1 w-full"
          aria-label="Pozycja playhead"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
