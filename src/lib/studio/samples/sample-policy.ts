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

/** Synth voices of the Studio sample desk (it renders these itself). */
export type SynthSampleInstrumentId = (typeof SAMPLE_INSTRUMENTS)[number]["id"];

/** Real instruments recorded in the Sample Lab (Silver+). */
export const LIVE_SAMPLE_INSTRUMENTS = [
  { id: "acoustic_guitar", kind: "instrument" },
  { id: "electric_guitar", kind: "instrument" },
  { id: "live_bass", kind: "instrument" },
  { id: "keys", kind: "instrument" },
  { id: "strings", kind: "instrument" },
  { id: "sax", kind: "instrument" },
  { id: "trumpet", kind: "instrument" },
  { id: "flute", kind: "instrument" },
  { id: "vocal", kind: "instrument" },
  { id: "perc", kind: "effect" },
  { id: "drums", kind: "effect" },
  { id: "fx", kind: "effect" },
] as const;

export type SampleInstrumentId =
  | SynthSampleInstrumentId
  | (typeof LIVE_SAMPLE_INSTRUMENTS)[number]["id"];

const ALL_SAMPLE_INSTRUMENTS: readonly { id: string; kind: SampleKind }[] = [
  ...SAMPLE_INSTRUMENTS,
  ...LIVE_SAMPLE_INSTRUMENTS,
];

/** Sample Lab metadata. */
export const SAMPLE_TYPES = ["oneshot", "loop", "phrase"] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];
export const SAMPLE_SOURCES = ["studio", "live", "import"] as const;
export type SampleSource = (typeof SAMPLE_SOURCES)[number];
export const SAMPLE_BPM_MIN = 40;
export const SAMPLE_BPM_MAX = 240;
export const SAMPLE_BARS = [1, 2, 4, 8, 16] as const;
/** "A2" (one-shot note) or "Am" / "F#" (loop key). */
const MUSICAL_KEY_RE = /^[A-G]#?(m|-?[0-9])?$/;

export type SampleLabMeta = {
  sampleType: SampleType;
  bpm: number | null;
  musicalKey: string | null;
  bars: number | null;
  source: SampleSource;
  beatId: string | null;
};

/** Validate optional lab metadata from a form. Unknown or empty fields become null. */
export function parseSampleLabMeta(input: {
  sampleType?: unknown;
  bpm?: unknown;
  musicalKey?: unknown;
  bars?: unknown;
  source?: unknown;
  beatId?: unknown;
}): { ok: true; value: SampleLabMeta } | { ok: false; details: string[] } {
  const details: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const type = str(input.sampleType) || "oneshot";
  if (!(SAMPLE_TYPES as readonly string[]).includes(type)) details.push("sample type is invalid");
  const source = str(input.source) || "studio";
  if (!(SAMPLE_SOURCES as readonly string[]).includes(source)) details.push("source is invalid");
  let bpm: number | null = null;
  if (str(input.bpm)) {
    bpm = Math.round(Number(str(input.bpm)) * 10) / 10;
    if (!Number.isFinite(bpm) || bpm < SAMPLE_BPM_MIN || bpm > SAMPLE_BPM_MAX) details.push("bpm is out of range");
  }
  const key = str(input.musicalKey) || null;
  if (key && !MUSICAL_KEY_RE.test(key)) details.push("musical key is invalid");
  let bars: number | null = null;
  if (str(input.bars)) {
    bars = Number(str(input.bars));
    if (!(SAMPLE_BARS as readonly number[]).includes(bars)) details.push("bars is invalid");
  }
  if (type === "loop" && (bpm == null || bars == null)) details.push("a loop needs bpm and bars");
  const beatId = str(input.beatId) || null;
  if (beatId && !isSampleUuid(beatId)) details.push("beat id is invalid");
  if (details.length) return { ok: false, details };
  return {
    ok: true,
    value: { sampleType: type as SampleType, bpm, musicalKey: key, bars: type === "loop" ? bars : null, source: source as SampleSource, beatId },
  };
}

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
    ALL_SAMPLE_INSTRUMENTS.some((item) => item.id === value)
  );
}

export function instrumentKind(id: SampleInstrumentId): SampleKind {
  const found = ALL_SAMPLE_INSTRUMENTS.find((item) => item.id === id);
  return found?.kind ?? "effect";
}

export function normalizeSampleTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/[\u0000-\u001f]/g, "").trim();
  if (title.length < 1 || title.length > SAMPLE_TITLE_MAX) return null;
  return title;
}

export const SAMPLE_DESCRIPTION_MAX = 600;

/** undefined = field not sent (keep), null = cleared, false = too long. */
export function normalizeSampleDescription(value: unknown): string | null | undefined | false {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return [...text].length > SAMPLE_DESCRIPTION_MAX ? false : text;
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

/** Effective per-owner sample cap (plan cap bounded by SAMPLE_MAX_COUNT); 0 when the plan cap is invalid. */
export function effectiveSampleCap(planCap: number): number {
  if (!Number.isInteger(planCap) || planCap < 1) return 0;
  return Math.min(SAMPLE_MAX_COUNT, planCap);
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
  const cap = effectiveSampleCap(input.cap);
  if (cap < 1 || !Number.isInteger(input.ownedCount) || input.ownedCount >= cap) {
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

/**
 * Catalog duration is a whole second, rounded UP: a take copy cut to fewer seconds than the
 * audio would chop the end of a loop on the timeline (seen live: 3.43 s hats became 3 s).
 */
export function catalogDurationSeconds(durationMs: number): number {
  const seconds = Math.ceil(durationMs / 1000 - 0.001);
  if (seconds < 1) return 1;
  if (seconds > 180) return 180;
  return seconds;
}

/**
 * PostgREST `.or()` filter that keeps normal takes (title empty or anything else) and drops
 * the private take copies a sample makes when it goes on the timeline (title "smp:<id>").
 * Those copies are Studio plumbing, not recordings: they must not show in "Moje nagrania".
 */
export const NOT_SAMPLE_COPY_TAKE = "title.is.null,and(title.not.like.smp:*,title.not.like.catalog:*)";

/** Sample id behind a sample-copy take title ("smp:<id>"), or null for a normal take. */
export function parseSampleCopyTakeTitle(title: string | null | undefined): string | null {
  if (!title || !title.startsWith("smp:")) return null;
  const id = title.slice(4);
  return isSampleUuid(id) ? id.toLowerCase() : null;
}

/** Catalog samples are for use in songs, not for taking home as files. */
export const SAMPLE_DOWNLOAD_BLOCKED =
  "Sampla z katalogu nie można pobrać ani wyeksportować. Możesz go używać w swoich projektach.";

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
