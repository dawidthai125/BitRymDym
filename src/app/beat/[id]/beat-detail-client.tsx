"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";

import { BeatArtwork } from "@/components/brand/beat-artwork";
import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { BrdAudioTime } from "@/components/brand/brd-audio-meta";
import { Waveform } from "@/components/brand/waveform";
import { DownloadButton } from "@/components/beats/download-button";
import { usePlayer } from "@/components/player/player-provider";
import { BeatRecordingSurface } from "@/components/takes/beat-recording-surface";
import { formatDurationSeconds } from "@/lib/beats/public";
import { cn } from "@/lib/utils";
import type { PresentedBeat } from "@/lib/ui/demo-beats";

type RelatedBeat = PresentedBeat;

type BeatDetailClientProps = {
  beat: PresentedBeat;
  description: string | null;
  hasAudio: boolean;
  isAuthenticated: boolean;
  maxRecordingSeconds: number;
  mixTakes: Array<{
    id: string;
    label: string;
    durationSeconds: number | null;
  }>;
  mixEnabled: boolean;
  mixPro: boolean;
  masterPro: boolean;
  related: RelatedBeat[];
};

export function BeatDetailClient({
  beat,
  description,
  hasAudio,
  isAuthenticated,
  maxRecordingSeconds,
  mixTakes,
  mixEnabled,
  mixPro,
  masterPro,
  related,
}: BeatDetailClientProps) {
  const {
    track,
    phase,
    currentTime,
    duration,
    error,
    playTrack,
    toggle,
    seek,
    setSuppressed,
  } = usePlayer();
  const heroPlayerRef = useRef<HTMLElement | null>(null);
  const recordingFocusRef = useRef(false);
  const heroVisibleRef = useRef(false);
  const isCurrentRef = useRef(false);

  const isCurrent = track?.beatId === beat.id;
  isCurrentRef.current = isCurrent;
  const playing = isCurrent && phase === "playing";
  const loading = isCurrent && phase === "loading";
  const total =
    isCurrent && duration > 0 ? duration : beat.durationSeconds;
  const progress =
    isCurrent && total > 0 ? Math.min(1, currentTime / total) : 0.08;

  useEffect(() => {
    const el = heroPlayerRef.current;
    if (!el || !hasAudio) return;

    const measureHeroVisible = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      return rect.bottom > 0 && rect.top < vh;
    };

    const applyStickyVisibility = () => {
      const hideForHero =
        !recordingFocusRef.current &&
        isCurrentRef.current &&
        measureHeroVisible();
      heroVisibleRef.current = hideForHero;
      // Detail-level visual hide: RecordingPanel idle clears Provider.suppress,
      // so we cannot rely on setSuppressed alone while hero is on screen.
      document.documentElement.toggleAttribute(
        "data-brd-beat-hero-active",
        hideForHero,
      );
      if (recordingFocusRef.current) {
        setSuppressed(true);
      }
    };

    const observer = new IntersectionObserver(applyStickyVisibility, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });

    observer.observe(el);
    applyStickyVisibility();
    window.addEventListener("scroll", applyStickyVisibility, { passive: true });
    window.addEventListener("resize", applyStickyVisibility);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", applyStickyVisibility);
      window.removeEventListener("resize", applyStickyVisibility);
      document.documentElement.removeAttribute("data-brd-beat-hero-active");
    };
  }, [hasAudio, isCurrent, setSuppressed]);

  useLayoutEffect(() => {
    if (!hasAudio) return;
    const el = heroPlayerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    const hideForHero =
      !recordingFocusRef.current &&
      isCurrent &&
      rect.bottom > 0 &&
      rect.top < vh;
    document.documentElement.toggleAttribute(
      "data-brd-beat-hero-active",
      hideForHero,
    );
    if (recordingFocusRef.current) {
      setSuppressed(true);
    }
  }, [hasAudio, isCurrent, phase, setSuppressed]);

  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute("data-brd-beat-hero-active");
      if (!recordingFocusRef.current) {
        setSuppressed(false);
      }
    };
  }, [setSuppressed]);

  async function onPlay() {
    if (!hasAudio) return;
    if (isCurrent) {
      toggle();
      return;
    }
    await playTrack({
      beatId: beat.id,
      title: beat.title,
      producer: beat.producer,
      durationSeconds: beat.durationSeconds,
      artworkVariant: beat.artworkVariant,
    });
  }

  return (
    <div className="space-y-10">
      {/* Hide sticky visually while hero BRD player overlaps viewport (detail consumption). */}
      <style>{`html[data-brd-beat-hero-active] [role="region"][aria-label="Odtwarzacz"]{display:none!important}`}</style>
      {/* Hero: Desktop B Cover+Rail · Mobile A Editorial Stack */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start md:gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <BeatArtwork
          variant={beat.artworkVariant}
          title={beat.title}
          size="xl"
          className="mx-auto w-full max-w-[20rem] md:mx-0 md:max-w-none"
        />

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <h1 className="brd-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {beat.title}
            </h1>
            <p className="text-lg text-[var(--brd-ink-soft)]">
              <span className="sr-only">Producent: </span>
              {beat.producer}
            </p>
          </div>

          {hasAudio ? (
            <section
              ref={heroPlayerRef}
              className="space-y-3 border border-[var(--brd-audio-line)] bg-[var(--brd-paper)] p-3 sm:p-4"
              aria-label="Odtwarzacz bitu"
            >
              <div className="flex items-center gap-3">
                <BrdAudioPlayButton
                  playing={playing}
                  loading={loading}
                  disabled={!hasAudio}
                  size="md"
                  title={beat.title}
                  onClick={() => void onPlay()}
                />
                <div className="min-w-0 flex-1">
                  <Waveform
                    seed={beat.id}
                    progress={progress}
                    density="detail"
                    showPlayhead={isCurrent}
                    interactive={isCurrent}
                    onSeekRatio={(ratio) => {
                      if (!isCurrent || total <= 0) return;
                      seek(ratio * total);
                    }}
                    aria-label="Przebieg — przewiń utwór"
                  />
                </div>
                <BrdAudioTime
                  current={isCurrent ? currentTime : 0}
                  total={total}
                  format={formatDurationSeconds}
                  className="shrink-0 text-xs tabular-nums"
                />
              </div>

              {isCurrent && error ? (
                <p className="text-sm text-[var(--brd-danger)]" role="alert">
                  {error}
                </p>
              ) : null}
            </section>
          ) : (
            <p className="text-sm text-[var(--brd-mute)]" role="status">
              Ten bit nie ma jeszcze dostępnego audio.
            </p>
          )}

          <p className="brd-meta flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
            <span>
              <span className="text-[var(--brd-mute)]">Tempo </span>
              <span className="text-[var(--brd-ink)]">{beat.bpm}</span>
            </span>
            <span aria-hidden="true" className="text-[var(--brd-line)]">
              ·
            </span>
            <span>
              <span className="text-[var(--brd-mute)]">Tonacja </span>
              <span className="text-[var(--brd-ink)]">{beat.key}</span>
            </span>
            <span aria-hidden="true" className="text-[var(--brd-line)]">
              ·
            </span>
            <span>
              <span className="text-[var(--brd-mute)]">Gatunek </span>
              <span className="text-[var(--brd-ink)]">{beat.genre}</span>
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {hasAudio ? (
              <a
                href="#nagranie"
                className={cn(
                  "inline-flex min-h-11 items-center justify-center border px-4 text-sm font-medium outline-none",
                  "rounded-[var(--brd-r-cta)] border-[var(--brd-ink)] bg-transparent text-[var(--brd-ink)]",
                  "hover:bg-[var(--brd-paper-deep)] focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)]",
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)]",
                )}
                onClick={(e) => {
                  const target = document.getElementById("nagranie");
                  if (!target) return;
                  e.preventDefault();
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  history.replaceState(null, "", "#nagranie");
                }}
              >
                Nagraj
              </a>
            ) : null}
            {hasAudio ? (
              <DownloadButton
                beatId={beat.id}
                title={beat.title}
                isAuthenticated={isAuthenticated}
              />
            ) : null}
          </div>
        </div>
      </div>

      <section className="max-w-prose space-y-2 border-t border-[var(--brd-line)] pt-6">
        <h2 className="brd-display text-xl font-semibold">O bicie</h2>
        <p className="text-sm leading-relaxed text-[var(--brd-ink-soft)]">
          {description ??
            "Bit gotowy do odsłuchu i nagrania próby. Sprawdź tempo, tonację i nagraj swój wokal na tym podkładzie."}
        </p>
      </section>

      <section className="space-y-2 border-t border-[var(--brd-line)] pt-6">
        <h2 className="brd-display text-xl font-semibold">Licencja</h2>
        <p className="max-w-prose text-sm leading-relaxed text-[var(--brd-ink-soft)]">
          Odsłuchaj, nagraj próbę i — jeśli masz dostęp — pobierz plik zgodnie z
          zasadami konta. Eksport miksu znajdziesz w studio.
        </p>
      </section>

      {related.length > 0 ? (
        <section className="space-y-3 border-t border-[var(--brd-line)] pt-6">
          <h2 className="brd-display text-xl font-semibold">Podobne bity</h2>
          <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/beat/${r.id}`}
                  className="flex min-h-11 items-center gap-3 py-3 hover:bg-[var(--brd-paper-deep)]/50"
                >
                  <BeatArtwork
                    variant={r.artworkVariant}
                    title={r.title}
                    size="xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-sm text-[var(--brd-mute)]">
                      {r.producer} · Tempo {r.bpm}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasAudio ? (
        <section
          id="nagranie"
          className="scroll-mt-32 space-y-3 border-t border-[var(--brd-line)] pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8"
          onFocusCapture={() => {
            recordingFocusRef.current = true;
            document.documentElement.removeAttribute(
              "data-brd-beat-hero-active",
            );
            setSuppressed(true);
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              recordingFocusRef.current = false;
              const hero = heroPlayerRef.current;
              if (hero && isCurrentRef.current) {
                const rect = hero.getBoundingClientRect();
                const vh = window.innerHeight || 0;
                const hide =
                  rect.bottom > 0 && rect.top < vh;
                document.documentElement.toggleAttribute(
                  "data-brd-beat-hero-active",
                  hide,
                );
              }
              setSuppressed(false);
            }
          }}
        >
          <h2 className="brd-display text-xl font-semibold">
            Nagraj na tym bicie
          </h2>
          <BeatRecordingSurface
            beatId={beat.id}
            title={beat.title}
            durationSeconds={beat.durationSeconds}
            maxRecordingSeconds={maxRecordingSeconds}
            beatStatus="PUBLISHED"
            isAuthenticated={isAuthenticated}
            mixTakes={mixTakes}
            mixEnabled={mixEnabled}
            mixPro={mixPro}
            masterPro={masterPro}
          />
        </section>
      ) : null}
    </div>
  );
}
