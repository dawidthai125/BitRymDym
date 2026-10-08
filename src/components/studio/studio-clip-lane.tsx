"use client";

/**
 * Phase 4 — Clip interaction layer: MOVE / TRIM L/R / seek·split targeting.
 * Preview via DOM; one CAS commit on pointer up.
 */

import { useLayoutEffect, useRef } from "react";

import { StudioClipWaveform } from "@/components/studio/studio-clip-waveform";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import {
  formatClipEditDeltaMs,
  planClipGeometryCommit,
  previewMoveClipStartMs,
  previewTrimLeftToEdgeMs,
  previewTrimRightToEdgeMs,
  type StudioClipEditCommit,
} from "@/lib/studio/studio-clip-edit-preview";
import type { StudioClipGeometry } from "@/lib/studio/studio-clip-ops";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  clampPxPerMs,
  msToPx,
  pxToMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";
import { studioWaveformPeaksCache } from "@/lib/studio/studio-waveform-cache";
import { studioWaveformSourceKey } from "@/lib/studio/studio-waveform-geometry";

type TimelineMode = "seek" | "edit";

type DragKind = "move" | "trim_left" | "trim_right";

export type StudioClipLaneItemProps = {
  clip: StudioClipDto;
  timelineLengthMs: number;
  pxPerMs: number;
  mode: TimelineMode;
  selected: boolean;
  interactionLocked?: boolean;
  laneHeightPx: number;
  snapConfig: StudioSnapConfig;
  resolveSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  onSelectClip: (clipId: string) => void;
  onSeek: (ms: number) => void;
  onCommitGeometry: (
    clipId: string,
    commit: Exclude<StudioClipEditCommit, { kind: "noop" }>,
  ) => void;
};

function resolveSourceDurationMs(clip: StudioClipDto): number | null {
  const key = studioWaveformSourceKey(clip);
  if (!key) return null;
  return studioWaveformPeaksCache.getBySourceKey(key)?.durationMs ?? null;
}

function toGeom(clip: StudioClipDto): StudioClipGeometry {
  return {
    timelineStartMs: clip.timelineStartMs,
    durationMs: clip.durationMs,
    sourceOffsetMs: clip.sourceOffsetMs,
  };
}

export function StudioClipLaneItem({
  clip,
  timelineLengthMs,
  pxPerMs,
  mode,
  selected,
  interactionLocked = false,
  laneHeightPx,
  snapConfig,
  resolveSourceUrl,
  onSelectClip,
  onSeek,
  onCommitGeometry,
}: StudioClipLaneItemProps) {
  const density = clampPxPerMs(pxPerMs);
  const editEnabled = mode === "edit" && !interactionLocked;
  const seekEnabled = mode === "seek" && !interactionLocked;
  const clipInteractive = !interactionLocked;

  const shellRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    kind: DragKind;
    originClientX: number;
    origin: StudioClipGeometry;
  } | null>(null);
  const previewRef = useRef<StudioClipGeometry | null>(null);
  const layoutRef = useRef({ left: 0, width: 0, density: 0 });

  const left = msToPx(clip.timelineStartMs, density);
  const width = Math.max(8, msToPx(clip.durationMs, density));

  useLayoutEffect(() => {
    layoutRef.current = { left, width, density };
  }, [left, width, density]);

  function showReadout(text: string) {
    const el = readoutRef.current;
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  }

  function hideReadout() {
    const el = readoutRef.current;
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  function applyPreviewVisual(next: StudioClipGeometry | null) {
    const shell = shellRef.current;
    if (!shell) return;
    previewRef.current = next;
    const layout = layoutRef.current;
    if (!next) {
      shell.style.left = `${layout.left}px`;
      shell.style.width = `${layout.width}px`;
      shell.style.transform = "";
      hideReadout();
      return;
    }
    shell.style.left = `${msToPx(next.timelineStartMs, layout.density)}px`;
    shell.style.width = `${Math.max(8, msToPx(next.durationMs, layout.density))}px`;
    shell.style.transform = "";
  }

  function beginDrag(kind: DragKind, clientX: number) {
    dragRef.current = {
      kind,
      originClientX: clientX,
      origin: toGeom(clip),
    };
    previewRef.current = null;
    onSelectClip(clip.id);
  }

  function updateDrag(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const d = layoutRef.current.density;
    const deltaMs = pxToMs(clientX - drag.originClientX, d);
    const sourceDurationMs = resolveSourceDurationMs(clip);
    const snap = snapConfig.mode === "grid" ? snapConfig : undefined;

    let next: StudioClipGeometry | null = null;
    if (drag.kind === "move") {
      next = previewMoveClipStartMs({
        clip: drag.origin,
        timelineStartMs: drag.origin.timelineStartMs + deltaMs,
        timelineLengthMs,
        snap,
      });
      if (next) {
        showReadout(
          `Δ ${formatClipEditDeltaMs(next.timelineStartMs - drag.origin.timelineStartMs)}`,
        );
      }
    } else if (drag.kind === "trim_left") {
      next = previewTrimLeftToEdgeMs({
        clip: drag.origin,
        edgeTimelineMs: drag.origin.timelineStartMs + deltaMs,
        timelineLengthMs,
        sourceDurationMs,
        snap,
      });
      if (next) {
        const delta = next.timelineStartMs - drag.origin.timelineStartMs;
        showReadout(
          `L ${formatStudioTimeMs(next.timelineStartMs)} · ${formatClipEditDeltaMs(delta)}`,
        );
      }
    } else {
      const originEnd =
        drag.origin.timelineStartMs + drag.origin.durationMs;
      next = previewTrimRightToEdgeMs({
        clip: drag.origin,
        edgeTimelineMs: originEnd + deltaMs,
        timelineLengthMs,
        sourceDurationMs,
        snap,
      });
      if (next) {
        const delta = next.durationMs - drag.origin.durationMs;
        showReadout(
          `R ${formatStudioTimeMs(next.timelineStartMs + next.durationMs)} · ${formatClipEditDeltaMs(delta)}`,
        );
      }
    }
    applyPreviewVisual(next ?? drag.origin);
  }

  function endDrag() {
    const drag = dragRef.current;
    const preview = previewRef.current;
    dragRef.current = null;
    previewRef.current = null;
    hideReadout();
    applyPreviewVisual(null);

    if (!drag || !preview) return;
    const commit = planClipGeometryCommit(drag.origin, preview);
    if (commit.kind === "noop") return;
    onCommitGeometry(clip.id, commit);
  }

  function cancelDrag() {
    dragRef.current = null;
    previewRef.current = null;
    applyPreviewVisual(null);
    hideReadout();
  }

  return (
    <div
      ref={shellRef}
      data-studio-clip={clip.id}
      data-timeline-start-ms={clip.timelineStartMs}
      data-source-offset-ms={clip.sourceOffsetMs}
      data-duration-ms={clip.durationMs}
      className={`absolute bottom-1 top-1 flex overflow-visible rounded ${
        selected
          ? "z-[2] bg-[var(--brd-ink)]/20 ring-2 ring-[var(--brd-ink)]"
          : "bg-[var(--brd-ink)]/10"
      } ${clipInteractive ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ left, width }}
      title={`${clip.sourceKind} · ${formatStudioTimeMs(clip.timelineStartMs)}`}
      aria-selected={selected}
    >
      {editEnabled ? (
        <button
          type="button"
          data-studio-trim-left={clip.id}
          className="absolute inset-y-0 left-0 z-[3] w-3 min-w-3 -translate-x-1/2 cursor-ew-resize touch-none max-sm:min-h-11 max-sm:w-11 max-sm:min-w-11 sm:w-4"
          aria-label="Przytnij lewą krawędź"
          title="Przytnij lewą krawędź"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            beginDrag("trim_left", e.clientX);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current || dragRef.current.kind !== "trim_left") return;
            e.stopPropagation();
            updateDrag(e.clientX);
          }}
          onPointerUp={(e) => {
            if (!dragRef.current || dragRef.current.kind !== "trim_left") return;
            e.stopPropagation();
            endDrag();
          }}
          onPointerCancel={cancelDrag}
        >
          <span className="pointer-events-none absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded bg-[var(--brd-green)]" />
        </button>
      ) : null}

      {editEnabled ? (
        <button
          type="button"
          data-studio-clip-drag={clip.id}
          className="relative z-[2] h-full w-2 min-w-2 shrink-0 cursor-grab touch-none border-r border-[var(--brd-line)]/40 bg-[var(--brd-ink)]/10 max-sm:min-h-11 max-sm:w-11 max-sm:min-w-11"
          aria-label="Przeciągnij klip"
          title="Przeciągnij klip"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            beginDrag("move", e.clientX);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current || dragRef.current.kind !== "move") return;
            e.stopPropagation();
            updateDrag(e.clientX);
          }}
          onPointerUp={(e) => {
            if (!dragRef.current || dragRef.current.kind !== "move") return;
            e.stopPropagation();
            endDrag();
          }}
          onPointerCancel={cancelDrag}
        />
      ) : null}

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded">
        <StudioClipWaveform
          clip={clip}
          widthPx={Math.max(1, width - (editEnabled ? 8 : 0))}
          heightPx={laneHeightPx - 8}
          selected={selected}
          interactionLocked={interactionLocked}
          resolveSourceUrl={resolveSourceUrl}
          onTimelineMs={
            seekEnabled || editEnabled
              ? (timelineMs) => {
                  onSelectClip(clip.id);
                  onSeek(timelineMs);
                }
              : undefined
          }
        />
      </div>

      {editEnabled ? (
        <button
          type="button"
          data-studio-trim-right={clip.id}
          className="absolute inset-y-0 right-0 z-[3] w-3 min-w-3 translate-x-1/2 cursor-ew-resize touch-none max-sm:min-h-11 max-sm:w-11 max-sm:min-w-11 sm:w-4"
          aria-label="Przytnij prawą krawędź"
          title="Przytnij prawą krawędź"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            beginDrag("trim_right", e.clientX);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current || dragRef.current.kind !== "trim_right")
              return;
            e.stopPropagation();
            updateDrag(e.clientX);
          }}
          onPointerUp={(e) => {
            if (!dragRef.current || dragRef.current.kind !== "trim_right")
              return;
            e.stopPropagation();
            endDrag();
          }}
          onPointerCancel={cancelDrag}
        >
          <span className="pointer-events-none absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded bg-[var(--brd-green)]" />
        </button>
      ) : null}

      <div
        ref={readoutRef}
        hidden
        data-testid="studio-clip-edit-readout"
        className="pointer-events-none absolute -top-5 left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-1 py-0.5 font-mono text-[10px] text-[var(--brd-ink)] shadow-sm"
      />
    </div>
  );
}
