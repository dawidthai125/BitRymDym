import "server-only";

import {
  BEAT_COVER_MODERATION_CATEGORIES,
  GEMINI_COVER_MODERATION_MODEL,
  GEMINI_COVER_MODERATION_TIMEOUT_MS,
  isCoverAiModerationEnabled,
} from "@/config/beat-covers";
import {
  coverModerationSafetyBlocked,
  coverModerationSkipped,
  decideCoverModeration,
  type CoverModerationOutcome,
} from "@/lib/beats/cover/cover-decision";

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

/** JSON property name for a category ("self-harm/instructions" → "self_harm_instructions"). */
const fieldOf = (category: string) => category.replace(/[/-]/g, "_");

/** Gemini block / finish reasons that mean "the model refused this image". */
const SAFETY_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "IMAGE_SAFETY", "SPII"]);

const PROMPT = [
  "You are a strict content moderator for album / beat cover images on a public music site (users of all ages).",
  "Score the image for each category from 0 (clearly absent) to 1 (clearly present):",
  "sexual (nudity, sexual acts or strongly sexualised content), sexual_minors (any sexualisation of minors),",
  "violence (weapons used against people, fighting, threats), violence_graphic (blood, gore, injuries, corpses),",
  "hate (hate symbols, slurs, extremist propaganda), self_harm (depiction or glorification of self-harm or suicide),",
  "self_harm_instructions (instructions or encouragement for self-harm), drugs (drug use, paraphernalia, glorification of illegal drugs).",
  "Ordinary artwork, photos, text logos, landscapes, abstract graphics and musicians score near 0.",
  "Set flagged=true if the cover should not be shown publicly without a human check.",
  "Answer with JSON only.",
].join(" ");

function requestBody(jpegBase64: string) {
  const properties: Record<string, unknown> = { flagged: { type: "BOOLEAN" } };
  for (const c of BEAT_COVER_MODERATION_CATEGORIES) properties[fieldOf(c)] = { type: "NUMBER" };
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: jpegBase64 } }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties, required: Object.keys(properties) },
    },
    // Only clearly harmful images trip Gemini's own block (→ reject); the
    // rest is decided by our thresholds on the returned scores.
    safetySettings: [
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
    ].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })),
  };
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

/** Pure: Gemini generateContent response → outcome (testable without network). */
export function coverOutcomeFromGemini(json: GeminiResponse): CoverModerationOutcome {
  const block = json.promptFeedback?.blockReason;
  if (block && SAFETY_REASONS.has(block)) return coverModerationSafetyBlocked(block);
  const cand = json.candidates?.[0];
  if (!cand) return coverModerationSkipped("error");
  if (cand.finishReason && SAFETY_REASONS.has(cand.finishReason)) {
    return coverModerationSafetyBlocked(cand.finishReason);
  }
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
  } catch {
    return coverModerationSkipped("error");
  }
  const scores: Record<string, number> = {};
  for (const c of BEAT_COVER_MODERATION_CATEGORIES) {
    const v = parsed[fieldOf(c)];
    if (typeof v !== "number" || !Number.isFinite(v)) return coverModerationSkipped("error");
    scores[c] = Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  }
  const flagged = parsed.flagged === true;
  return { provider: "gemini", flagged, scores, ...decideCoverModeration({ flagged, scores }) };
}

/**
 * Gemini vision on the (EXIF-stripped) JPEG preview of a cover. Feature-flagged:
 * without GEMINI_API_KEY, with BEAT_COVER_AI_MODERATION=0 or on any API error
 * the cover goes to the moderator queue (never auto-approved). The key is
 * never logged.
 */
export async function moderateCoverImage(
  jpegPreview: Buffer,
  deps: { env?: Env; fetchFn?: FetchFn } = {},
): Promise<CoverModerationOutcome> {
  const env = deps.env ?? process.env;
  if (!isCoverAiModerationEnabled(env)) return coverModerationSkipped("disabled");
  const apiKey = env.GEMINI_API_KEY!.trim();
  const model = (env.BEAT_COVER_GEMINI_MODEL || GEMINI_COVER_MODERATION_MODEL).trim();
  const fetchFn = deps.fetchFn ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_COVER_MODERATION_TIMEOUT_MS);
  try {
    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(jpegPreview.toString("base64"))),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error("[beat-cover] moderation HTTP", res.status);
      return coverModerationSkipped("error");
    }
    const outcome = coverOutcomeFromGemini((await res.json()) as GeminiResponse);
    if (outcome.skippedReason) console.error("[beat-cover] moderation: unusable Gemini response");
    return outcome;
  } catch (error) {
    console.error(
      "[beat-cover] moderation failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return coverModerationSkipped("error");
  } finally {
    clearTimeout(timer);
  }
}
