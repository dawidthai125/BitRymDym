/**
 * Poller log hygiene — fail-closed: never emit secrets, tokens, cookies,
 * signed URLs, or raw audio source / artifact URLs.
 */

const FORBIDDEN_VALUE =
  /(https?:\/\/|eyJ[A-Za-z0-9_-]{10,}\.|supabase\.co\/storage|token=|sig=|X-Amz-|service_role)/i;

const ALLOWED_KEYS = new Set([
  "event",
  "jobId",
  "kind",
  "status",
  "errorCode",
  "durationMs",
  "workerRef",
  "busy",
  "metric",
  "value",
]);

export type SafePollerLogFields = {
  event: string;
  jobId?: string;
  kind?: string;
  status?: string;
  errorCode?: string;
  durationMs?: number;
  workerRef?: string;
  busy?: boolean;
  metric?: string;
  value?: number;
};

export function assertSafePollerLogFields(fields: SafePollerLogFields): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`Unsafe poller log key: ${key}`);
    }
    if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
      throw new Error(`Unsafe poller log value for ${key}`);
    }
  }
}

export function formatSafePollerLog(fields: SafePollerLogFields): string {
  assertSafePollerLogFields(fields);
  return JSON.stringify(fields);
}

/** Redact any accidental string that looks like a secret/URL before console use. */
export function redactUnsafeLogText(text: string): string {
  if (!FORBIDDEN_VALUE.test(text)) return text;
  return "[REDACTED]";
}
