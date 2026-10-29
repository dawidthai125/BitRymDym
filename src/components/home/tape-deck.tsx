"use client";

import { usePlayer } from "@/components/player/player-provider";
import { formatDurationSeconds } from "@/lib/beats/public";
import type { PresentedBeat } from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

/**
 * Hero "loaded tape" — the featured catalog beat rendered as a cassette
 * in a deck, with an analog VU meter. Reels spin only while this beat plays
 * (and only when the visitor allows motion).
 */
export function TapeDeck({ beat }: { beat: PresentedBeat | null }) {
  const { track, phase, playTrack, toggle } = usePlayer();
  const isCurrent = beat ? track?.beatId === beat.id : false;
  const playing = isCurrent && phase === "playing";
  const loading = isCurrent && phase === "loading";

  function onPlay() {
    if (!beat) return;
    if (isCurrent) toggle();
    else
      void playTrack({
        beatId: beat.id,
        title: beat.title,
        producer: beat.producer,
        durationSeconds: beat.durationSeconds,
        artworkVariant: beat.artworkVariant,
      });
  }

  const meta = beat
    ? [
        beat.bpm > 0 ? `${beat.bpm} BPM` : null,
        beat.key,
        beat.durationSeconds > 0
          ? formatDurationSeconds(beat.durationSeconds)
          : null,
      ].filter(Boolean)
    : [];

  return (
    <div
      data-playing={playing ? "true" : "false"}
      className="tape-deck relative border border-tape-line-strong bg-tape-panel p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] sm:p-6"
    >
      {/* Deck faceplate */}
      <div className="flex items-center justify-between gap-3 border-b border-tape-line pb-3">
        <p className="font-poster text-sm font-bold uppercase tracking-[var(--tape-tracking-label)] text-tape-cream-soft">
          BRD · Deck A
        </p>
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-tape-mute">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              playing
                ? "bg-tape-rec shadow-[0_0_10px_2px_rgba(255,75,54,0.55)]"
                : "bg-tape-line-strong",
            )}
          />
          {playing ? "Play" : loading ? "Ładuję" : "Stop"}
        </p>
      </div>

      {/* Cassette */}
      <div className="relative mx-auto mt-5 aspect-[1.6/1] w-full max-w-[30rem] rounded-[6px] border border-[#4a3d30] bg-[#2a221a] p-[5%]">
        {/* Label paper */}
        <div className="relative h-full rounded-[3px] bg-tape-cream px-[5%] pt-[4%] text-tape-on-amber">
          <div className="flex items-baseline justify-between gap-2 border-b-2 border-tape-on-amber/80 pb-1">
            <span className="font-poster text-[clamp(0.7rem,1.6vw,0.85rem)] font-extrabold uppercase tracking-[0.2em]">
              Strona A
            </span>
            <span className="font-mono text-[clamp(0.55rem,1.2vw,0.7rem)] uppercase">
              {meta.join(" · ") || "—"}
            </span>
          </div>
          <p className="mt-1.5 truncate font-[family-name:var(--font-display)] text-[clamp(1rem,2.6vw,1.45rem)] italic leading-tight">
            {beat?.title ?? "Katalog czeka na pierwszy bit"}
          </p>
          <p className="truncate font-mono text-[clamp(0.55rem,1.2vw,0.72rem)] uppercase tracking-[0.1em] opacity-75">
            {beat?.producer ?? "BitRymDym"}
          </p>
          {/* Window with reels */}
          <div className="absolute inset-x-[16%] bottom-[10%] flex h-[36%] items-center justify-between rounded-full border-2 border-tape-on-amber/70 bg-[#17120d] px-[6%]">
            <Reel />
            <div aria-hidden="true" className="mx-2 h-[38%] flex-1 bg-[#3b2c1d]" />
            <Reel />
          </div>
        </div>
      </div>

      {/* VU + transport */}
      <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4">
        <VuMeter />
        <button
          type="button"
          onClick={onPlay}
          disabled={!beat}
          aria-pressed={playing}
          aria-label={
            beat
              ? `${playing ? "Pauza" : "Odtwórz"}: ${beat.title}`
              : "Brak bitu do odtworzenia"
          }
          className="tape-focus group inline-flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-[var(--tape-r-panel)] border border-tape-amber-deep bg-tape-amber px-5 font-poster text-lg font-extrabold uppercase tracking-[0.12em] text-tape-on-amber shadow-[0_3px_0_0_var(--tape-amber-deep),0_10px_24px_-10px_rgba(242,169,59,0.6)] transition-[transform,box-shadow] duration-[var(--tape-dur-fast)] ease-[var(--tape-ease-out)] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
        >
          {playing ? <PauseGlyph /> : <PlayGlyph />}
          <span>{playing ? "Pauza" : loading ? "…" : "Play"}</span>
        </button>
      </div>
    </div>
  );
}

function Reel() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className="tape-reel h-[80%] w-auto text-tape-cream"
    >
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="5" fill="currentColor" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x="18.5"
          y="4"
          width="3"
          height="8"
          fill="currentColor"
          transform={`rotate(${deg} 20 20)`}
        />
      ))}
    </svg>
  );
}

function VuMeter() {
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  return (
    <div
      aria-hidden="true"
      className="relative h-20 overflow-hidden rounded-[3px] border border-tape-line-strong bg-[#efe0bd]"
    >
      <svg viewBox="0 0 200 80" className="absolute inset-0 h-full w-full">
        <path d="M20 70 A95 95 0 0 1 180 70" fill="none" stroke="#2a1d10" strokeWidth="1.2" />
        <path d="M140 33 A95 95 0 0 1 180 70" fill="none" stroke="#d0381f" strokeWidth="4" />
        {ticks.map((i) => {
          const a = (-58 + i * 11.6) * (Math.PI / 180);
          const x1 = 100 + Math.sin(a) * 86;
          const y1 = 92 - Math.cos(a) * 86;
          const x2 = 100 + Math.sin(a) * (i % 5 === 0 ? 74 : 79);
          const y2 = 92 - Math.cos(a) * (i % 5 === 0 ? 74 : 79);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i > 7 ? "#d0381f" : "#2a1d10"} strokeWidth="1.4" />
          );
        })}
        <text x="100" y="62" textAnchor="middle" fontSize="11" fontFamily="var(--tape-font-poster)" fontWeight="800" letterSpacing="2" fill="#2a1d10">VU</text>
        <g className="tape-needle" style={{ transformOrigin: "100px 92px" }}>
          <line x1="100" y1="92" x2="100" y2="14" stroke="#1a1006" strokeWidth="1.6" />
        </g>
      </svg>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
      <path d="M3 1.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
      <path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" fill="currentColor" />
    </svg>
  );
}
