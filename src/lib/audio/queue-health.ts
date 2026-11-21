/**
 * Contabo E3 queue health (2026-11-22). Pure. Nothing watched the worker: when it stopped,
 * exports and masters just waited. A public endpoint exposes only these counts; a GitHub
 * Actions schedule fails (→ owner e-mail) when `ok` is false.
 */

export const QUEUE_HEALTH_LOOKBACK_MS = 24 * 3600_000;
/** A WAV export / mix waiting longer than this means no worker is claiming. */
export const RENDER_QUEUED_STALE_MS = 15 * 60_000;
/** RUNNING this long after its timeout means the worker died mid-job. */
export const RENDER_RUNNING_PAST_TIMEOUT_MS = 10 * 60_000;
export const MASTER_QUEUED_STALE_MS = 30 * 60_000;
export const MASTER_RUNNING_STALE_MS = 30 * 60_000;

export type RenderJobRow = { status: string; queuedAt: string | null; timeoutAt: string | null };
export type MasterJobRow = { status: string; createdAt: string | null; startedAt: string | null; progressAt: string | null };

export type QueueHealth = {
  ok: boolean;
  render: { queued: number; running: number; stuckQueued: number; stuckRunning: number; oldestQueuedSec: number | null };
  master: { queued: number; running: number; stuckQueued: number; stuckRunning: number; oldestQueuedSec: number | null };
};

const t = (s: string | null) => (s ? Date.parse(s) : NaN);

export function evaluateQueueHealth(render: readonly RenderJobRow[], master: readonly MasterJobRow[], now = Date.now()): QueueHealth {
  const r = { queued: 0, running: 0, stuckQueued: 0, stuckRunning: 0, oldestQueuedSec: null as number | null };
  for (const j of render) {
    if (j.status === "QUEUED") {
      r.queued += 1;
      const q = t(j.queuedAt);
      if (Number.isFinite(q)) {
        const age = now - q;
        r.oldestQueuedSec = Math.max(r.oldestQueuedSec ?? 0, Math.round(age / 1000));
        if (age > RENDER_QUEUED_STALE_MS) r.stuckQueued += 1;
      }
    } else if (j.status === "RUNNING") {
      r.running += 1;
      const to = t(j.timeoutAt);
      if (Number.isFinite(to) && now - to > RENDER_RUNNING_PAST_TIMEOUT_MS) r.stuckRunning += 1;
    }
  }
  const m = { queued: 0, running: 0, stuckQueued: 0, stuckRunning: 0, oldestQueuedSec: null as number | null };
  for (const j of master) {
    if (j.status === "queued") {
      m.queued += 1;
      const c = t(j.createdAt);
      if (Number.isFinite(c)) {
        const age = now - c;
        m.oldestQueuedSec = Math.max(m.oldestQueuedSec ?? 0, Math.round(age / 1000));
        if (age > MASTER_QUEUED_STALE_MS) m.stuckQueued += 1;
      }
    } else if (j.status === "running") {
      m.running += 1;
      const last = Math.max(...[t(j.progressAt), t(j.startedAt)].filter(Number.isFinite), -Infinity);
      if (Number.isFinite(last) && now - last > MASTER_RUNNING_STALE_MS) m.stuckRunning += 1;
    }
  }
  return { ok: r.stuckQueued + r.stuckRunning + m.stuckQueued + m.stuckRunning === 0, render: r, master: m };
}
