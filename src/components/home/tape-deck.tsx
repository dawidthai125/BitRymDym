"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { usePlayer } from "@/components/player/player-provider";
import { formatDurationSeconds } from "@/lib/beats/public";
import {
  DECK_REEL_GEOMETRY,
  approachSpeed,
  estimatePosition,
  reelAngularSpeeds,
  reelRadii,
} from "@/lib/ui/cassette-reels";
import type { PresentedBeat } from "@/lib/ui/demo-beats";
import { cn } from "@/lib/utils";

/**
 * Hero deck — a dark cassette loaded with the catalog strip.
 * Prev / play / next and the tape list switch beats; the tape pack moves from the
 * left reel to the right one with playback progress, and the bar seeks.
 * Reels spin and the VU needle rides only while a deck beat plays (motion allowed).
 * Reel physics (pack radii, ω ∝ 1/r) live in `@/lib/ui/cassette-reels`; a rAF loop
 * writes transforms only, runs only while playing / braking and the tab is visible.
 */
export function TapeDeck({ beats }: { beats: PresentedBeat[] }) {
  const t = useTranslations("home.tapeDeck");
  const { track, phase, playTrack, toggle, seek, currentTime, duration, playbackRate } = usePlayer();
  const [cued, setCued] = useState(0);

  const playingIndex = beats.findIndex((b) => b.id === track?.beatId);
  const index = playingIndex >= 0 ? playingIndex : Math.min(cued, Math.max(beats.length - 1, 0));
  const beat = beats[index] ?? null;
  const isCurrent = playingIndex >= 0 && playingIndex === index;
  const playing = isCurrent && phase === "playing";
  const loading = isCurrent && phase === "loading";
  const total = isCurrent && duration > 0 ? duration : (beat?.durationSeconds ?? 0);
  const position = isCurrent ? Math.min(currentTime, total || currentTime) : 0;
  const progress = total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;
  const reels = useCassetteReels({ playing, position, total, rate: playbackRate });

  function start(target: PresentedBeat) {
    void playTrack({
      beatId: target.id,
      title: target.title,
      producer: target.producer,
      durationSeconds: target.durationSeconds,
      artworkVariant: target.artworkVariant,
    });
  }

  function onPlay() {
    if (!beat) return;
    if (isCurrent) toggle();
    else start(beat);
  }

  function go(step: number) {
    if (beats.length === 0) return;
    const next = (index + step + beats.length) % beats.length;
    setCued(next);
    // Skipping while the deck plays keeps the music going; when stopped it only cues.
    if (playing || loading) start(beats[next]);
  }

  function pick(i: number) {
    setCued(i);
    const target = beats[i];
    if (!target) return;
    if (target.id === track?.beatId) toggle();
    else start(target);
  }

  const meta = beat
    ? [beat.bpm > 0 ? t("bpm", { v0: beat.bpm }) : null, beat.key, beat.genre].filter(Boolean).join(" · ")
    : "";

  return (
    <div
      data-playing={playing ? "true" : "false"}
      data-testid="home-tape-deck"
      className="tape-deck relative rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-panel p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] sm:p-6"
    >
      {/* Faceplate */}
      <div className="flex items-center justify-between gap-3 border-b border-tape-line pb-3">
        <p className="font-poster text-sm font-bold uppercase tracking-[var(--tape-tracking-label)] text-tape-cream-soft">
          {t("brdDeckA")}
        </p>
        <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.12em] text-tape-cream-soft">
          {beats.length > 0 ? (
            <span className="tabular-nums">{t("pozycja", { n: index + 1, total: beats.length })}</span>
          ) : null}
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                playing
                  ? "bg-tape-rec shadow-[0_0_10px_2px_rgba(255,75,54,0.55)]"
                  : "bg-tape-line-strong",
              )}
            />
            {playing ? t("gra") : loading ? t("laduje") : t("stop")}
          </span>
        </p>
      </div>

      {/* Cassette shell */}
      <div className="relative mx-auto mt-5 aspect-[1.6/1] w-full max-w-[30rem] rounded-[10px] border border-[#4a3d30] bg-[linear-gradient(160deg,#2b231b,#16110d)] p-[4.5%] shadow-[inset_0_1px_0_#ffffff12,0_10px_30px_-12px_#000]">
        <span className="tape-rack-screw absolute left-[2.2%] top-[3.5%]" aria-hidden="true" />
        <span className="tape-rack-screw absolute right-[2.2%] top-[3.5%]" aria-hidden="true" />
        <span className="tape-rack-screw absolute bottom-[3.5%] left-[2.2%]" aria-hidden="true" />
        <span className="tape-rack-screw absolute bottom-[3.5%] right-[2.2%]" aria-hidden="true" />

        {/* Label — dark paper with an amber stripe, no glare */}
        <div className="relative flex h-full flex-col overflow-hidden rounded-[4px] border border-[#3a3028] bg-[#120e0b] px-[5%] pt-[3.5%] text-tape-cream">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[5%] bg-tape-amber/85" />
          <div className="mt-[2%] flex items-baseline justify-between gap-2 border-b border-tape-line pb-1">
            <span className="font-poster text-[clamp(0.75rem,1.6vw,0.9rem)] font-extrabold uppercase tracking-[0.18em] text-tape-amber">
              {t("stronaA")}
            </span>
            <span className="truncate font-mono text-xs uppercase text-tape-cream-soft">{meta || "—"}</span>
          </div>
          <p className="mt-1.5 truncate font-[family-name:var(--font-display)] text-[clamp(1.05rem,2.6vw,1.5rem)] italic leading-tight">
            {beat?.title ?? t("katalogCzekaNaPierwszy")}
          </p>
          <p className="truncate font-mono text-xs uppercase tracking-[0.1em] text-tape-mute">
            {beat?.producer ?? "BitRymDym"}
          </p>

          {/* Window: tape pack moves left → right with progress */}
          <div className="absolute inset-x-[14%] bottom-[9%] flex h-[40%] items-center justify-between rounded-full border border-tape-line-strong bg-[#0a0806] px-[5%] shadow-[inset_0_2px_8px_#000]">
            <Reel pack={reelRadii(progress).supply} packRef={reels.supplyPack} hubRef={reels.supplyHub} />
            <div aria-hidden="true" className="mx-2 flex h-[34%] flex-1 items-center rounded-sm bg-[#2b2016]">
              <div className="h-px w-full bg-tape-amber/40" />
            </div>
            <Reel pack={reelRadii(progress).takeUp} packRef={reels.takeUpPack} hubRef={reels.takeUpHub} />
          </div>
        </div>
      </div>

      {/* Seek bar */}
      <div className="mt-4 flex items-center gap-3">
        <span className="w-10 text-right font-mono text-xs tabular-nums text-tape-cream-soft">
          {formatDurationSeconds(Math.round(position))}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(total))}
          step={1}
          value={Math.round(position)}
          disabled={!isCurrent}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label={t("przewin", { title: beat?.title ?? "" })}
          className="tape-focus h-2 flex-1 cursor-pointer appearance-none rounded-full bg-tape-line accent-[var(--tape-amber)] disabled:cursor-default disabled:opacity-60"
          style={{
            background: `linear-gradient(to right, var(--tape-amber) ${progress * 100}%, var(--tape-line) ${progress * 100}%)`,
          }}
        />
        <span className="w-10 font-mono text-xs tabular-nums text-tape-cream-soft">
          {total > 0 ? formatDurationSeconds(Math.round(total)) : "—"}
        </span>
      </div>

      {/* VU + transport */}
      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4">
        <VuMeter />
        <div className="flex items-center gap-2">
          <TransportButton label={t("poprzedni")} onClick={() => go(-1)} disabled={beats.length < 2}>
            <PrevGlyph />
          </TransportButton>
          <button
            type="button"
            onClick={onPlay}
            disabled={!beat}
            aria-pressed={playing}
            aria-label={beat ? `${playing ? t("pauza") : t("odtworz")}: ${beat.title}` : t("brakBituDoOdtworzenia")}
            className="tape-focus inline-flex min-h-14 min-w-14 items-center justify-center rounded-full border border-tape-amber-deep bg-tape-amber text-tape-on-amber shadow-[0_3px_0_0_var(--tape-amber-deep),0_10px_24px_-10px_rgba(242,169,59,0.6)] transition-[transform,box-shadow] duration-[var(--tape-dur-fast)] ease-[var(--tape-ease-out)] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <TransportButton label={t("nastepny")} onClick={() => go(1)} disabled={beats.length < 2}>
            <NextGlyph />
          </TransportButton>
        </div>
      </div>

      {/* Tape list */}
      {beats.length > 1 ? (
        <div className="mt-5 border-t border-tape-line pt-3">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.12em] text-tape-mute">{t("naTasmie")}</p>
          <ol className="grid gap-1 sm:grid-cols-2">
            {beats.map((b, i) => {
              const active = i === index;
              const thisPlaying = active && playing;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-current={active ? "true" : undefined}
                    aria-label={`${thisPlaying ? t("pauza") : t("odtworz")}: ${b.title}`}
                    className={cn(
                      "tape-focus flex min-h-11 w-full items-center gap-3 rounded-[var(--tape-r-panel)] border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-tape-amber/70 bg-tape-deck text-tape-cream"
                        : "border-transparent text-tape-cream-soft hover:border-tape-line hover:bg-tape-deck hover:text-tape-cream",
                    )}
                  >
                    <span className={cn("w-7 font-poster text-lg font-extrabold tabular-nums", active ? "text-tape-amber" : "text-tape-mute")}>
                      A{i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{b.title}</span>
                    <span className="font-mono text-xs tabular-nums text-tape-mute">
                      {thisPlaying ? <EqGlyph /> : b.durationSeconds > 0 ? formatDurationSeconds(b.durationSeconds) : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="tape-focus inline-flex size-11 items-center justify-center rounded-full border border-tape-line-strong bg-tape-deck text-tape-cream transition-colors hover:border-tape-amber hover:text-tape-amber disabled:opacity-40"
    >
      {children}
    </button>
  );
}

type ReelsInput = { playing: boolean; position: number; total: number; rate: number };

const TAU = Math.PI * 2;

/**
 * Drives both reels from the shared player state. `timeupdate` is coarse (~4 Hz),
 * so the loop extrapolates position between events; hubs turn clockwise at
 * ω = v / r with a light flutter, spin up / brake exponentially, and the packs
 * scale with progress. Reduced motion: no loop (packs still follow React renders).
 */
function useCassetteReels(input: ReelsInput) {
  const supplyHub = useRef<SVGGElement>(null);
  const takeUpHub = useRef<SVGGElement>(null);
  const supplyPack = useRef<SVGCircleElement>(null);
  const takeUpPack = useRef<SVGCircleElement>(null);
  const live = useRef({ ...input, at: 0 });
  const kick = useRef<() => void>(() => {});

  const { playing, position, total, rate } = input;
  useEffect(() => {
    live.current = { playing, position, total, rate, at: performance.now() };
    kick.current();
  }, [playing, position, total, rate]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let speed = 0;
    let angleSupply = 0;
    let angleTakeUp = 0;

    const shouldRun = () =>
      document.visibilityState === "visible" && !reduce.matches && (live.current.playing || speed > 0);

    const frame = (now: number) => {
      raf = 0;
      const s = live.current;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;

      const pos = s.playing ? estimatePosition(s.position, (now - s.at) / 1000, s.rate, s.total) : s.position;
      const p = s.total > 0 ? pos / s.total : 0;
      const radii = reelRadii(p);
      const full = DECK_REEL_GEOMETRY.full;
      if (supplyPack.current) supplyPack.current.style.transform = `scale(${radii.supply / full})`;
      if (takeUpPack.current) takeUpPack.current.style.transform = `scale(${radii.takeUp / full})`;

      speed = approachSpeed(speed, s.playing ? 1 : 0, dt, s.playing ? 0.18 : 0.35);
      if (speed > 0 && dt > 0) {
        const w = reelAngularSpeeds(p, s.rate);
        const t = now / 1000;
        // Wow & flutter: tiny, slightly irregular speed wobble.
        const flutter = 1 + 0.012 * Math.sin(t * TAU * 0.9) + 0.006 * Math.sin(t * TAU * 6.3);
        angleSupply = (angleSupply + w.supply * speed * flutter * dt) % 360;
        angleTakeUp = (angleTakeUp + w.takeUp * speed * flutter * dt) % 360;
        if (supplyHub.current) supplyHub.current.style.transform = `rotate(${angleSupply}deg)`;
        if (takeUpHub.current) takeUpHub.current.style.transform = `rotate(${angleTakeUp}deg)`;
      }

      if (shouldRun()) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || !shouldRun()) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else start();
    };
    const onReduce = () => {
      if (reduce.matches) {
        speed = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else start();
    };

    kick.current = start;
    document.addEventListener("visibilitychange", onVisibility);
    reduce.addEventListener("change", onReduce);
    start();
    return () => {
      kick.current = () => {};
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      reduce.removeEventListener("change", onReduce);
    };
  }, []);

  return { supplyHub, takeUpHub, supplyPack, takeUpPack };
}

/** `pack` = pack radius in viewBox units (hub 9 … full 18), from `reelRadii`. */
function Reel({
  pack,
  packRef,
  hubRef,
}: {
  pack: number;
  packRef: React.RefObject<SVGCircleElement | null>;
  hubRef: React.RefObject<SVGGElement | null>;
}) {
  const full = DECK_REEL_GEOMETRY.full;
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="h-[86%] w-auto">
      <circle
        ref={packRef}
        cx="20"
        cy="20"
        r={full}
        fill="#2b2016"
        stroke="#3a2a1b"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
        style={{ transformOrigin: "20px 20px", transform: `scale(${pack / full})` }}
      />
      <g ref={hubRef} className="tape-reel" style={{ transformOrigin: "20px 20px" }}>
        <circle cx="20" cy="20" r="8.5" fill="none" stroke="var(--tape-cream-soft)" strokeWidth="1.6" />
        <circle cx="20" cy="20" r="2.6" fill="var(--tape-amber)" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect key={deg} x="19.1" y="12" width="1.8" height="4" rx="0.6" fill="var(--tape-cream-soft)" transform={`rotate(${deg} 20 20)`} />
        ))}
        {/* Drive-hub teeth: make the turn readable at small sizes. */}
        {[30, 150, 270].map((deg) => (
          <rect key={deg} x="19.4" y="17.2" width="1.2" height="1.6" rx="0.3" fill="#120e0b" transform={`rotate(${deg} 20 20)`} />
        ))}
      </g>
    </svg>
  );
}

function VuMeter() {
  const t = useTranslations("home.tapeDeck");
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  return (
    <div
      aria-hidden="true"
      className="relative h-20 overflow-hidden rounded-[4px] border border-tape-line-strong bg-[radial-gradient(ellipse_at_50%_120%,#2a2017,#120e0b_70%)]"
    >
      <svg viewBox="0 0 200 80" className="absolute inset-0 h-full w-full">
        <path d="M20 70 A95 95 0 0 1 180 70" fill="none" stroke="#9e8f78" strokeWidth="1.2" />
        <path d="M140 33 A95 95 0 0 1 180 70" fill="none" stroke="#ff4b36" strokeWidth="3.5" opacity="0.85" />
        {ticks.map((i) => {
          const a = (-58 + i * 11.6) * (Math.PI / 180);
          const x1 = 100 + Math.sin(a) * 86;
          const y1 = 92 - Math.cos(a) * 86;
          const x2 = 100 + Math.sin(a) * (i % 5 === 0 ? 74 : 79);
          const y2 = 92 - Math.cos(a) * (i % 5 === 0 ? 74 : 79);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i > 7 ? "#ff4b36" : "#cdbfa6"} strokeWidth="1.4" />;
        })}
        <text x="100" y="62" textAnchor="middle" fontSize="11" fontFamily="var(--tape-font-poster)" fontWeight="800" letterSpacing="2" fill="#f2a93b">
          {t("vu")}
        </text>
        <g className="tape-needle" style={{ transformOrigin: "100px 92px" }}>
          <line x1="100" y1="92" x2="100" y2="14" stroke="#f1e7d3" strokeWidth="1.6" />
        </g>
      </svg>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-0.5 size-5">
      <path d="M3 1.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-5">
      <path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" fill="currentColor" />
    </svg>
  );
}

function PrevGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
      <path d="M2 2h2v12H2zM14 2v12L5 8z" fill="currentColor" />
    </svg>
  );
}

function NextGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
      <path d="M12 2h2v12h-2zM2 2v12l9-6z" fill="currentColor" />
    </svg>
  );
}

function EqGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="inline size-3 text-tape-amber">
      <path d="M1 4h2v8H1zM5 1h2v11H5zM9 6h2v6H9z" fill="currentColor" />
    </svg>
  );
}
