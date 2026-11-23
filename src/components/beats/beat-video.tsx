"use client";

import { useState } from "react";

/** YouTube facade: thumbnail until clicked, then a privacy-enhanced embed. */
export function BeatVideo({ videoId, title, label }: { videoId: string; title: string; label: string }) {
  const [play, setPlay] = useState(false);
  return (
    <section aria-label={label} className="mt-6 border-t border-[var(--brd-line)] pt-4" data-testid="beat-video">
      <h2 className="brd-display mb-3 text-2xl text-[var(--brd-ink)]">{label}</h2>
      <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-[var(--brd-r-cta)] bg-black">
        {play ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button type="button" onClick={() => setPlay(true)} className="group absolute inset-0 h-full w-full" aria-label={`${label}: ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 group-hover:opacity-100" />
            <span className="absolute left-1/2 top-1/2 flex h-16 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[var(--brd-green)] text-3xl text-[var(--primary-foreground)]">▶</span>
          </button>
        )}
      </div>
    </section>
  );
}
