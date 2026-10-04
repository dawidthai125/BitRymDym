const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

export type DeleteReasonParse =
  | { ok: true; value: string }
  | { ok: false; code: "INVALID_DELETE_REASON" };

function hasDisallowedChars(value: string): boolean {
  if (value.includes("<") || value.includes("\0")) return true;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 && ch !== "\n" && ch !== "\r" && ch !== "\t") return true;
  }
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function parseAdminDeleteReason(raw: unknown): DeleteReasonParse {
  if (typeof raw !== "string") {
    return { ok: false, code: "INVALID_DELETE_REASON" };
  }
  const value = raw.trim();
  if (value.length < MIN_REASON_LENGTH || value.length > MAX_REASON_LENGTH) {
    return { ok: false, code: "INVALID_DELETE_REASON" };
  }
  if (hasDisallowedChars(value)) {
    return { ok: false, code: "INVALID_DELETE_REASON" };
  }
  return { ok: true, value };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAdminDeleteTargetUserId(
  raw: unknown,
): { ok: true; value: string } | { ok: false; code: "TARGET_NOT_FOUND" } {
  if (typeof raw !== "string" || !UUID_RE.test(raw.trim())) {
    return { ok: false, code: "TARGET_NOT_FOUND" };
  }
  return { ok: true, value: raw.trim().toLowerCase() };
}
