/**
 * User samples and sound effects.
 * Private audio lives at user-samples/{id}/original.bin.
 * A public catalog row is created only after moderation, as catalog_assets.
 */

export const STUDIO_SAMPLES_TABLE = "studio_samples";

/** Hard ceiling. A plan cap is lower and is what the user actually hits. */
export const SAMPLE_MAX_COUNT = 100;
export const SAMPLE_MAX_BYTES = 8 * 1024 * 1024;
export const SAMPLE_MIN_MS = 1000;
export const SAMPLE_MAX_MS = 30_000;
export const SAMPLE_TITLE_MAX = 80;
export const SAMPLE_NOTE_MAX = 500;

export const SAMPLE_STATUSES = [
  "PRIVATE",
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
] as const;

export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const SAMPLE_KINDS = ["instrument", "effect"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

export const SAMPLE_CONTENT_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
] as const;

export const SAMPLE_INSTRUMENTS = [
  { id: "piano", kind: "instrument" },
  { id: "bass", kind: "instrument" },
  { id: "lead", kind: "instrument" },
  { id: "pad", kind: "instrument" },
  { id: "pluck", kind: "instrument" },
  { id: "guitar", kind: "instrument" },
  { id: "brass", kind: "instrument" },
  { id: "kick", kind: "effect" },
  { id: "snare", kind: "effect" },
  { id: "hat", kind: "effect" },
  { id: "impact", kind: "effect" },
  { id: "riser", kind: "effect" },
] as const;

export type SampleInstrumentId = (typeof SAMPLE_INSTRUMENTS)[number]["id"];

export const SAMPLE_TABLE_UNAVAILABLE = "SAMPLE_TABLE_UNAVAILABLE";
export const SAMPLE_SHARE_OFF = "SAMPLE_SHARE_OFF";
export const SAMPLE_NOT_FOUND = "SAMPLE_NOT_FOUND";
export const SAMPLE_FORBIDDEN = "SAMPLE_FORBIDDEN";
export const SAMPLE_RIGHTS_REQUIRED = "SAMPLE_RIGHTS_REQUIRED";
export const SAMPLE_INVALID = "SAMPLE_INVALID";
export const SAMPLE_CAP = "SAMPLE_CAP";
export const SAMPLE_COPY_FAILED = "SAMPLE_COPY_FAILED";
export const SAMPLE_PROJECT_NO_BEAT = "SAMPLE_PROJECT_NO_BEAT";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSampleUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function buildUserSampleObjectKey(sampleId: string): string {
  return `user-samples/${sampleId.toLowerCase()}/original.bin`;
}

export function sampleObjectKeyMatches(sampleId: string, objectKey: string): boolean {
  return objectKey === buildUserSampleObjectKey(sampleId);
}

export function isSampleInstrumentId(value: unknown): value is SampleInstrumentId {
  return (
    typeof value === "string" &&
    SAMPLE_INSTRUMENTS.some((item) => item.id === value)
  );
}

export function instrumentKind(id: SampleInstrumentId): SampleKind {
  const found = SAMPLE_INSTRUMENTS.find((item) => item.id === id);
  return found?.kind ?? "effect";
}

export function normalizeSampleTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/[\u0000-\u001f]/g, "").trim();
  if (title.length < 1 || title.length > SAMPLE_TITLE_MAX) return null;
  return title;
}

export function normalizeSampleNote(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const note = value.replace(/[\u0000-\u001f]/g, "").trim();
  if (!note) return null;
  if (note.length > SAMPLE_NOTE_MAX) return note.slice(0, SAMPLE_NOTE_MAX);
  return note;
}

export function evaluateSampleAudioMeta(input: {
  byteSize: number;
  durationMs: number;
  contentType: string;
}): { ok: true } | { ok: false; error: typeof SAMPLE_INVALID; details: string[] } {
  const details: string[] = [];
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    details.push("byte size must be a positive integer");
  } else if (input.byteSize > SAMPLE_MAX_BYTES) {
    details.push("byte size exceeds the sample cap");
  }
  if (!Number.isInteger(input.durationMs)) {
    details.push("duration must be an integer");
  } else if (input.durationMs < SAMPLE_MIN_MS || input.durationMs > SAMPLE_MAX_MS) {
    details.push("duration must be between 1 and 30 seconds");
  }
  if (
    !(SAMPLE_CONTENT_TYPES as readonly string[]).includes(input.contentType)
  ) {
    details.push("content type is not allowed for a sample");
  }
  if (details.length > 0) {
    return { ok: false, error: SAMPLE_INVALID, details };
  }
  return { ok: true };
}

export function evaluateSampleCreate(input: {
  rightsAccepted: boolean;
  ownedCount: number;
  cap: number;
}):
  | { ok: true }
  | {
      ok: false;
      error: typeof SAMPLE_RIGHTS_REQUIRED | typeof SAMPLE_CAP;
      details: string[];
    } {
  if (input.rightsAccepted !== true) {
    return {
      ok: false,
      error: SAMPLE_RIGHTS_REQUIRED,
      details: ["rights confirmation is required"],
    };
  }
  const cap = Math.min(SAMPLE_MAX_COUNT, input.cap);
  if (!Number.isInteger(input.cap) || input.cap < 1 || !Number.isInteger(input.ownedCount) || input.ownedCount >= cap) {
    return {
      ok: false,
      error: SAMPLE_CAP,
      details: ["sample count cap reached"],
    };
  }
  return { ok: true };
}

export function evaluateSampleSubmit(input: {
  status: string;
  rightsAccepted: boolean;
  owner: boolean;
}):
  | { ok: true }
  | { ok: false; error: string; details: string[] } {
  if (!input.owner) {
    return { ok: false, error: SAMPLE_FORBIDDEN, details: ["not the owner"] };
  }
  if (input.rightsAccepted !== true) {
    return {
      ok: false,
      error: SAMPLE_RIGHTS_REQUIRED,
      details: ["rights confirmation is required"],
    };
  }
  if (input.status !== "PRIVATE" && input.status !== "REJECTED") {
    return {
      ok: false,
      error: SAMPLE_INVALID,
      details: ["only a private or rejected sample can be submitted"],
    };
  }
  return { ok: true };
}

export function evaluateSampleReview(input: {
  status: string;
  rightsAccepted: boolean;
  action: "approve" | "reject";
}):
  | { ok: true }
  | { ok: false; error: string; details: string[] } {
  if (input.status !== "PENDING_REVIEW") {
    return {
      ok: false,
      error: SAMPLE_INVALID,
      details: ["sample is not waiting for review"],
    };
  }
  if (input.action === "approve" && input.rightsAccepted !== true) {
    return {
      ok: false,
      error: SAMPLE_RIGHTS_REQUIRED,
      details: ["cannot publish without a rights confirmation"],
    };
  }
  return { ok: true };
}

export function evaluateSampleDelete(input: {
  status: string;
  owner: boolean;
}): { ok: true } | { ok: false; error: string; details: string[] } {
  if (!input.owner) {
    return { ok: false, error: SAMPLE_FORBIDDEN, details: ["not the owner"] };
  }
  if (input.status !== "PRIVATE" && input.status !== "REJECTED") {
    return {
      ok: false,
      error: SAMPLE_INVALID,
      details: ["a sample in review or in the catalog stays until staff acts"],
    };
  }
  return { ok: true };
}

/** Catalog duration is a whole second. Samples are already at least 1s. */
export function catalogDurationSeconds(durationMs: number): number {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 1) return 1;
  if (seconds > 180) return 180;
  return seconds;
}

export function sampleCopyTakeTitle(sampleId: string): string {
  return `smp:${sampleId.toLowerCase()}`;
}

export function sampleUserMessage(error: string): string {
  switch (error) {
    case SAMPLE_TABLE_UNAVAILABLE:
      return "Katalog sampli nie jest jeszcze włączony.";
    case SAMPLE_SHARE_OFF:
      return "Przełącznik katalogu włączy się po aktualizacji bazy.";
    case SAMPLE_RIGHTS_REQUIRED:
      return "Zaznacz, że masz prawo do tego dźwięku.";
    case SAMPLE_CAP:
      return "Limit sampli Twojego planu jest pełny. Usuń prywatny, żeby dodać kolejny.";
    case SAMPLE_PROJECT_NO_BEAT:
      return "Najpierw wybierz bit w projekcie.";
    case SAMPLE_FORBIDDEN:
      return "Nie możesz użyć tego sampla.";
    case SAMPLE_NOT_FOUND:
      return "Nie ma takiego sampla.";
    default:
      return "Nie udało się zapisać sampla.";
  }
}
