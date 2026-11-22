"use client";

/**
 * Mix step — read-only overview of the tracks (audit 2026-11-21: the Mix step showed no lanes,
 * so after a vocal set or "Zrób utwór" you could not see where the vocal sits against the beat).
 * One thin row per track: clip blocks over the song length (end of the last clip + room),
 * a playhead line, click = seek. Editing stays in the record step.
 */

import { useTranslations } from "next-intl";

import { STUDIO_TRACK_EDGE } from "@/components/studio/studio-daw-layout";
import {
  useStudioTransportControls,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import { useLibText } from "@/i18n/use-lib-text";
import { studioTimelineFitLengthMs } from "@/lib/studio/studio-timeline-view";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

export function StudioMixOverview({ doc }: { doc: StudioProjectDocument }) {
  const t = useTranslations("studio.mixStep");
  const tRole = useTranslations("studio.trackRole");
  const tl = useLibText();
  const { seek } = useStudioTransportControls();
  const { playheadMs } = useStudioTransportPlayhead();
  const lengthMs = Math.max(1, studioTimelineFitLengthMs(doc.project.timelineLengthMs, doc.clips));
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / lengthMs) * 100))}%`;

  return (
    <section
      data-testid="studio-mix-overview"
      aria-label={t("podgladSciezek")}
      className="flex flex-col gap-1 rounded-[2px] border border-[var(--brd-line)] p-2"
    >
      <h3 className="text-xs font-semibold text-[var(--brd-mute)]">{t("podgladSciezek")}</h3>
      {doc.tracks.map((track, index) => {
        const clips = doc.clips.filter((c) => c.trackId === track.id);
        const color = track.trackType === "BEAT" ? "#f2a93b" : STUDIO_TRACK_EDGE[Math.max(0, index - 1) % STUDIO_TRACK_EDGE.length];
        return (
          <div key={track.id} className="grid grid-cols-[7.5rem_1fr] items-center gap-2" data-testid="studio-mix-overview-row">
            <span className="truncate text-xs" title={`${tl(track.name)} · ${tRole(track.trackRole)}`}>
              <span className={track.muted ? "line-through opacity-60" : undefined}>{tl(track.name)}</span>
            </span>
            <button
              type="button"
              className="relative h-8 w-full cursor-pointer sm:h-5 rounded-[2px] bg-[color-mix(in_oklch,var(--brd-paper),var(--brd-ink)_8%)]"
              aria-label={t("podgladSciezkiPrzewin", { v0: tl(track.name) })}
              onClick={(event) => {
                const r = event.currentTarget.getBoundingClientRect();
                if (r.width <= 0) return;
                seek(Math.round(((event.clientX - r.left) / r.width) * lengthMs));
              }}
            >
              {clips.map((c) => (
                <span
                  key={c.id}
                  aria-hidden
                  className="absolute inset-y-0.5 rounded-[1px]"
                  style={{
                    left: pct(c.timelineStartMs),
                    width: `max(2px, ${pct(c.durationMs)})`,
                    background: color,
                    opacity: track.muted ? 0.35 : 0.85,
                  }}
                />
              ))}
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-[var(--brd-ink)]"
                style={{ left: pct(playheadMs) }}
              />
            </button>
          </div>
        );
      })}
    </section>
  );
}
