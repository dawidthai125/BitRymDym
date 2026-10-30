/**
 * Live recording region (rec-live-ui) — SSOT for the "take being recorded" shown on
 * the capture track before the real Take/Clip exists. Tiny external store so the mic
 * sampler (recording panel) and the timeline lane share it without re-rendering
 * the editor tree. Peaks are bucketed by timeline position (ms after record start).
 */
import type { RecordingUiPhase } from "@/lib/takes/recording-ui-state";

/** One peak bucket per 50 ms of timeline — ~20 Hz, plenty for a lane waveform. */
export const LIVE_TAKE_BUCKET_MS = 50;
/** Hard cap (10 min of buckets) so a stuck session can't grow memory unbounded. */
export const LIVE_TAKE_MAX_BUCKETS = 12_000;

export type LiveTakeStatus = "recording" | "saving" | "pending";

export type LiveTakeSnapshot = {
  trackId: string;
  startMs: number;
  /** Timeline length covered so far (grows while recording, frozen after). */
  elapsedMs: number;
  /** 0..1 peak per LIVE_TAKE_BUCKET_MS bucket. */
  peaks: number[];
  status: LiveTakeStatus;
  /** Bumped on every change — cheap redraw gate for canvas consumers. */
  version: number;
};

/** Which recording phases keep the live region on screen (until the real clip lands). */
export function liveTakeStatusForPhase(
  phase: RecordingUiPhase,
): LiveTakeStatus | null {
  switch (phase) {
    case "RECORDING":
      return "recording";
    case "STOPPING":
    case "UPLOADING":
    case "PROCESSING":
      return "saving";
    case "READY_TAKE":
      return "pending";
    default:
      return null;
  }
}

/**
 * Pure: write `peak` at timeline offset `offsetMs`. Gaps (sampler throttled / tab
 * hidden) are bridged with the previous value so the region has no holes; a bucket
 * keeps its max when sampled twice. Returns a new array only when it changed.
 */
export function appendLivePeak(
  peaks: readonly number[],
  offsetMs: number,
  peak: number,
  bucketMs = LIVE_TAKE_BUCKET_MS,
): number[] {
  if (!Number.isFinite(offsetMs) || offsetMs < 0) return peaks as number[];
  const idx = Math.min(
    LIVE_TAKE_MAX_BUCKETS - 1,
    Math.floor(offsetMs / bucketMs),
  );
  const v = Math.max(0, Math.min(1, Number.isFinite(peak) ? peak : 0));
  const next = peaks.slice();
  const fill = next.length > 0 ? next[next.length - 1]! : 0;
  while (next.length < idx) next.push(fill);
  if (next.length === idx) next.push(v);
  else next[idx] = Math.max(next[idx]!, v);
  return next;
}

/**
 * Pure: downsample bucket peaks to `columns` bars (max per column) for drawing.
 */
export function liveTakeColumns(
  peaks: readonly number[],
  columns: number,
): number[] {
  const n = Math.max(0, Math.floor(columns));
  if (n === 0 || peaks.length === 0) return [];
  const out = new Array<number>(n).fill(0);
  const per = peaks.length / n;
  for (let c = 0; c < n; c += 1) {
    const from = Math.floor(c * per);
    const to = Math.max(from + 1, Math.floor((c + 1) * per));
    let m = 0;
    for (let i = from; i < to && i < peaks.length; i += 1)
      m = Math.max(m, peaks[i]!);
    out[c] = m;
  }
  return out;
}

type Listener = (snap: LiveTakeSnapshot | null) => void;

export function createLiveTakeStore() {
  let snap: LiveTakeSnapshot | null = null;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(snap));
  return {
    get: () => snap,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    begin(trackId: string, startMs: number) {
      snap = {
        trackId,
        startMs,
        elapsedMs: 0,
        peaks: [],
        status: "recording",
        version: 1,
      };
      emit();
    },
    /** `playheadMs` = transport position now; ignored before startMs (count-in / pre-roll). */
    sample(playheadMs: number, peak: number) {
      if (!snap || snap.status !== "recording") return;
      const offset = playheadMs - snap.startMs;
      if (!(offset >= 0)) return;
      snap = {
        ...snap,
        elapsedMs: Math.max(snap.elapsedMs, offset),
        peaks: appendLivePeak(snap.peaks, offset, peak),
        version: snap.version + 1,
      };
      emit();
    },
    setStatus(status: LiveTakeStatus) {
      if (!snap || snap.status === status) return;
      snap = { ...snap, status, version: snap.version + 1 };
      emit();
    },
    end() {
      if (!snap) return;
      snap = null;
      emit();
    },
  };
}

export type LiveTakeStore = ReturnType<typeof createLiveTakeStore>;

/** One live take per page (only one capture can run at a time). */
export const studioLiveTakeStore: LiveTakeStore = createLiveTakeStore();
