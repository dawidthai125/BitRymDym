import { sanitizeBeatOpis, sanitizeBeatStyle } from "@/lib/beats/ai-beat/prompt";
import { BeatRequestError } from "@/lib/beats/request-error";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-4-hydrogen";
const TIMEOUT_MS = 55_000;

const INSTRUCTION = [
  "You are a hip-hop beat producer writing a Stable Audio prompt from what you HEAR.",
  "Listen to the instrumental / rhythmic bed of this public YouTube video.",
  "Focus on the clearest loop or chorus bed, not the cold open, outro, ads or brand sting.",
  "Ignore vocals, lyrics, speech, ad-libs and talking — describe only the beat under them.",
  "Goal: recreate a similar ORIGINAL instrumental hip-hop beat, not a cover or clone of a named track.",
  "Reply with JSON only.",
  "style: 2 to 6 Polish words naming the lane (boom bap, trap, lo-fi, drill, phonk, etc.).",
  "opis: two to four Polish catalog sentences — drums, bass, melody, mood, space for a vocal.",
  "drums: 1–2 dense English sentences. Name kick pattern feel (boom / syncopated / four-on-floor), snare/clap placement, hi-hat speed (straight 8ths, 16ths, triplets, rolls), swing vs hard quantize, pocket (behind / on / ahead of the beat).",
  "bass: 1–2 dense English sentences. Instrument (long 808 / short 808 slides / synth sub / upright / electric), note length, glide or static, how it locks with the kick.",
  "melody: 1–2 dense English sentences. Concrete instruments and processing (dusty piano, muted guitar, filtered pad, bell pluck, chopped sample texture), harmony (minor / major / modal), motif length, sparse vs layered.",
  "mood: 1–2 dense English sentences. Energy arc, warmth vs cold, tension, grit or polish — tied to audible texture (vinyl dust, tape hiss, clean digital, distorted edges), not mood words alone.",
  "arrangement: 1–2 dense English sentences. Loop vs sections, drops or filter rides, how much empty midrange is left for a rapper.",
  "bpm: integer 60–180 if you can hear it, else null. Prefer a real estimate over null when the pulse is clear.",
  "English fields become the Stable Audio prompt. Prefer production nouns and verbs over vague adjectives.",
  "BAD (too vague): dark atmospheric beat with hard drums and deep bass.",
  "GOOD: dusty swung boom-bap drums, snappy snare on 2 and 4, soft triplet hats; long minor-key 808 under a sparse muted piano motif; warm night mood with vinyl crackle and open space for a verse.",
  "Every English field must include at least one concrete sonic detail (instrument, pattern, processing or pocket). Reject empty mood words alone.",
  "Do not name any artist, song, channel, label or producer.",
  "Do not quote lyrics. Do not include the URL or video id.",
  'If there is no music, set style to "hip-hop instrumentalny" and say in every field that the clip has no beat.',
].join(" ");

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type YoutubeStyleDeps = {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  /** Tests only. The route always checks the admin session. */
  skipAuth?: boolean;
};

export type BeatStyleFromYouTube = {
  /** Polish catalog blurb. */
  opis: string;
  style: string;
  /** English Stable Audio producer brief. */
  prompt: string;
  bpmHint: number | null;
};

/**
 * Public watch URL only. Returns https://www.youtube.com/watch?v=ID
 * and drops playlists, timestamps and other query params.
 * Does not fetch the page.
 */
export function parseYouTubeWatchUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  const id = videoIdFromHost(host, url);
  if (!id || !VIDEO_ID.test(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

function videoIdFromHost(host: string, url: URL): string | null {
  if (host === "youtu.be") {
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length === 1 ? parts[0] : null;
  }
  if (host !== "youtube.com" && host !== "www.youtube.com" && host !== "m.youtube.com") {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "watch") return url.searchParams.get("v");
  if (parts[0] === "shorts" && parts.length === 2) return parts[1];
  return null;
}

export async function describeBeatStyleFromYouTube(
  url: string,
  deps: YoutubeStyleDeps = {},
): Promise<BeatStyleFromYouTube> {
  const canonical = parseYouTubeWatchUrl(url);
  if (!canonical) {
    throw new BeatRequestError(
      "Wklej publiczny link YouTube (watch, youtu.be albo shorts). Inne strony z odtwarzaczem nie działają.",
    );
  }
  if (!deps.skipAuth) {
    const { requireAdminGenerator } = await import("@/lib/beats/ai-beat/generate");
    await requireAdminGenerator();
  }

  const env = deps.env ?? process.env;
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new BeatRequestError("Brak klucza Gemini na serwerze.");
  const model = (env.BEAT_STYLE_GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const videoId = canonical.slice(-11);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await (deps.fetchFn ?? fetch)(INTERACTIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model,
        input: [
          { type: "video", uri: canonical },
          { type: "text", text: INSTRUCTION },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              style: { type: "string" },
              opis: { type: "string" },
              drums: { type: "string" },
              bass: { type: "string" },
              melody: { type: "string" },
              mood: { type: "string" },
              arrangement: { type: "string" },
              bpm: { type: ["integer", "null"] },
            },
            required: ["style", "opis", "drums", "bass", "melody", "mood", "arrangement"],
          },
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[beat-style] gemini HTTP", res.status);
      if (res.status === 400 && /private|unlisted|not found|unavailable/i.test(detail)) {
        throw new BeatRequestError("Ten film musi być publiczny na YouTube.");
      }
      throw new BeatRequestError("Nie udało się opisać stylu. Sprawdź link i spróbuj jeszcze raz.");
    }
    const parsed = parseStylePayload(textFromGemini(await res.json()), videoId);
    if (!parsed) throw new BeatRequestError("Nie udało się opisać stylu. Spróbuj innego filmu.");
    return parsed;
  } catch (error) {
    if (error instanceof BeatRequestError) throw error;
    console.error(
      "[beat-style] gemini failed:",
      error instanceof Error ? error.name : "unknown",
    );
    throw new BeatRequestError("Nie udało się opisać stylu. Sprawdź link i spróbuj jeszcze raz.");
  } finally {
    clearTimeout(timer);
  }
}

function textFromGemini(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const row = body as {
    output_text?: unknown;
    outputs?: unknown;
    steps?: unknown;
    candidates?: unknown;
  };
  if (typeof row.output_text === "string" && row.output_text.trim()) return row.output_text;
  const fromSteps = textFromSteps(row.steps);
  if (fromSteps) return fromSteps;
  if (Array.isArray(row.outputs)) {
    for (const item of row.outputs) {
      const text = textFromPart(item);
      if (text) return text;
    }
  }
  if (Array.isArray(row.candidates)) {
    const first = row.candidates[0] as
      | { content?: { parts?: Array<{ text?: unknown }> } }
      | undefined;
    const parts = first?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
      if (text.trim()) return text;
    }
  }
  return null;
}

/** Interactions API puts the answer in steps[].content, after a thought step. */
function textFromSteps(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  const chunks: string[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    if ((step as { type?: unknown }).type === "thought") continue;
    const content = (step as { content?: unknown }).content;
    if (typeof content === "string" && content.trim()) chunks.push(content);
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = textFromPart(part);
      if (text) chunks.push(text);
    }
  }
  const joined = chunks.join("").trim();
  return joined || null;
}

function textFromPart(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const row = part as { text?: unknown; content?: unknown };
  if (typeof row.text === "string" && row.text.trim()) return row.text;
  if (typeof row.content === "string" && row.content.trim()) return row.content;
  return null;
}

function parseStylePayload(raw: string | null, videoId: string): BeatStyleFromYouTube | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as {
    style?: unknown;
    opis?: unknown;
    drums?: unknown;
    bass?: unknown;
    melody?: unknown;
    mood?: unknown;
    arrangement?: unknown;
    bpm?: unknown;
  };
  const style = sanitizeBeatStyle(scrubEcho(stringOf(row.style), videoId));
  const prompt = composeProducerOpis(row, videoId);
  if (prompt.length < 12) return null;
  const opis =
    sanitizeBeatOpis(scrubEcho(stringOf(row.opis), videoId)) ??
    sanitizeBeatOpis(prompt);
  if (!opis) return null;
  return {
    style,
    opis,
    prompt: prompt.slice(0, 800),
    bpmHint: bpmHintOf(row.bpm),
  };
}

/** Joins structured producer fields; falls back to a legacy `opis` string. */
export function composeProducerOpis(
  row: {
    opis?: unknown;
    drums?: unknown;
    bass?: unknown;
    melody?: unknown;
    mood?: unknown;
    arrangement?: unknown;
  },
  videoId = "",
): string {
  const parts = [row.drums, row.bass, row.melody, row.mood, row.arrangement]
    .map((part) => scrubEcho(stringOf(part), videoId))
    .filter((part) => part.length >= 8);
  if (parts.length >= 2) return parts.join(" ").replace(/\s+/g, " ").trim();
  return scrubEcho(stringOf(row.opis), videoId);
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function scrubEcho(text: string, videoId: string): string {
  return text
    .split(videoId).join("")
    .replace(/youtu\.be/gi, "")
    .replace(/youtube/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bpmHintOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 60 || n > 180) return null;
  return n;
}
