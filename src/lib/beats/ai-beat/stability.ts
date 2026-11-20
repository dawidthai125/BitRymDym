/**
 * Stable Audio 3 text-to-audio. The call is async: start returns an id,
 * then the result endpoint is polled until the wav is ready.
 * Docs: https://docs.stability.ai/api-reference/stable-audio/text-to-audio
 */

export const STABLE_AUDIO_START_URL =
  "https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio";

export const STABLE_AUDIO_MODEL = "stable-audio-3";

/**
 * Sampling options of stable-audio-3 (docs.stability.ai text-to-audio): seed 0 = random,
 * cfg_scale 1–25 (default 1; higher follows the prompt more strictly). steps is already at its max (8).
 */
export const STABLE_AUDIO_SEED_MAX = 4_294_967_294;
export const STABLE_AUDIO_CFG_MIN = 1;
export const STABLE_AUDIO_CFG_MAX = 25;

export type StableAudioSampling = { seed: number | null; cfgScale: number | null };

/** Untrusted request values → safe sampling options (null = model default). */
export function normalizeStableAudioSampling(seed: unknown, cfgScale: unknown): StableAudioSampling {
  const s = typeof seed === "number" && Number.isInteger(seed) && seed >= 1 && seed <= STABLE_AUDIO_SEED_MAX ? seed : null;
  const c =
    typeof cfgScale === "number" && Number.isFinite(cfgScale) && cfgScale >= STABLE_AUDIO_CFG_MIN && cfgScale <= STABLE_AUDIO_CFG_MAX
      ? Math.round(cfgScale * 10) / 10
      : null;
  return { seed: s, cfgScale: c };
}

/** A fresh non-zero seed, so a later revision can reuse it and change only the prompt. */
export function randomStableAudioSeed(): number {
  return 1 + Math.floor(Math.random() * (STABLE_AUDIO_SEED_MAX - 1));
}

const GENERATION_ID = /^[a-f0-9]{64}$/;

export function isStableAudioGenerationId(value: unknown): value is string {
  return typeof value === "string" && GENERATION_ID.test(value);
}

export function stableAudioResultUrl(id: string): string {
  return `https://api.stability.ai/v2beta/audio/results/${id}`;
}

export type StabilityStart =
  | { ok: true; id: string }
  | { ok: false; message: string };

export function stabilityErrorMessage(status: number, name?: string): string {
  if (status === 401) return "Klucz Stability AI został odrzucony.";
  if (status === 402) return "Brak kredytów Stability AI.";
  if (status === 403 || name === "content_moderation") {
    return "Opis został odrzucony przez filtr modelu. Zmień go i spróbuj jeszcze raz.";
  }
  if (status === 422 || name === "invalid_language") {
    return "Model przyjął tylko angielski opis. Spróbuj jeszcze raz.";
  }
  if (name === "copyrighted_content") {
    return "Opis wygląda na cudzy utwór. Opisz własny bit, bez nazw artystów i tytułów.";
  }
  if (status === 429) return "Za dużo zapytań do modelu. Odczekaj minutę.";
  return "Nie udało się wygenerować bitu. Spróbuj jeszcze raz.";
}

export function parseStabilityStart(status: number, body: unknown): StabilityStart {
  if (status === 202 && body && typeof body === "object") {
    const id = (body as { id?: unknown }).id;
    if (isStableAudioGenerationId(id)) return { ok: true, id };
  }
  const name =
    body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name
      : undefined;
  return { ok: false, message: stabilityErrorMessage(status, name) };
}

export type AudioFileKind = "audio/wav" | "audio/mpeg";

export function audioKindFromHeader(header: string | null): AudioFileKind | null {
  const base = (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/wav" || base === "audio/x-wav" || base === "audio/wave") {
    return "audio/wav";
  }
  if (base === "audio/mpeg" || base === "audio/mp3") return "audio/mpeg";
  return null;
}

export function sniffAudioKind(bytes: Uint8Array): AudioFileKind | null {
  if (bytes.byteLength >= 12) {
    const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    const wave = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (riff === "RIFF" && wave === "WAVE") return "audio/wav";
  }
  if (bytes.byteLength >= 3) {
    const id3 = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
    if (id3 === "ID3") return "audio/mpeg";
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  return null;
}

export type StabilityPoll =
  | { status: "pending" }
  | { status: "ready"; bytes: Uint8Array; contentType: AudioFileKind }
  | { status: "error"; message: string };

const MIN_AUDIO_BYTES = 1000;

export function parseStabilityAudio(
  status: number,
  headerContentType: string | null,
  bytes: Uint8Array,
  errorName?: string,
): StabilityPoll {
  if (status === 202) return { status: "pending" };
  if (status === 200) {
    const contentType = audioKindFromHeader(headerContentType) ?? sniffAudioKind(bytes);
    if (!contentType || bytes.byteLength < MIN_AUDIO_BYTES) {
      return { status: "error", message: "Model zwrócił pusty plik. Spróbuj jeszcze raz." };
    }
    return { status: "ready", bytes, contentType };
  }
  return { status: "error", message: stabilityErrorMessage(status, errorName) };
}
