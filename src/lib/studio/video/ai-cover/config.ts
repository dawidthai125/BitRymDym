/**
 * Gold — AI cover generator (prompt → image for the YouTube MP4 / beat cover).
 * Pure config + copy, shared by server, routes and the client component.
 */
export type AiCoverAspect = "16:9" | "1:1";
export const AI_COVER_ASPECTS: readonly AiCoverAspect[] = ["16:9", "1:1"];
export const isAiCoverAspect = (v: unknown): v is AiCoverAspect => v === "16:9" || v === "1:1";

export const AI_COVER_PROMPT_MIN = 3;
export const AI_COVER_PROMPT_MAX = 300;
/** Per-provider call timeout — slower than this = switch to the next provider. */
export const AI_COVER_PROVIDER_TIMEOUT_MS = 25_000;
export const AI_COVER_PER_DAY_DEFAULT = 10;

/** Daily cap per user; env STUDIO_AI_COVER_PER_DAY (1–100), default 10. */
export function aiCoverPerDay(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.STUDIO_AI_COVER_PER_DAY ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : AI_COVER_PER_DAY_DEFAULT;
}

/** Final stored size (after crop). Pollinations' free API caps the area at 768², so 16:9 = 1024×576. */
export const AI_COVER_SIZE: Record<AiCoverAspect, { w: number; h: number }> = {
  "16:9": { w: 1024, h: 576 },
  "1:1": { w: 768, h: 768 },
};

/** Appended to every prompt (English — FLUX follows English best). */
export const AI_COVER_STYLE_SUFFIX =
  "music cover artwork, high quality digital art, no text, no letters, no words, no logos, no watermark";

export const AI_COVER_MESSAGES = {
  allFailed:
    "Generator okładek jest teraz przeciążony albo chwilowo niedostępny. Spróbuj ponownie za kilka minut albo wgraj własną grafikę.",
  promptRejected:
    "Tego opisu nie mogę użyć — bez treści dla dorosłych, przemocy, mowy nienawiści, prawdziwych osób, logo i marek. Opisz klimat, kolory albo scenę.",
  promptCheckDown: "Nie mogę teraz sprawdzić opisu. Spróbuj za chwilę.",
  promptTooShort: `Opisz okładkę (min. ${AI_COVER_PROMPT_MIN} znaki).`,
  promptTooLong: `Opis może mieć maks. ${AI_COVER_PROMPT_MAX} znaków.`,
} as const;
