/**
 * Admin "reset limits" — pure part (no I/O, unit-tested).
 * A reset stores one timestamp per user and metric (table `usage_resets`). Every quota
 * counter then counts from the LATER of its normal window start and that timestamp.
 * The same metric names are checked by the DB constraint `usage_resets_metric_chk`.
 */

export const USAGE_RESET_METRICS = [
  "recordings",
  "masters",
  "downloads",
  "video",
  "cleanup",
  "lyrics",
  "cover",
] as const;

export type UsageResetMetric = (typeof USAGE_RESET_METRICS)[number];

export function isUsageResetMetric(value: unknown): value is UsageResetMetric {
  return typeof value === "string" && (USAGE_RESET_METRICS as readonly string[]).includes(value);
}

/** Later of the normal window start and the reset marker (ISO strings). */
export function windowStartAfterReset(defaultStartIso: string, resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return defaultStartIso;
  const reset = Date.parse(resetAtIso);
  const start = Date.parse(defaultStartIso);
  if (!Number.isFinite(reset) || !Number.isFinite(start)) return defaultStartIso;
  return reset > start ? new Date(reset).toISOString() : defaultStartIso;
}
