/**
 * Community Wave 5 — per-beat submit cooldown (pure helper).
 * DB trigger enforces the same rule for RLS/direct updates.
 */

export const SUBMIT_COOLDOWN_SECONDS = 60;

export const SUBMIT_COOLDOWN_MESSAGE =
  "Submit cooldown active; wait before resubmitting.";

export function assertSubmitCooldown(params: {
  lastSubmittedAt: string | null | undefined;
  nowMs?: number;
  cooldownSeconds?: number;
}): { ok: true } | { ok: false; error: string } {
  const cooldown =
    params.cooldownSeconds ?? SUBMIT_COOLDOWN_SECONDS;
  if (!params.lastSubmittedAt) {
    return { ok: true };
  }
  const last = Date.parse(params.lastSubmittedAt);
  if (!Number.isFinite(last)) {
    return { ok: true };
  }
  const now = params.nowMs ?? Date.now();
  if (now - last < cooldown * 1000) {
    return { ok: false, error: SUBMIT_COOLDOWN_MESSAGE };
  }
  return { ok: true };
}
