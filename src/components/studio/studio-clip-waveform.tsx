"use client";

/**
 * Phase 3 / 3.1 — Precision StudioClipWaveform (canvas + DPR).
 * Visual layer only — does not own playhead / AudioContext / StudioAudioEngine.
 * Zoom redraws aggregate cached peaks; never re-decodes.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import { resolveStudioWaveformPeaks } from "@/lib/studio/studio-waveform-cache";
import {
  resolveWaveformEdgeHit,
  resolveWaveformSourceWindow,
  studioWaveformSourceKey,
  timelineMsFromClipLocalX,
} from "@/lib/studio/studio-waveform-geometry";
import {
  aggregateStudioPeaksForCssWidth,
  sliceStudioPeaksForSourceWindow,
  type StudioWaveformPeak,
} from "@/lib/studio/studio-waveform-peaks";

export type StudioClipWaveformProps = {
  clip: StudioClipDto;
  widthPx: number;
  heightPx: number;
  selected?: boolean;
  /** Seek / split targeting — parent maps to transport.seek. */
  onTimelineMs?: (timelineMs: number) => void;
  /** Resolve signed URL for this clip's source (shared with transport caches). */
  resolveSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  /** When true, pointer is used for drag by parent — waveform still draws. */
  interactionLocked?: boolean;
  className?: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function readCssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value || fallback;
}

function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: readonly StudioWaveformPeak[],
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  opts: { selected: boolean; muted: boolean },
) {
  const w = cssWidth * dpr;
  const h = cssHeight * dpr;
  ctx.clearRect(0, 0, w, h);

  const mid = h / 2;
  const ink = readCssColor("--brd-ink", "#1a1a1a");
  const green = readCssColor("--brd-green", "#0B2D26");
  const stroke = opts.selected ? green : ink;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.globalAlpha = opts.muted ? 0.28 : opts.selected ? 0.72 : 0.48;
  // Thin precision strokes — scale lightly with DPR, stay ≤ 1 CSS px.
  ctx.lineWidth = Math.max(1, Math.min(dpr, 1.25 * dpr * 0.75));
  ctx.lineCap = "butt";

  if (peaks.length === 0 || cssWidth < 1) {
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const amp = mid * 0.9;
  // Zoom projection: aggregate high-res peaks → CSS columns (no decode).
  const columns = aggregateStudioPeaksForCssWidth(peaks, cssWidth);
  const step = w / columns.length;

  for (let i = 0; i < columns.length; i += 1) {
    const p = columns[i]!;
    const xPx = (i + 0.5) * step;
    const y0 = mid - p.max * amp;
    const y1 = mid - p.min * amp;
    // Subtle bipolar fill for DAW readability in compact lanes.
    ctx.globalAlpha = opts.muted ? 0.12 : opts.selected ? 0.28 : 0.16;
    ctx.fillRect(xPx - step * 0.35, y0, Math.max(1, step * 0.7), y1 - y0);
    ctx.globalAlpha = opts.muted ? 0.28 : opts.selected ? 0.78 : 0.55;
    ctx.beginPath();
    ctx.moveTo(xPx, y0);
    ctx.lineTo(xPx, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFadeOverlays(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  fades: { durationMs: number; fadeInMs: number; fadeOutMs: number },
) {
  if (fades.durationMs < 1) return;
  const w = cssWidth * dpr;
  const h = cssHeight * dpr;
  const paper = readCssColor("--brd-paper", "#F5F4EE");
  ctx.fillStyle = paper;
  ctx.globalAlpha = 0.45;

  if (fades.fadeInMs > 0) {
    const fadeW = Math.min(w, (fades.fadeInMs / fades.durationMs) * w);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(fadeW, 0);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
  if (fades.fadeOutMs > 0) {
    const fadeW = Math.min(w, (fades.fadeOutMs / fades.durationMs) * w);
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w - fadeW, 0);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function StudioClipWaveform({
  clip,
  widthPx,
  heightPx,
  selected = false,
  onTimelineMs,
  resolveSourceUrl,
  interactionLocked = false,
  className,
}: StudioClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const guideLabelRef = useRef<HTMLSpanElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [windowPeaks, setWindowPeaks] = useState<StudioWaveformPeak[] | null>(
    null,
  );
  const [peaksPerSecond, setPeaksPerSecond] = useState<number | null>(null);

  const sourceKey = studioWaveformSourceKey(clip);
  const sourceWindow = resolveWaveformSourceWindow(clip);
  const displayLoadState: LoadState = sourceKey ? loadState : "error";
  const displayPeaks = sourceKey ? windowPeaks : null;

  // Load / cache peaks once per source (shared across duplicate clips).
  useEffect(() => {
    if (!sourceKey) return;
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadState("loading");
      try {
        const url = await resolveSourceUrl(clip);
        if (cancelled) return;
        if (!url) {
          setWindowPeaks(null);
          setPeaksPerSecond(null);
          setLoadState("error");
          return;
        }
        const { payload } = await resolveStudioWaveformPeaks({
          sourceKey,
          url,
        });
        if (cancelled) return;
        setPeaksPerSecond(payload.peaksPerSecond);
        setWindowPeaks(
          sliceStudioPeaksForSourceWindow({
            peaks: payload.peaks,
            sourceDurationMs: payload.durationMs,
            sourceOffsetMs: sourceWindow.sourceStartMs,
            windowDurationMs: sourceWindow.durationMs,
          }),
        );
        setLoadState("ready");
      } catch {
        if (!cancelled) {
          setWindowPeaks(null);
          setPeaksPerSecond(null);
          setLoadState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Source identity + window only — gain/mute/fade/zoom must not re-decode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional source-window deps
  }, [
    sourceKey,
    clip.sourceKind,
    clip.sourceTakeId,
    clip.sourceBeatId,
    clip.sourceArtifactId,
    sourceWindow.sourceStartMs,
    sourceWindow.durationMs,
    resolveSourceUrl,
  ]);

  // Redraw on geometry / selection / mute / fade / size — not on playhead / gain / hover.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = Math.max(1, widthPx);
    const cssH = Math.max(1, heightPx);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (displayLoadState === "ready" && displayPeaks) {
      drawPeaks(ctx, displayPeaks, cssW, cssH, dpr, {
        selected,
        muted: clip.muted,
      });
      drawFadeOverlays(ctx, cssW, cssH, dpr, {
        durationMs: clip.durationMs,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
      });
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mid = (cssH * dpr) / 2;
      ctx.strokeStyle = readCssColor("--brd-line", "#d4cfc4");
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cssW * dpr, mid);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [
    widthPx,
    heightPx,
    displayLoadState,
    displayPeaks,
    selected,
    clip.muted,
    clip.fadeInMs,
    clip.fadeOutMs,
    clip.durationMs,
  ]);

  function localFromEvent(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = Math.min(
      widthPx,
      Math.max(0, event.clientX - rect.left),
    );
    const timelineMs = timelineMsFromClipLocalX({
      timelineStartMs: clip.timelineStartMs,
      durationMs: clip.durationMs,
      localXPx: localX,
      widthPx,
    });
    const edge = resolveWaveformEdgeHit({ localXPx: localX, widthPx });
    return { localX, timelineMs, edge };
  }

  function updateGuide(next: {
    localX: number;
    timelineMs: number;
    edge: "left" | "right" | "body";
  } | null) {
    const guide = guideRef.current;
    const label = guideLabelRef.current;
    if (!guide || !label) return;
    if (!next) {
      guide.hidden = true;
      return;
    }
    guide.hidden = false;
    guide.style.left = `${next.localX}px`;
    guide.dataset.timelineMs = String(next.timelineMs);
    guide.dataset.edge = next.edge;
    const edgeHint =
      next.edge === "left"
        ? " · trim L"
        : next.edge === "right"
          ? " · trim R"
          : "";
    label.textContent = `${formatStudioTimeMs(next.timelineMs)}${edgeHint}`;
    const line = guide.firstElementChild as HTMLElement | null;
    if (line) {
      line.className =
        next.edge === "body"
          ? "absolute inset-y-0 w-px bg-[var(--brd-green)]"
          : "absolute inset-y-0 w-px bg-[var(--brd-ink)]";
    }
  }

  return (
    <div
      className={`relative h-full w-full min-w-0 ${className ?? ""}`}
      data-testid="studio-clip-waveform"
      data-load-state={displayLoadState}
      data-source-key={sourceKey ?? undefined}
      data-source-start-ms={sourceWindow.sourceStartMs}
      data-source-end-ms={sourceWindow.sourceEndMs}
      data-peaks-per-second={peaksPerSecond ?? undefined}
      data-muted={clip.muted ? "true" : "false"}
      aria-label={`Waveform · ${formatStudioTimeMs(clip.timelineStartMs)}–${formatStudioTimeMs(clip.timelineStartMs + clip.durationMs)}`}
      role="img"
      onPointerMove={
        interactionLocked
          ? undefined
          : (event) => {
              updateGuide(localFromEvent(event));
            }
      }
      onPointerLeave={
        interactionLocked
          ? undefined
          : () => {
              updateGuide(null);
            }
      }
      onPointerDown={
        interactionLocked || !onTimelineMs
          ? undefined
          : (event) => {
              if (event.button !== 0) return;
              const next = localFromEvent(event);
              event.stopPropagation();
              onTimelineMs(next.timelineMs);
            }
      }
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />
      {displayLoadState === "loading" ? (
        <div
          className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--brd-ink)_6%,transparent)]"
          data-testid="studio-waveform-loading"
          aria-hidden
        />
      ) : null}
      {displayLoadState === "error" ? (
        <div
          className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 truncate text-[9px] text-[var(--brd-mute)]"
          data-testid="studio-waveform-error"
        >
          —
        </div>
      ) : null}
      <div
        ref={guideRef}
        hidden
        className="pointer-events-none absolute inset-y-0 z-[2]"
        data-testid="studio-waveform-split-guide"
      >
        <div className="absolute inset-y-0 w-px bg-[var(--brd-green)]" />
        <span
          ref={guideLabelRef}
          className="absolute left-1 top-0 whitespace-nowrap rounded bg-[var(--brd-paper)]/90 px-0.5 font-mono text-[9px] text-[var(--brd-ink)]"
        />
      </div>
    </div>
  );
}
