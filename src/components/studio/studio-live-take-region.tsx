"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  liveTakeColumns,
  studioLiveTakeStore,
  type LiveTakeSnapshot,
} from "@/lib/studio/studio-live-take";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import { clampPxPerMs, msToPx } from "@/lib/studio/studio-timeline-view";

/** CSS px per waveform bar; canvas backing store is capped for long takes on mobile. */
const BAR_PX = 2;
const MAX_CANVAS_PX = 8192;
/** Matches the inspector bottom sheet / BITEK narrow breakpoint. */
const NARROW_QUERY = "(max-width: 1023.98px)";
/** Inspector sheet height while capturing on mobile (studio-inspector-shell, max-md:max-h-[34vh]). */
const CAPTURE_SHEET_VH = 0.34;

const subscribe = (cb: () => void) => studioLiveTakeStore.subscribe(cb);
const getSnap = () => studioLiveTakeStore.get();
const getServerSnap = (): LiveTakeSnapshot | null => null;

/**
 * rec-live-ui — the take being recorded, drawn on its track lane: grows with the
 * transport, real-time mic peaks (from the panel's AnalyserNode), then freezes while
 * the take uploads / waits for Zachowaj, and disappears when the real clip lands.
 */
export function StudioLiveTakeRegion({
  trackId,
  pxPerMs,
  laneHeightPx,
}: {
  trackId: string;
  pxPerMs: number;
  laneHeightPx: number;
}) {
  const t = useTranslations("studio.studioLiveTake");
  const snap = useSyncExternalStore(subscribe, getSnap, getServerSnap);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const mine = snap && snap.trackId === trackId ? snap : null;
  const density = clampPxPerMs(pxPerMs);
  const left = mine ? msToPx(mine.startMs, density) : 0;
  const width = mine ? Math.max(4, msToPx(mine.elapsedMs, density)) : 0;
  const height = Math.max(16, laneHeightPx - 12);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!mine || !canvas) return;
    const raf = requestAnimationFrame(() => {
      const dpr = Math.min(
        2,
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      );
      const cssW = Math.min(width, MAX_CANVAS_PX / dpr);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, height);
      const cols = liveTakeColumns(mine.peaks, Math.floor(cssW / BAR_PX));
      const mid = height / 2;
      ctx.fillStyle =
        getComputedStyle(canvas).getPropertyValue("--brd-rec").trim() ||
        "#e5484d";
      for (let i = 0; i < cols.length; i += 1) {
        const h = Math.max(1, cols[i]! * (height - 2));
        ctx.fillRect(i * BAR_PX, mid - h / 2, BAR_PX - 0.5, h);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mine, width, height]);

  // Narrow screens: the record sheet owns the bottom — bring the armed lane (and the
  // transport above it) into view once, when capture starts.
  const recordingNow = mine?.status === "recording";
  useEffect(() => {
    const el = regionRef.current;
    if (!recordingNow || !el || !window.matchMedia(NARROW_QUERY).matches)
      return;
    const id = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const visibleBottom = window.innerHeight * (1 - CAPTURE_SHEET_VH) - 12;
      if (r.top >= 8 && r.bottom <= visibleBottom) return;
      const transport = document.querySelector(
        '[data-testid="studio-transport"]',
      );
      const tTop = transport ? transport.getBoundingClientRect().top : r.top;
      // Lane bottom just above the sheet; keep the transport (Stop) on screen when it fits.
      let delta = r.bottom - visibleBottom;
      if (tTop - delta < 8)
        delta = Math.min(delta, Math.max(tTop - 8, r.top - 8));
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [recordingNow]);

  if (!mine) return null;
  const label =
    mine.status === "recording"
      ? t("nagrywanie", { czas: formatStudioTimeMs(mine.elapsedMs) })
      : mine.status === "saving"
        ? t("zapisywanie")
        : t("zachowajLubOdrzuc");

  return (
    <>
      <div
        ref={regionRef}
        className="pointer-events-none absolute top-1.5 z-[3] overflow-hidden rounded-[2px] border border-[var(--brd-rec)] bg-[color-mix(in_srgb,var(--brd-rec)_14%,transparent)]"
        style={{ left, width, height }}
        data-testid="studio-live-take"
        data-status={mine.status}
        data-track-id={trackId}
        data-peaks={mine.peaks.length}
        aria-live="off"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-y-0 left-0 h-full"
          style={{ width: Math.min(width, MAX_CANVAS_PX) }}
          aria-hidden
        />
      </div>
      {/* Label rides the growing edge — readable even at low zoom (region only a few px wide). */}
      <span
        style={{ left: left + width + 4 }}
        className={`pointer-events-none absolute top-1.5 z-[3] whitespace-nowrap rounded-[2px] bg-[color-mix(in_srgb,var(--brd-paper)_85%,transparent)] px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brd-rec)] ${mine.status === "saving" ? "animate-pulse" : ""}`}
        data-testid="studio-live-take-label"
      >
        {label}
      </span>
    </>
  );
}
