/**
 * Admin beat generator: one description becomes an instrumental hip-hop prompt.
 * Stable Audio accepts English only and must not be asked for a named artist or song.
 */

export const BEAT_DURATION_CHOICES = [90, 120, 150, 180] as const;
export const DEFAULT_BEAT_DURATION = 150;
export const BEAT_DESCRIPTION_MIN = 8;
export const BEAT_DESCRIPTION_MAX = 800;
export const BEAT_HINT_BPM_MIN = 60;
export const BEAT_HINT_BPM_MAX = 180;
export const GENERATED_STYLE_DEFAULT = "hip-hop instrumentalny";

const INSTRUMENTAL_CLAUSE =
  "Instrumental hip-hop only. No vocals, no singing, no rap, no speech, no lyrics. Leave space for a vocalist to record over the beat.";

const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

export type BeatDuration = (typeof BEAT_DURATION_CHOICES)[number];

export function normalizeBeatDuration(value: unknown): BeatDuration | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) return null;
  return (BEAT_DURATION_CHOICES as readonly number[]).includes(n)
    ? (n as BeatDuration)
    : null;
}

export function normalizeBeatDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < BEAT_DESCRIPTION_MIN || text.length > BEAT_DESCRIPTION_MAX) {
    return null;
  }
  return text;
}

/** Empty input is allowed. A typed tempo must be a whole number in the hip-hop range. */
export function normalizeBeatHintBpm(value: unknown): number | null | "invalid" {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < BEAT_HINT_BPM_MIN || n > BEAT_HINT_BPM_MAX) {
    return "invalid";
  }
  return n;
}

export function descriptionNeedsTranslation(text: string): boolean {
  return POLISH_LETTERS.test(text);
}

export function stripStyleOfNamedArtist(prompt: string): string {
  return prompt
    .replace(/\b(in the style of|inspired by)\s+[^.,;]{2,80}/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function withInstrumentalClause(prompt: string): string {
  const cleaned = stripStyleOfNamedArtist(prompt);
  if (/no vocals/i.test(cleaned) && /hip-hop|hip hop/i.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned} ${INSTRUMENTAL_CLAUSE}`.replace(/\s+/g, " ").trim();
}

export function fallbackEnglishPrompt(
  description: string,
  bpm: number | null,
): string {
  const tempo = bpm ? `${bpm} BPM. ` : "";
  return withInstrumentalClause(
    `Instrumental hip-hop beat. ${tempo}${description}. Drums, 808 bass and a melody.`,
  );
}

export function sanitizeBeatTitle(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const title = raw.replace(/["“”„]/g, "").replace(/\s+/g, " ").trim();
  if (title.length < 1) return "Bit BitRymDym";
  return title.slice(0, 80);
}

/** Polish style label. Shorter than 3 characters becomes the default. */
export function sanitizeBeatStyle(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const style = raw.replace(/["“”„]/g, "").replace(/\s+/g, " ").trim();
  if (style.length < 3) return GENERATED_STYLE_DEFAULT;
  return style.slice(0, 80);
}

/** Fills the generator description field: style label plus producer brief. */
export function descriptionFromYoutubeStyle(input: {
  style: string;
  opis: string;
}): string {
  const style = input.style.trim();
  const opis = input.opis.trim();
  const joined =
    style &&
    style !== GENERATED_STYLE_DEFAULT &&
    !opis.toLowerCase().startsWith(style.toLowerCase())
      ? `${style}. ${opis}`
      : opis || style;
  return joined.replace(/\s+/g, " ").trim().slice(0, BEAT_DESCRIPTION_MAX);
}

/**
 * Polish style description. Null when missing or shorter than 12 characters
 * so the caller can keep the user's original text. Caps at BEAT_DESCRIPTION_MAX
 * so a YouTube producer brief fits the generator field.
 */
export function sanitizeBeatOpis(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 12) return null;
  return text.slice(0, BEAT_DESCRIPTION_MAX);
}

export function parseBeatRewrite(
  raw: string,
): { title: string; prompt: string; style: string | null; opis: string | null } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as {
    title?: unknown;
    prompt?: unknown;
    style?: unknown;
    opis?: unknown;
  };
  if (typeof row.prompt !== "string") return null;
  const prompt = withInstrumentalClause(row.prompt);
  if (prompt.length < 20 || prompt.length > 2000) return null;
  return {
    title: sanitizeBeatTitle(row.title),
    prompt,
    style: typeof row.style === "string" ? sanitizeBeatStyle(row.style) : null,
    opis: sanitizeBeatOpis(row.opis),
  };
}

export type GeneratedBpmPick = {
  bpm: number;
  mode: "AUTO" | "CANDIDATE";
};

/**
 * Tempo saved with the draft. The existing finalize policy only accepts a BPM
 * from the file's allowlist, and a weak read needs an explicit candidate.
 */
export function pickGeneratedBpm(
  envelope: {
    decision: "AUTO_SUGGEST" | "MANUAL_REQUIRED" | "UNAVAILABLE";
    detectedBpm: number | null;
    allowlist: number[];
    requiresExplicitSelection: boolean;
    confidenceClass: string;
  },
  hint: number | null,
): GeneratedBpmPick | null {
  const allow = envelope.allowlist.filter((n) => Number.isInteger(n));
  const hintOk = hint != null && allow.includes(hint);
  const detectedOk =
    envelope.detectedBpm != null && allow.includes(envelope.detectedBpm);

  if (
    !envelope.requiresExplicitSelection &&
    envelope.decision === "AUTO_SUGGEST" &&
    envelope.confidenceClass === "HIGH" &&
    detectedOk &&
    (hint == null || hint === envelope.detectedBpm)
  ) {
    return { bpm: envelope.detectedBpm as number, mode: "AUTO" };
  }

  if (hintOk) return { bpm: hint, mode: "CANDIDATE" };
  if (detectedOk) return { bpm: envelope.detectedBpm as number, mode: "CANDIDATE" };
  if (allow.length === 0) return null;

  const target = hint ?? envelope.detectedBpm ?? 90;
  const closest = allow.reduce((best, n) =>
    Math.abs(n - target) < Math.abs(best - target) ? n : best,
  );
  return { bpm: closest, mode: "CANDIDATE" };
}
