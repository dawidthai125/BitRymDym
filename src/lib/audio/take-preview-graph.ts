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
  /** Beat and vocal gains are 0..1. Rate is the shared listen speed. */
  setListen: (input: { beat: number; take: number; rate: number }) => void;
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
    setListen({ beat, take, rate }) {
      const gain = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1);
      const speed = Number.isFinite(rate) ? Math.min(1.25, Math.max(0.75, rate)) : 1;
      beatEl.volume = gain(beat);
      takeEl.volume = gain(take);
      beatEl.playbackRate = speed;
      takeEl.playbackRate = speed;
    },
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
