/**
 * Studio lyrics (gaps P0 #2) — pure model shared by the editor, the
 * teleprompter and the API. A project has one lyrics document:
 * sections (label + optional start anchor on the timeline) with lines.
 *
 * Text form (what the user types):
 *   [Zwrotka 1]
 *   pierwsza linijka
 *   druga linijka
 *   [Refren]
 *   ...
 */

export const LYRICS_LIMITS = {
  maxSections: 40,
  maxLinesPerSection: 64,
  maxLineChars: 200,
  maxLabelChars: 40,
  maxTotalChars: 12_000,
  maxStartMs: 60 * 60 * 1000,
} as const;

export type LyricsSection = {
  id: string;
  label: string;
  /** Where the section starts on the project timeline; null = not anchored. */
  startMs: number | null;
  lines: string[];
};

export type LyricsDoc = { sections: LyricsSection[] };

export type StoredLyrics = { doc: LyricsDoc; version: number; updatedAt: string | null };

export class LyricsValidationError extends Error {
  readonly code = "LYRICS_INVALID" as const;
  constructor(detail: string) {
    super(`Nieprawidłowy tekst: ${detail}`);
    this.name = "LyricsValidationError";
  }
}

const HEADER_RE = /^\s*\[([^\]\n]{1,80})\]\s*$/;
const ID_RE = /^[a-z0-9-]{1,40}$/i;

export function emptyLyricsDoc(): LyricsDoc {
  return { sections: [] };
}

function cleanLine(line: string): string {
  return line.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\s+$/g, "");
}

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Text → doc. Anchors (startMs) and ids survive edits: a section keeps the
 * anchor of the previous section with the same label (first unused match),
 * otherwise of the section at the same index when its label was untouched.
 */
export function lyricsFromText(
  text: string,
  previous: LyricsDoc = emptyLyricsDoc(),
  options: { defaultLabel?: string; createId?: () => string } = {},
): LyricsDoc {
  const createId = options.createId ?? newId;
  const defaultLabel = options.defaultLabel ?? "Tekst";
  const raw: { label: string; lines: string[] }[] = [];
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const header = HEADER_RE.exec(rawLine);
    if (header) {
      raw.push({ label: header[1].trim().slice(0, LYRICS_LIMITS.maxLabelChars), lines: [] });
      continue;
    }
    const line = cleanLine(rawLine).slice(0, LYRICS_LIMITS.maxLineChars);
    if (raw.length === 0) {
      if (line.trim() === "") continue;
      raw.push({ label: defaultLabel, lines: [] });
    }
    raw[raw.length - 1].lines.push(line);
  }
  const used = new Set<number>();
  const sections = raw.slice(0, LYRICS_LIMITS.maxSections).map((s, index) => {
    // Trim blank lines at the edges of a section, keep inner spacing.
    const lines = [...s.lines];
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    let match = previous.sections.findIndex((p, i) => !used.has(i) && p.label === s.label);
    if (match === -1 && previous.sections[index] && !used.has(index)) {
      match = previous.sections.length === raw.length ? index : -1;
    }
    if (match !== -1) used.add(match);
    const prev = match === -1 ? null : previous.sections[match];
    return {
      id: prev?.id ?? createId(),
      label: s.label,
      startMs: prev?.startMs ?? null,
      lines: lines.slice(0, LYRICS_LIMITS.maxLinesPerSection),
    };
  });
  return { sections };
}

/** Doc → editable text. */
export function lyricsToText(doc: LyricsDoc): string {
  return doc.sections
    .map((s) => [`[${s.label}]`, ...s.lines].join("\n"))
    .join("\n\n");
}

export function lyricsCharCount(doc: LyricsDoc): number {
  return doc.sections.reduce(
    (n, s) => n + s.label.length + s.lines.reduce((m, l) => m + l.length + 1, 0),
    0,
  );
}

/** Strict parse for writes (API PUT). Throws LyricsValidationError. */
export function parseLyricsDocForWrite(raw: unknown): LyricsDoc {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new LyricsValidationError("doc");
  const sectionsRaw = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sectionsRaw)) throw new LyricsValidationError("sections");
  if (sectionsRaw.length > LYRICS_LIMITS.maxSections) throw new LyricsValidationError("za dużo sekcji");
  const ids = new Set<string>();
  const sections = sectionsRaw.map((item, i): LyricsSection => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new LyricsValidationError(`sekcja ${i + 1}`);
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !ID_RE.test(o.id) || ids.has(o.id)) throw new LyricsValidationError(`sekcja ${i + 1}: id`);
    ids.add(o.id);
    if (typeof o.label !== "string" || o.label.trim() === "" || o.label.length > LYRICS_LIMITS.maxLabelChars) {
      throw new LyricsValidationError(`sekcja ${i + 1}: nazwa`);
    }
    let startMs: number | null = null;
    if (o.startMs !== null && o.startMs !== undefined) {
      if (typeof o.startMs !== "number" || !Number.isFinite(o.startMs) || o.startMs < 0 || o.startMs > LYRICS_LIMITS.maxStartMs) {
        throw new LyricsValidationError(`sekcja ${i + 1}: początek`);
      }
      startMs = Math.round(o.startMs);
    }
    if (!Array.isArray(o.lines) || o.lines.length > LYRICS_LIMITS.maxLinesPerSection) {
      throw new LyricsValidationError(`sekcja ${i + 1}: linijki`);
    }
    const lines = o.lines.map((l) => {
      if (typeof l !== "string" || l.length > LYRICS_LIMITS.maxLineChars) throw new LyricsValidationError(`sekcja ${i + 1}: linijka`);
      return cleanLine(l);
    });
    return { id: o.id, label: o.label.trim(), startMs, lines };
  });
  const doc = { sections };
  if (lyricsCharCount(doc) > LYRICS_LIMITS.maxTotalChars) throw new LyricsValidationError("tekst za długi");
  return doc;
}

/** Tolerant read (DB row → doc). Never throws. */
export function readLyricsDoc(raw: unknown): LyricsDoc {
  try {
    return parseLyricsDocForWrite(raw);
  } catch {
    return emptyLyricsDoc();
  }
}

export function setLyricsSectionStart(doc: LyricsDoc, sectionId: string, startMs: number | null): LyricsDoc {
  return {
    sections: doc.sections.map((s) =>
      s.id === sectionId ? { ...s, startMs: startMs === null ? null : Math.max(0, Math.round(startMs)) } : s,
    ),
  };
}

export type LyricsRecMode = "single" | "loop" | "punch";

export type LyricsFocus = {
  /** Section to highlight, or null (nothing anchored before the reference point). */
  sectionId: string | null;
  /** Line within that section to highlight (punch-in line), or null. */
  lineIndex: number | null;
  /** Time used to pick the section. */
  referenceMs: number;
};

/**
 * Which section the rapper should read now.
 * Loop / punch-in: the section that contains the looped range start
 * (stable while the loop repeats). Otherwise: the playhead.
 * The current section = last anchored section whose start ≤ reference.
 */
export function lyricsFocus(input: {
  doc: LyricsDoc;
  mode: LyricsRecMode;
  playheadMs: number;
  loopStartMs?: number | null;
  punchLine?: number | null;
}): LyricsFocus {
  const looped = input.mode !== "single" && typeof input.loopStartMs === "number";
  const referenceMs = looped ? (input.loopStartMs as number) : Math.max(0, input.playheadMs);
  let best: LyricsSection | null = null;
  for (const s of input.doc.sections) {
    if (s.startMs === null || s.startMs > referenceMs + 20) continue;
    if (!best || (best.startMs as number) <= s.startMs) best = s;
  }
  if (!best) return { sectionId: null, lineIndex: null, referenceMs };
  const lineIndex =
    input.mode === "punch" && typeof input.punchLine === "number" && input.punchLine >= 0 && input.punchLine < best.lines.length
      ? input.punchLine
      : null;
  return { sectionId: best.id, lineIndex, referenceMs };
}
