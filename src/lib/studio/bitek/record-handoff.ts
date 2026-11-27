/**
 * A recording hint carried into Mix.
 * The record panel writes it; Mix reads it and applies a real gain change.
 * Navigation uses the existing "Przejdź do mixu" button (studio-editor owns the step).
 */

export type BitekRecordIssue = "quiet" | "clip";

export type BitekRecordHandoff = {
  projectId: string;
  issue: BitekRecordIssue;
  peakDb: number;
  at: number;
};

const KEY = "brd.bitek.recordHandoff.v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const listeners = new Set<() => void>();

function emitHandoff(): void {
  for (const listener of listeners) listener();
}

export function subscribeBitekRecordHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Input peak (dBFS) below this is "a bit quiet" for a vocal take. */
export const TAKE_QUIET_DB = -20;
/** Input peak at/above this counts as clipping. */
export const TAKE_CLIP_DB = -1;

export function takeIssueFromPeak(peakDb: number, clipping = false): BitekRecordIssue | null {
  if (!Number.isFinite(peakDb) || peakDb <= -90) return null;
  if (clipping || peakDb >= TAKE_CLIP_DB) return "clip";
  if (peakDb < TAKE_QUIET_DB) return "quiet";
  return null;
}

/**
 * Gain to set on the vocal track from the measured input peak.
 * Quiet only goes up, clip only goes down, one step is at most 6 dB.
 * Returns null when the move would be under 0.5 dB.
 */
export function gainDbForTakePeak(currentGainDb: number, issue: BitekRecordIssue, peakDb: number): number | null {
  const target = issue === "quiet" ? -12 : -6;
  let delta = target - peakDb;
  if (issue === "clip") delta = Math.min(0, delta);
  if (issue === "quiet") delta = Math.max(0, delta);
  delta = Math.max(-6, Math.min(6, delta));
  delta = Math.round(delta * 2) / 2;
  if (Math.abs(delta) < 0.5) return null;
  const next = Math.round((currentGainDb + delta) * 2) / 2;
  const clamped = Math.max(-24, Math.min(12, next));
  return clamped === Math.round(currentGainDb * 2) / 2 ? null : clamped;
}

/** How far Bitek moves the beat down when raising the vocal alone is not enough. */
export const AUTO_BEAT_CUT_DB = 3;

/**
 * Right after a quiet take: the vocal track goes up (at most 6 dB, not over +12), and what is still
 * missing comes off the beat (at most 3 dB, not under -24). The recording itself does not change.
 * null fields: that track stays as it is.
 */
export function autoLevelForQuietTake(input: {
  vocalGainDb: number;
  beatGainDb: number | null;
  peakDb: number;
}): { vocalGainDb: number | null; beatGainDb: number | null } {
  const half = (v: number) => Math.round(v * 2) / 2;
  const missing = Math.max(0, half(-12 - input.peakDb));
  if (missing < 0.5) return { vocalGainDb: null, beatGainDb: null };
  const vocalUp = Math.max(0, Math.min(6, missing, half(12 - input.vocalGainDb)));
  const rest = missing - vocalUp;
  const beatDown =
    input.beatGainDb == null ? 0 : Math.max(0, Math.min(AUTO_BEAT_CUT_DB, rest, half(input.beatGainDb + 24)));
  return {
    vocalGainDb: vocalUp >= 0.5 ? half(input.vocalGainDb + vocalUp) : null,
    beatGainDb: beatDown >= 0.5 && input.beatGainDb != null ? half(input.beatGainDb - beatDown) : null,
  };
}

export function saveBitekRecordHandoff(handoff: BitekRecordHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff));
    emitHandoff();
  } catch {
    // Private mode / quota — the bubble still explains the level.
  }
}

export function readBitekRecordHandoff(projectId: string, now = Date.now()): BitekRecordHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<BitekRecordHandoff>;
    if (h.projectId !== projectId) return null;
    if (h.issue !== "quiet" && h.issue !== "clip") return null;
    if (typeof h.peakDb !== "number" || !Number.isFinite(h.peakDb)) return null;
    if (typeof h.at !== "number" || now - h.at > MAX_AGE_MS) return null;
    return { projectId, issue: h.issue, peakDb: h.peakDb, at: h.at };
  } catch {
    return null;
  }
}

export function clearBitekRecordHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
    emitHandoff();
  } catch {
    // ignore
  }
}

/** Clicks the existing Mix step button. Returns false when it is missing or disabled. */
export function requestStudioGoMix(): boolean {
  if (typeof document === "undefined") return false;
  const btn = document.querySelector<HTMLButtonElement>('[data-testid="studio-go-mix"]');
  if (!btn || btn.disabled) return false;
  btn.click();
  return true;
}
