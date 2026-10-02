/**
 * Thin dual-audio preview for READY_TAKE (BIT + TAKE).
 * Not MixGraph — no EQ/limiter. Local UI clock only.
 */

export type TakePreviewGraph = {
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  dispose: () => void;
};

export function createTakePreviewGraph(params: {
  beatEl: HTMLAudioElement;
  takeEl: HTMLAudioElement;
  beatUrl: string;
  takeUrl: string;
  fallbackDuration: number;
}): TakePreviewGraph {
  const { beatEl, takeEl, beatUrl, takeUrl, fallbackDuration } = params;

  beatEl.preload = "auto";
  takeEl.preload = "auto";
  beatEl.src = beatUrl;
  takeEl.src = takeUrl;
  beatEl.load();
  takeEl.load();

  let disposed = false;

  function duration(): number {
    const d = Math.max(
      Number.isFinite(beatEl.duration) ? beatEl.duration : 0,
      Number.isFinite(takeEl.duration) ? takeEl.duration : 0,
      fallbackDuration,
    );
    return d > 0 ? d : fallbackDuration;
  }

  return {
    async play() {
      if (disposed) return;
      await Promise.all([
        beatEl.play().catch(() => undefined),
        takeEl.play().catch(() => undefined),
      ]);
    },
    pause() {
      beatEl.pause();
      takeEl.pause();
    },
    seek(time: number) {
      const t = Math.max(0, Math.min(duration(), time));
      beatEl.currentTime = t;
      takeEl.currentTime = t;
    },
    getCurrentTime() {
      return beatEl.currentTime || takeEl.currentTime || 0;
    },
    getDuration: duration,
    dispose() {
      if (disposed) return;
      disposed = true;
      beatEl.pause();
      takeEl.pause();
      beatEl.removeAttribute("src");
      takeEl.removeAttribute("src");
      beatEl.load();
      takeEl.load();
    },
  };
}
