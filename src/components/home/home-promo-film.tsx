"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { usePlayerOptional } from "@/components/player/player-provider";
import { cn } from "@/lib/utils";

/**
 * Homepage film in the same deck faceplate as the hero tape.
 * The catalog player and this film never play together: starting one pauses the other.
 */
export function HomePromoFilm() {
  const t = useTranslations("home.page");
  const player = usePlayerOptional();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const phase = player?.phase;

  useEffect(() => {
    if (phase !== "playing") return;
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
  }, [phase]);

  function onPlay() {
    setPlaying(true);
    if (player?.phase === "playing") player.toggle();
  }

  return (
    <figure className="mt-8 max-w-4xl border border-tape-line-strong bg-tape-panel p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-tape-line pb-3">
        <p className="font-poster text-sm font-bold uppercase tracking-[var(--tape-tracking-label)] text-tape-cream-soft">
          {t("promoDeck")}
        </p>
        <p
          aria-hidden="true"
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-tape-mute"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              playing
                ? "bg-tape-rec shadow-[0_0_10px_2px_rgba(255,75,54,0.55)]"
                : "bg-tape-line-strong",
            )}
          />
          {playing ? t("promoLeci") : t("promoStop")}
        </p>
      </div>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster="/promo/jak-to-dziala-poster.jpg"
        aria-label={t("promoFilm")}
        className="tape-focus aspect-video w-full rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-soot"
        onPlay={onPlay}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        <source src="/promo/jak-to-dziala.mp4" type="video/mp4" />
      </video>
      <figcaption className="mt-3 max-w-[60ch] text-sm leading-relaxed text-tape-cream-soft sm:text-base">
        {t("promoPodpis")}
      </figcaption>
    </figure>
  );
}
