"use client";

/**
 * Studio timeline: ruler, lanes, clips, live take region, playhead (moved out of studio-editor.tsx,
 * audit 2026-11-21). Clip geometry SSOT stays integer ms; zoom is view only.
 */

import { Fragment, memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";

import { StudioClipLaneItem } from "@/components/studio/studio-clip-lane";
import {
  STUDIO_DAW_HEADER_WIDTH_CLASS,
  STUDIO_DAW_LANE_HEIGHT_PX,
  STUDIO_TRACK_EDGE,
  type StudioTimelineMode,
} from "@/components/studio/studio-daw-layout";
import { StudioLiveTakeRegion } from "@/components/studio/studio-live-take-region";
import {
  useStudioTransportControls,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import { usePocketMarkers } from "@/components/studio/use-pocket-markers";
import { useLibText } from "@/i18n/use-lib-text";
import type { StudioClipEditCommit } from "@/lib/studio/studio-clip-edit-preview";
import { studioMarkerKindLabelPl, type StudioMarkerDto } from "@/lib/studio/studio-markers-state";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import {
  buildTimelineRulerTicks,
  clampPxPerMs,
  contentWidthPx,
  followPlayheadScrollLeft,
  msToPx,
  pxToMs,
  zoomInPxPerMs,
  zoomOutPxPerMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";
import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";

type TimelineMode = StudioTimelineMode;
const NO_MARKERS: readonly StudioMarkerDto[] = [];

/** Phone layout (< sm): each track header sits right above its own lane (audit 2026-11-21). */
const PHONE_QUERY = "(max-width: 639px)";
function subscribePhone(onChange: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Ruler ticks are drawn only around the visible part (a full-zoom ruler has thousands). */
const RULER_CHUNK_PX = 800;
/** The user scrolled the lanes by hand: leave the view alone for a moment. */
const FOLLOW_PAUSE_MS = 2000;

const TimelineRuler = memo(function TimelineRuler({
  timelineLengthMs,
  density,
  scrollRef,
  markers,
  loop,
  onSeek,
}: {
  timelineLengthMs: number;
  density: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  markers: readonly StudioMarkerDto[];
  /** Loop range drawn on the ruler, null = off. */
  loop: { startMs: number; endMs: number } | null;
  onSeek: (ms: number) => void;
}) {
  const tl = useLibText();
  const ticks = useMemo(
    () => buildTimelineRulerTicks({ timelineLengthMs, pxPerMs: density }),
    [timelineLengthMs, density],
  );
  const [view, setView] = useState({ from: -RULER_CHUNK_PX, to: 4 * RULER_CHUNK_PX });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => {
      const from = (Math.floor(el.scrollLeft / RULER_CHUNK_PX) - 1) * RULER_CHUNK_PX;
      const to = from + (Math.ceil(el.clientWidth / RULER_CHUNK_PX) + 3) * RULER_CHUNK_PX;
      setView((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollRef]);

  return (
    <div
      className="sticky top-0 z-[3] h-7 border-b border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-paper)_92%,var(--brd-ink)_8%)]"
      data-testid="studio-timeline-ruler"
    >
      {loop && loop.endMs > loop.startMs ? (
        <span
          className="pointer-events-none absolute inset-y-0 border-x border-[var(--brd-amber)] bg-[color-mix(in_srgb,var(--brd-amber)_22%,transparent)]"
          style={{ left: msToPx(loop.startMs, density), width: msToPx(loop.endMs - loop.startMs, density) }}
          data-testid="studio-timeline-loop"
          aria-hidden
        />
      ) : null}
      {ticks.map((tick) => {
        const x = msToPx(tick.ms, density);
        if (x < view.from || x > view.to) return null;
        return (
          <span
            key={tick.ms}
            className={`absolute top-0 text-[10px] ${tick.ms === 0 ? "pl-0.5" : "-translate-x-1/2"} ${
              tick.major ? "text-[var(--brd-ink)]" : "text-[var(--brd-mute)]"
            }`}
            style={{ left: x }}
          >
            {tl(tick.major ? formatStudioTimeMs(tick.ms) : "·")}
          </span>
        );
      })}
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          data-testid="studio-timeline-marker"
          data-marker-kind={marker.kind}
          className="absolute bottom-0 max-w-28 truncate border-l-2 border-[var(--brd-amber)] bg-[var(--brd-paper)] px-1 text-[10px] leading-[13px] font-semibold text-[var(--brd-amber)] max-sm:max-w-36 max-sm:px-2 max-sm:text-xs max-sm:leading-6 pointer-coarse:sm:border-t-[14px] pointer-coarse:sm:border-t-transparent pointer-coarse:sm:bg-clip-padding"
          style={{ left: msToPx(marker.positionMs, density) }}
          title={`${tl(studioMarkerKindLabelPl(marker.kind))} · ${formatStudioTimeMs(marker.positionMs)}`}
          onClick={(event) => {
            event.stopPropagation();
            onSeek(marker.positionMs);
          }}
        >
          {tl(studioMarkerKindLabelPl(marker.kind))}
        </button>
      ))}
    </div>
  );
});

/** Playhead leaf: the only part of the lanes that renders on every playback frame. */
function TimelinePlayhead({
  density,
  scrollRef,
}: {
  density: number;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { playheadMs } = useStudioTransportPlayhead();
  const { phase } = useStudioTransportControls();
  const userScrollAtRef = useRef(0);
  const x = msToPx(playheadMs, density);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onUser = () => {
      userScrollAtRef.current = Date.now();
    };
    el.addEventListener("wheel", onUser, { passive: true });
    el.addEventListener("pointerdown", onUser, { passive: true });
    el.addEventListener("touchmove", onUser, { passive: true });
    return () => {
      el.removeEventListener("wheel", onUser);
      el.removeEventListener("pointerdown", onUser);
      el.removeEventListener("touchmove", onUser);
    };
  }, [scrollRef]);

  // Play / record just started: go to the playhead now, whatever was scrolled before.
  useEffect(() => {
    if (phase === "playing") userScrollAtRef.current = 0;
  }, [phase]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || phase !== "playing") return;
    if (Date.now() - userScrollAtRef.current < FOLLOW_PAUSE_MS) return;
    const next = followPlayheadScrollLeft({
      playheadPx: x,
      scrollLeft: el.scrollLeft,
      viewportPx: el.clientWidth,
    });
    if (next != null) el.scrollLeft = next;
  }, [x, phase, scrollRef]);

  return (
    <>
      <div
        className="pointer-events-none absolute bottom-0 top-6 z-[4] w-0.5 bg-[var(--brd-audio-playhead)] will-change-transform"
        style={{ transform: `translateX(${x}px)` }}
        data-testid="studio-playhead"
        data-playhead-ms={playheadMs}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-6 z-[4] size-2 -translate-x-1/2 rounded-full bg-[var(--brd-rec)]"
        style={{ left: x }}
        aria-hidden
      />
    </>
  );
}

/** Position slider leaf. Range = the song, not the 6:00 canvas. */
function TimelinePositionSlider({
  songEndMs,
  disabled,
  onSeek,
}: {
  songEndMs: number;
  disabled: boolean;
  onSeek: (ms: number) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const { playheadMs } = useStudioTransportPlayhead();
  return (
    <label className="block shrink-0 border-t border-[var(--brd-line)] px-2 py-1.5 text-xs text-[var(--brd-mute)]">
      {tr("playhead2")}{" "}{tl(formatStudioTimeMs(playheadMs))}
      <input
        type="range"
        min={0}
        max={Math.max(songEndMs, playheadMs)}
        step={1}
        value={playheadMs}
        disabled={disabled}
        className="mt-1 h-11 w-full"
        aria-label={tr("pozycjaPlayhead")}
        aria-valuetext={formatStudioTimeMs(playheadMs)}
        onChange={(e) => onSeek(Math.round(Number(e.target.value)))}
      />
    </label>
  );
}

export function StudioTimeline({
  tracks,
  clips,
  timelineLengthMs,
  songEndMs,
  markers = NO_MARKERS,
  pxPerMs,
  mode,
  interactionLocked = false,
  beatLocked = false,
  selectedClipId,
  renderTrackHeader,
  renderLaneOverlay,
  scrollContainerRef,
  onZoomAroundViewport,
  resolveClipSourceUrl,
  snapConfig,
  onSeek,
  onSelectClip,
  onClearSelection,
  onCommitClipGeometry,
}: {
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
  timelineLengthMs: number;
  /** End of the last clip / note: range of the position slider. */
  songEndMs: number;
  /** Verse / hook labels on the ruler. */
  markers?: readonly StudioMarkerDto[];
  pxPerMs: number;
  mode: TimelineMode;
  interactionLocked?: boolean;
  /** The Bit cannot be dragged or trimmed on the lanes. */
  beatLocked?: boolean;
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
  /** Click on an empty part of a lane. */
  onClearSelection?: () => void;
  onCommitClipGeometry: (
    clipId: string,
    commit: Exclude<StudioClipEditCommit, { kind: "noop" }>,
  ) => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  usePocketMarkers(markers);
  const { loopEnabled, loopStartMs, loopEndMs } = useStudioTransportControls();
  const loop = useMemo(
    () => (loopEnabled ? { startMs: loopStartMs, endMs: loopEndMs } : null),
    [loopEnabled, loopStartMs, loopEndMs],
  );
  /** The ruler and empty lanes always move the playhead, also while a clip is being edited. */
  const seekEnabled = !interactionLocked;
  const density = clampPxPerMs(pxPerMs);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScroll = useRef(false);
  const [laneViewportWidthPx, setLaneViewportWidthPx] = useState(0);
  const widthPx = contentWidthPx(timelineLengthMs, density, {
    viewportWidthPx:
      laneViewportWidthPx > 0 ? laneViewportWidthPx : undefined,
  });
  // Stable handler for the memoized ruler: the editor passes a new onSeek on every render.
  const seekRef = useRef(onSeek);
  useEffect(() => {
    seekRef.current = onSeek;
  });
  const [seekStable] = useState(() => (ms: number) => seekRef.current(ms));

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
    target: EventTarget;
    clientX: number;
  }) {
    if (!seekEnabled) return;
    const target = event.target instanceof Element ? event.target : null;
    // Clips and the automation editor handle their own clicks.
    if (target?.closest("[data-studio-clip], [data-testid='studio-automation-lane']")) return;
    if (target?.closest("[data-studio-clip-lane]")) onClearSelection?.();
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
              role="group"
              aria-label={tl(interactionLocked ? tr("osCzasuTrybNagrywania") : tr("osCzasuKliknijAby"))}
            >
              <TimelineRuler
                timelineLengthMs={timelineLengthMs}
                density={density}
                scrollRef={laneScrollRef}
                markers={markers}
                loop={loop}
                onSeek={seekStable}
              />
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
                      <span className="studio-lane-empty pointer-events-none sticky left-3 inline-flex h-full items-center text-xs text-[var(--brd-mute)]">
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
                        geometryLocked={beatLocked && clip.sourceKind === "BEAT_REF"}
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
              <TimelinePlayhead density={density} scrollRef={laneScrollRef} />
            </div>
          </div>
        </div>
      </div>
      <TimelinePositionSlider songEndMs={songEndMs} disabled={interactionLocked} onSeek={onSeek} />
    </div>
  );
}
