/** Whole days and hours until a recording is removed (pure); null when the date has passed or is broken. */
export function takeTimeLeft(expiresAt: string, now: number): { days: number; hours: number } | null {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalHours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}
