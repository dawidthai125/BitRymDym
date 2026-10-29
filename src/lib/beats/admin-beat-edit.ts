/**
 * Admin beat metadata edit helpers (no I/O): upload-date input + audit diff.
 */

import type { Beat } from "@/types/domain";

export const ADMIN_BEAT_UPLOAD_DATE_MIN = "2020-01-01";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of an ISO timestamp in the user's zone (Europe/Warsaw). */
export function warsawDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type UploadDateParse =
  | { ok: true; iso: string | null }
  | { ok: false; error: string };

/**
 * Parses the "upload date" form field. Empty or unchanged → `iso: null`
 * (do not touch created_at). A new day is stored at 12:00 UTC, which is the
 * same calendar day in Warsaw all year round.
 */
export function parseUploadDateInput(
  raw: string | null | undefined,
  currentIso: string,
  now: Date = new Date(),
): UploadDateParse {
  const value = (raw ?? "").trim();
  if (!value) return { ok: true, iso: null };
  const m = DATE_RE.exec(value);
  if (!m) return { ok: false, error: "Data wrzucenia musi mieć format RRRR-MM-DD." };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return { ok: false, error: "Data wrzucenia nie jest prawidłową datą." };
  }
  if (value < ADMIN_BEAT_UPLOAD_DATE_MIN) {
    return { ok: false, error: "Data wrzucenia jest zbyt wczesna." };
  }
  if (value > warsawDateInputValue(now.toISOString())) {
    return { ok: false, error: "Data wrzucenia nie może być w przyszłości." };
  }
  if (value === warsawDateInputValue(currentIso)) return { ok: true, iso: null };
  return { ok: true, iso: date.toISOString() };
}

export const ADMIN_BEAT_AUDITED_FIELDS = [
  "title",
  "producer",
  "description",
  "genre",
  "style",
  "bpm",
  "key",
  "scale",
  "tags",
  "coverRef",
  "createdAt",
] as const satisfies readonly (keyof Beat)[];

type AuditedField = (typeof ADMIN_BEAT_AUDITED_FIELDS)[number];
type AuditSnapshot = Partial<Pick<Beat, AuditedField>>;

/** Only fields that actually changed, for admin_audit_events old/new values. */
export function diffBeatMetadataForAudit(
  before: Beat,
  after: Beat,
): { oldValue: AuditSnapshot; newValue: AuditSnapshot; changed: AuditedField[] } {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  const changed: AuditedField[] = [];
  for (const field of ADMIN_BEAT_AUDITED_FIELDS) {
    const a = before[field];
    const b = after[field];
    const same =
      field === "createdAt"
        ? new Date(String(a)).getTime() === new Date(String(b)).getTime()
        : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (!same) {
      oldValue[field] = a ?? null;
      newValue[field] = b ?? null;
      changed.push(field);
    }
  }
  return { oldValue: oldValue as AuditSnapshot, newValue: newValue as AuditSnapshot, changed };
}
