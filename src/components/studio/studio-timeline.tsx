"use client";

/**
 * Studio timeline: ruler, lanes, clips, live take region, playhead (moved out of studio-editor.tsx,
 * audit 2026-11-21). Clip geometry SSOT stays integer ms; zoom is view only.
 */

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { StudioClipLaneItem } from "@/components/studio/studio-clip-lane";
import {
  STUDIO_DAW_HEADER_WIDTH_CLASS,
  STUDIO_DAW_LANE_HEIGHT_PX,
  STUDIO_TRACK_EDGE,
  type StudioTimelineMode,
} from "@/components/studio/studio-daw-layout";
import { StudioLiveTakeRegion } from "@/components/studio/studio-live-take-region";
import { useStudioTransportPlayhead } from "@/components/studio/studio-transport-provider";
import { useLibText } from "@/i18n/use-lib-text";
import type { StudioClipEditCommit } from "@/lib/studio/studio-clip-edit-preview";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  buildTimelineRulerTicks,
  clampPxPerMs,
  contentWidthPx,
  msToPx,
  pxToMs,
  zoomInPxPerMs,
  zoomOutPxPerMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";
import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";

type TimelineMode = StudioTimelineMode;

/** Phone layout (< sm): each track header sits right above its own lane (audit 2026-11-21). */
const PHONE_QUERY = "(max-width: 639px)";
function subscribePhone(onChange: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Phase 7.1.5.1 — playhead leaf for timeline. */
export function StudioTimelinePlayheadBound(
  props: Omit<Parameters<typeof StudioTimeline>[0], "playheadMs">,
) {
  const { playheadMs } = useStudioTransportPlayhead();
  return <StudioTimeline {...props} playheadMs={playheadMs} />;
}

export function StudioTimeline({
  tracks,
  clips,
  timelineLengthMs,
  playheadMs,
  pxPerMs,
  mode,
  interactionLocked = false,
  selectedClipId,
  renderTrackHeader,
  renderLaneOverlay,
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
  /** Silver/Gold automation editor drawn over a track's lane (null = nothing). */
  renderLaneOverlay?: (track: StudioTrackDto) => ReactNode;
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
  const isPhone = useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
  /** Phone: headers inline above lanes; from sm: the side column. */
  const inlineHeaders = hasHeaders && isPhone;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[color-mix(in_oklch,var(--brd-paper),var(--brd-ink)_3%)] max-sm:flex-none"
      role="region"
      aria-label={tr("osCzasuProjektu")}
      data-testid="studio-timeline"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
        {hasHeaders && !inlineHeaders ? (
          <div
            className={`${STUDIO_DAW_HEADER_WIDTH_CLASS} flex min-h-0 shrink-0 flex-col border-[var(--brd-line)]`}
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
              className="min-h-0 flex-1 overflow-x-hidden sm:overflow-y-auto"
              onScroll={() => syncVerticalScroll("header")}
              data-testid="studio-track-header-scroll"
            >
              {tracks.map((track, index) => renderTrackHeader!(track, index))}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div
            ref={assignLaneScrollEl}
            className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden touch-pan-x sm:overflow-y-auto"
            data-studio-timeline-scroll="true"
            data-testid="studio-timeline-scroll"
            onScroll={() => {
              if (hasHeaders && !inlineHeaders) syncVerticalScroll("lane");
            }}
          >
            <div
              className={`relative ${
                seekEnabled ? "cursor-pointer" : "touch-pan-x"
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
              {tracks.map((track, index) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                return (
                  <Fragment key={track.id}>
                  {inlineHeaders ? (
                    // Header stays in view while the lane scrolls sideways; its clicks never seek.
                    <div
                      className="sticky left-0 z-[5] bg-[var(--brd-paper)]"
                      style={{ width: laneViewportWidthPx > 0 ? laneViewportWidthPx : "100vw" }}
                      data-testid="studio-track-header-inline"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {renderTrackHeader!(track, index)}
                    </div>
                  ) : null}
                  <div
                    className="studio-lane relative border-b border-[var(--brd-line)]/60"
                    data-studio-clip-lane={track.id}
                    data-track-type={track.trackType}
                    style={{
                      width: widthPx,
                      height: STUDIO_DAW_LANE_HEIGHT_PX,
                      ["--studio-lane-edge" as string]: STUDIO_TRACK_EDGE[Math.max(0, index - 1) % STUDIO_TRACK_EDGE.length],
                    }}
                  >
                    {track.trackType === "BEAT" ? (
                      <span className="studio-lane-title pointer-events-none sticky left-2 top-1 z-[3]">
                        {track.name.trim().toLowerCase() === "bit" ? "BIT" : `BIT · ${tl(track.name)}`}
                      </span>
                    ) : null}
                    {trackClips.length === 0 && track.trackType !== "BEAT" ? (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--brd-mute)]">
                        {tr("pustaSciezka")}
                      </span>
                    ) : null}
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
                    <StudioLiveTakeRegion
                      trackId={track.id}
                      pxPerMs={density}
                      laneHeightPx={STUDIO_DAW_LANE_HEIGHT_PX}
                    />
                    {renderLaneOverlay ? renderLaneOverlay(track) : null}
                  </div>
                  </Fragment>
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
