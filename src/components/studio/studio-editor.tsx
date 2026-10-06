"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  StudioTransportProvider,
  useStudioTransport,
} from "@/components/studio/studio-transport-provider";
import type {
  StudioClipDto,
  StudioProjectDocument,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import { isTrackAudible } from "@/lib/studio/studio-track-ops";
import { labelStudioTrackType } from "@/lib/ui/labels";

export function StudioEditor({
  initialDocument,
}: {
  initialDocument: StudioProjectDocument;
}) {
  return (
    <StudioTransportProvider
      timelineLengthMs={initialDocument.project.timelineLengthMs}
    >
      <StudioEditorInner initialDocument={initialDocument} />
    </StudioTransportProvider>
  );
}

function StudioEditorInner({
  initialDocument,
}: {
  initialDocument: StudioProjectDocument;
}) {
  const [doc, setDoc] = useState(initialDocument);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const transport = useStudioTransport();
  const anySolo = doc.tracks.some((t) => t.solo);
  const length = doc.project.timelineLengthMs;

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
      error?: string;
    };
    if (!res.ok || !json.track) {
      throw new Error(json.error ?? "Nie udało się zaktualizować ścieżki.");
    }
    setDoc((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? json.track! : t)),
    }));
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

  return (
    <div className="flex flex-col gap-6">
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

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-4">
        <ul className="space-y-3">
          {doc.tracks.map((track, index) => {
            const audible = isTrackAudible({
              muted: track.muted,
              solo: track.solo,
              anySolo,
            });
            return (
              <li
                key={track.id}
                className="rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--brd-ink)]">
                      {track.name}
                    </p>
                    <p className="text-xs text-[var(--brd-mute)]">
                      {labelStudioTrackType(track.trackType)}
                      {!audible ? " · wyciszona w miksie" : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending || index === 0}
                      title="Przenieś w górę"
                      aria-label="Przenieś ścieżkę w górę"
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await reorder(track.id, "up");
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Błąd kolejności.",
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
                      disabled={pending || index === doc.tracks.length - 1}
                      title="Przenieś w dół"
                      aria-label="Przenieś ścieżkę w dół"
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await reorder(track.id, "down");
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Błąd kolejności.",
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
                  <ToggleChip
                    active={track.recordArmed}
                    title="Nagrywanie — uzbrój ścieżkę"
                    label="REC"
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
                  <ToggleChip
                    active={track.solo}
                    title="Odsłuch tylko tej ścieżki"
                    label="Odsłuch"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await patchTrack(track.id, { solo: !track.solo });
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Błąd odsłuchu.",
                          );
                        }
                      })
                    }
                  />
                  <ToggleChip
                    active={track.muted}
                    title="Wycisz tę ścieżkę bez usuwania nagrania"
                    label="Wycisz"
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
                </div>

                <label className="mt-3 block text-xs text-[var(--brd-mute)]">
                  Głośność ({track.gainDb.toFixed(1)} dB)
                  <input
                    type="range"
                    min={-24}
                    max={12}
                    step={0.5}
                    value={track.gainDb}
                    className="mt-1 w-full"
                    aria-label="Głośność ścieżki"
                    onChange={(e) => {
                      const gainDb = Number(e.target.value);
                      setDoc((prev) => ({
                        ...prev,
                        tracks: prev.tracks.map((t) =>
                          t.id === track.id ? { ...t, gainDb } : t,
                        ),
                      }));
                    }}
                    onPointerUp={(e) => {
                      const gainDb = Number(
                        (e.target as HTMLInputElement).value,
                      );
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
                      });
                    }}
                  />
                </label>

                <label className="mt-2 block text-xs text-[var(--brd-mute)]">
                  Panorama L/R ({track.pan.toFixed(2)})
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={track.pan}
                    className="mt-1 w-full"
                    aria-label="Panorama L/R"
                    title="Ustawia położenie dźwięku między lewą i prawą stroną."
                    onChange={(e) => {
                      const pan = Number(e.target.value);
                      setDoc((prev) => ({
                        ...prev,
                        tracks: prev.tracks.map((t) =>
                          t.id === track.id ? { ...t, pan } : t,
                        ),
                      }));
                    }}
                    onPointerUp={(e) => {
                      const pan = Number((e.target as HTMLInputElement).value);
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
                      });
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>

        <StudioTimeline
          tracks={doc.tracks}
          clips={doc.clips}
          timelineLengthMs={length}
          playheadMs={transport.state.playheadMs}
          onSeek={transport.seek}
        />
      </div>

      <p className="text-xs text-[var(--brd-mute)]">
        Fundament Studio (P5.1). Nagrywanie punch, metronom i efekty pojawią się
        w kolejnych etapach. Szybkie nagranie anonimowe nadal działa na stronie
        bitu.
      </p>
    </div>
  );
}

function StudioTransportBar() {
  const { state, timeLabel, play, pause, stop } = useStudioTransport();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--brd-line)] p-3">
      <Button
        type="button"
        size="sm"
        onClick={play}
        disabled={state.phase === "playing"}
        title="Odtwórz"
      >
        Odtwórz
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={pause}
        disabled={state.phase !== "playing"}
        title="Pauza"
      >
        Pauza
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={stop} title="Stop">
        Stop
      </Button>
      <span
        className="ml-auto font-mono text-sm tabular-nums text-[var(--brd-ink)]"
        aria-live="polite"
      >
        {timeLabel}
      </span>
    </div>
  );
}

function StudioTimeline({
  tracks,
  clips,
  timelineLengthMs,
  playheadMs,
  onSeek,
}: {
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
  timelineLengthMs: number;
  playheadMs: number;
  onSeek: (ms: number) => void;
}) {
  const playheadPct = Math.min(
    100,
    Math.max(0, (playheadMs / timelineLengthMs) * 100),
  );

  return (
    <div
      className="relative min-h-[16rem] overflow-x-auto rounded border border-[var(--brd-line)] bg-[color-mix(in_oklch,var(--brd-bg),var(--brd-ink)_2%)]"
      role="region"
      aria-label="Oś czasu projektu"
    >
      <div className="sticky top-0 z-10 flex justify-between border-b border-[var(--brd-line)] bg-[var(--brd-bg)] px-2 py-1 text-[10px] text-[var(--brd-mute)]">
        <span>0:00</span>
        <span>{formatStudioTimeMs(timelineLengthMs)}</span>
      </div>
      <div className="relative min-w-[28rem] space-y-2 p-2">
        {tracks.map((track) => {
          const trackClips = clips.filter((c) => c.trackId === track.id);
          return (
            <div key={track.id} className="relative h-12 rounded bg-[var(--brd-bg)]">
              <span className="pointer-events-none absolute left-2 top-1 text-[10px] text-[var(--brd-mute)]">
                {track.name}
              </span>
              {trackClips.map((clip) => {
                const left = (clip.timelineStartMs / timelineLengthMs) * 100;
                const width = (clip.durationMs / timelineLengthMs) * 100;
                return (
                  <div
                    key={clip.id}
                    className="absolute bottom-1 top-5 rounded bg-[var(--brd-ink)]/15 px-1 text-[10px] text-[var(--brd-ink)]"
                    style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                    title={`${clip.sourceKind} · ${formatStudioTimeMs(clip.timelineStartMs)}`}
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
          style={{ left: `calc(${playheadPct}% + 0.5rem)` }}
          aria-hidden
        />
      </div>
      <label className="block border-t border-[var(--brd-line)] px-2 py-2 text-xs text-[var(--brd-mute)]">
        Playhead
        <input
          type="range"
          min={0}
          max={timelineLengthMs}
          step={1}
          value={playheadMs}
          className="mt-1 w-full"
          aria-label="Pozycja playhead"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </label>
    </div>
  );
}

function ToggleChip({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
