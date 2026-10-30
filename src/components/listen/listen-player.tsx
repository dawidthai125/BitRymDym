"use client";

/**
 * Gaps P1 — listen-only player: native controls without the download item,
 * no context menu. A deterrent only — anything a browser can play can be recorded.
 */
export function ListenPlayer({ src, label }: { src: string; label: string }) {
  return (
    <audio
      data-testid="listen-player"
      aria-label={label}
      className="w-full"
      controls
      controlsList="nodownload noplaybackrate"
      preload="none"
      src={src}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
