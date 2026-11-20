import {
  BEAT_PRODUCTION_PATTERN,
  clipBeatDescription,
  sanitizeBeatOpis,
  sanitizeBeatStyle,
} from "@/lib/beats/ai-beat/prompt";
import {
  keyForBrief,
  resolveReferenceTempo,
  type ReferenceMeasure,
} from "@/lib/beats/ai-beat/reference-tempo";
import { BeatRequestError } from "@/lib/beats/request-error";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
/** Flash preview accepts YouTube URI and stays up when hydrogen is capacity-limited. */
const DEFAULT_MODEL = "gemini-3-flash-preview";
/** Long videos (5+ min) need more than 55 s. Route maxDuration is 300. */
const TIMEOUT_MS = 170_000;
const BRIEF_MAX = 800;
/** Stable Audio drifts dark and bass-heavy; say the tonal balance out loud. */
/** Opens every brief so Stable Audio stays in hip-hop even when the source has a live band. */
export const GENRE_ANCHOR =
  "Hip-hop rap instrumental built on programmed drums and 808-style bass, with sampled and chopped loops, no live band.";
/** Closes every brief. */
export const GENRE_NEGATIVE = "Not rock, not metal, not a live band.";

/**
 * Source videos often have real guitars and drum kits; described literally, Stable Audio
 * renders rock. Swap those words for the hip-hop way of saying it.
 */
export function hipHopGuard(text: string): string {
  return text
    .replace(/\b(distorted|overdriven|fuzz(?:ed|y)?|crunchy|heavy metal|metal|shredding|power chords?)\b/gi, "")
    .replace(/\bpalm[- ]muted\b/gi, "muted")
    .replace(/\b(chugging|chug)\b/gi, "rhythmic")
    .replace(/\belectric guitar\b/gi, "sampled guitar")
    .replace(/\bguitar riffs?\b/gi, "sampled guitar loop")
    .replace(/\briffs?\b/gi, "loop")
    .replace(/\b(live|acoustic) (drums?|drum kit)\b/gi, "programmed drums")
    .replace(/\bdrum kit\b/gi, "programmed drums")
    .replace(/\brock\b/gi, "hip-hop")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

export const MIX_BALANCE =
  "Bright crisp top end, hi-hats and lead instruments forward, tight high-passed low end, even loudness without quiet gaps.";

const BRIEF_TEMPERATURE = 0.1;

const RESPONSE_FORMAT = {
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
      key: { type: "string" },
      bpm: { type: ["integer", "null"] },
    },
    required: ["style", "opis", "drums", "bass", "melody", "mood", "arrangement"],
  },
};

const INSTRUCTION = [
  "You are a hip-hop beat producer writing a Stable Audio prompt from what you HEAR.",
  "Listen to the instrumental / rhythmic bed of this public YouTube video.",
  "Focus on the clearest loop or chorus bed, not the cold open, outro, ads or brand sting.",
  "Ignore vocals, lyrics, speech, ad-libs and talking — describe only the beat under them.",
  "Goal: recreate a similar ORIGINAL instrumental hip-hop beat, not a cover or clone of a named track.",
  "Reply with JSON only.",
  "style: 2 to 6 Polish words naming the lane (boom bap, trap, lo-fi, drill, phonk, etc.).",
  "opis: one or two short Polish catalog sentences — drums, bass, melody, mood, vocal space.",
  "drums: ONE English sentence — kick and snare character and placement, hat pattern and subdivision (e.g. 1/16 rolls, triplets), swing or quantize, pocket.",
  "bass: ONE English sentence — 808/synth/upright, glide or staccato, note length, how it locks with the kick; make it an active melodic line that moves with the chords, not only root notes.",
  "melody: ONE English sentence — exact lead instrument (e.g. felt piano, detuned saw lead, plucked sample) plus one supporting layer (strings, pads, choir), minor/major, repeating motif.",
  "GENRE RULE: the result must be a hip-hop / rap instrumental, never rock. If the original has a live guitar or band, describe that part as a sampled, filtered or chopped loop on top of programmed drums and an 808 or synth bass. Never write distorted, riff, palm-muted, power chords, metal, live drums or rock. For aggression use harder programmed drums, faster hats and a tighter 808, not guitar distortion.",
  "mood: ONE English sentence — energy 1 to 10 and texture (vinyl, tape, clean digital, grit, reverb size).",
  "arrangement: ONE English sentence — short intro, main loop, one 4 to 8 bar breakdown where drums or bass drop out, return with an added layer; never more than 8 bars of near silence; space for a rapper.",
  "key: musical key as tonic plus major or minor (e.g. D minor); listen to the bass and the chords; empty string only if there is no pitched music.",
  "bpm: integer 60–180, count it carefully from the drums, else null.",
  "Match the original's groove, tempo, key, sound palette and energy as closely as possible while writing original music. Never describe it vaguely.",
  "Hard limit: the five English fields together must stay under 700 characters. Concrete and specific beats vague and long.",
  "BAD (too vague): dark atmospheric beat with hard drums and deep bass.",
  "BAD (too long): multi-clause essays, repeated adjectives, or more than one sentence per English field.",
  "GOOD: Warm organic boom bap drums with light swing, punchy kick and a crisp snare with short room reverb, steady 1/8 hi-hats. Active melodic bass with frequent note changes and slides following the piano. Melancholic felt piano motif layered with lush cinematic strings and soft pads. Cinematic energy 7/10, gritty vinyl texture, bright crisp top end and wide hall reverb. Short intro, main loop, an 8-bar breakdown without drums, then the return with an added string layer, room for a verse.",
  `Unless the original clearly does something else, follow the house pattern. ${BEAT_PRODUCTION_PATTERN}`,
  "Every English field needs one concrete sonic detail. No artist, song, channel, label, producer, lyrics, URL or video id.",
  'If there is no music, set style to "hip-hop instrumentalny" and say in every field that the clip has no beat.',
].join(" ");

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type YoutubeStyleDeps = {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  /** Tests only. The route always checks the admin session. */
  skipAuth?: boolean;
  /** Overrides the default Gemini wait, so a caller can keep a total time budget. */
  timeoutMs?: number;
  /** Tempo and key measured from the uploaded reference track; they replace Gemini's guess. */
  measured?: ReferenceMeasure | null;
};

export type BeatStyleFromYouTube = {
  /** Polish catalog blurb. */
  opis: string;
  style: string;
  /** English Stable Audio producer brief. */
  prompt: string;
  bpmHint: number | null;
  /** True when bpmHint and the key come from the measured file, not from Gemini. */
  measured?: boolean;
};

/** Tells Gemini the measured facts so the sound description fits the real tempo and key. */
export function measuredInstruction(m: ReferenceMeasure | null | undefined): string {
  if (!m) return "";
  const parts: string[] = [];
  if (m.sure && m.bpm != null) parts.push(`tempo ${m.bpm} BPM`);
  else if (m.candidates.length) parts.push(`tempo is one of ${m.candidates.join(" / ")} BPM (pick the one that matches the groove)`);
  if (m.key) parts.push(`key ${keyForBrief(m.key)}`);
  if (!parts.length) return "";
  return `MEASURED from the original audio file: ${parts.join(", ")}. Use these values for bpm and key; do not estimate them yourself. Describe drums and hat subdivision so they sit at this tempo.`;
}

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

export type YoutubeRevision = {
  /** The English brief that produced the beat the user did not like. */
  previousBrief: string;
  /** What the user said is wrong, in their words. */
  note: string;
  /** The generated beat, uploaded to the Gemini Files API. Gemini compares it with the video. */
  audio?: { uri: string; mimeType: string };
};

function revisionInstruction(r: YoutubeRevision): string {
  const note = r.note.replace(/\s+/g, " ").trim().slice(0, 400);
  const prev = r.previousBrief.replace(/\s+/g, " ").trim().slice(0, 800);
  return [
    "REVISION. A beat was generated from the brief below and the listener says it is too far from the video.",
    `Previous brief: ${prev}`,
    `Listener feedback: ${note}`,
    "Listen to the video again, find what the previous brief got wrong or left out, and rewrite every field so the next generation sounds closer to the video.",
    "Apply the feedback literally (more energy = faster hats, harder programmed drums, tighter 808, brighter lead, higher energy score) but keep it a hip-hop instrumental: aggressive never means distorted guitars or rock.",
    "If the listener says dark, dull, muddy, bass-heavy or lacking top, make the mood field name the top end explicitly (bright, crisp, airy hats and lead forward) and keep the bass tight and high-passed.",
    ...(r.audio
      ? [
          "The audio input is the GENERATED beat made from the previous brief (the first minute or so).",
          "Compare it with the video: tempo feel, key, kick/snare/hat pattern, bass sound, lead or riff, energy, top end versus low end, loudness. Decide what the generated beat is missing or has too much of.",
          "Then write the new brief so the next generation closes exactly those gaps. Say what to add or change in concrete production words; do not describe the generated audio itself.",
          "TARGET: the next beat must score at least 9/10 against the video's instrumental on each of tempo, drums/groove, bass, melody/instruments, mood/energy and mix/texture. Score the generated beat silently on each; every one below 9 must change the matching field (drums, bass, melody, mood, arrangement) with a concrete production fix, e.g. bass rhythm and note movement, which instruments and layers, drum sound and swing, reverb and saturation. Keep what already scores 9 or more.",
          "Stay an original instrumental in the same style: match the sound and feel, never the original melody note for note.",
        ]
      : []),
  ].join(" ");
}

export async function describeBeatStyleFromYouTube(
  url: string,
  deps: YoutubeStyleDeps = {},
  revision?: YoutubeRevision,
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
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
  try {
    const requestBody = {
      model,
      input: [
        { type: "video", uri: canonical },
        ...(revision?.audio
          ? [{ type: "audio", uri: revision.audio.uri, mime_type: revision.audio.mimeType }]
          : []),
        {
          type: "text",
          text: [INSTRUCTION, measuredInstruction(deps.measured), revision ? revisionInstruction(revision) : ""]
            .filter(Boolean)
            .join(" "),
        },
      ],
      response_format: RESPONSE_FORMAT,
    };
    const send = (extra: Record<string, unknown>) =>
      (deps.fetchFn ?? fetch)(INTERACTIONS_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
          "Api-Revision": "2026-05-20",
        },
        body: JSON.stringify({ ...requestBody, ...extra }),
      });
    // Low temperature: the same link should give nearly the same brief.
    let res = await send({ generation_config: { temperature: BRIEF_TEMPERATURE } });
    if (res.status === 400) {
      const detail = await res.clone().text().catch(() => "");
      if (!/private|unlisted|not found|unavailable/i.test(detail)) res = await send({});
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[beat-style] gemini HTTP", res.status);
      if (res.status === 400 && /private|unlisted|not found|unavailable/i.test(detail)) {
        throw new BeatRequestError("Ten film musi być publiczny na YouTube.");
      }
      throw new BeatRequestError("Nie udało się opisać stylu. Sprawdź link i spróbuj jeszcze raz.");
    }
    const parsed = parseStylePayload(textFromGemini(await res.json()), videoId, deps.measured ?? null);
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

export function textFromGemini(body: unknown): string | null {
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

function parseStylePayload(
  raw: string | null,
  videoId: string,
  measured: ReferenceMeasure | null = null,
): BeatStyleFromYouTube | null {
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
    key?: unknown;
    bpm?: unknown;
  };
  const style = sanitizeBeatStyle(scrubEcho(stringOf(row.style), videoId));
  const bpm = resolveReferenceTempo(measured, bpmHintOf(row.bpm));
  const keyText = measured?.key ? keyForBrief(measured.key) : scrubEcho(stringOf(row.key), videoId).slice(0, 30);
  const head = [bpm ? `${bpm} BPM.` : "", keyText ? `Key: ${keyText}.` : ""].filter(Boolean).join(" ");
  // One tempo in the whole brief: a field that names another BPM would pull Stable Audio off it.
  const composed = composeProducerOpis(row, videoId);
  const body = bpm != null ? composed.replace(/\b\d{2,3}\s*BPM\b/gi, `${bpm} BPM`) : composed;
  const withHead = body && head ? `${head} ${body}` : body;
  // Fit the balance clause inside the cap so it is never clipped away.
  const tail = `${MIX_BALANCE} ${GENRE_NEGATIVE}`;
  const room = BRIEF_MAX - tail.length - GENRE_ANCHOR.length - 2;
  const prompt = withHead
    ? `${GENRE_ANCHOR} ${clipBeatDescription(hipHopGuard(withHead), room)} ${tail}`
    : withHead;
  if (prompt.length < 12) return null;
  const opis =
    sanitizeBeatOpis(scrubEcho(stringOf(row.opis), videoId)) ??
    sanitizeBeatOpis(prompt);
  if (!opis) return null;
  return {
    style,
    opis,
    prompt,
    bpmHint: bpm,
    ...(measured ? { measured: true } : {}),
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
