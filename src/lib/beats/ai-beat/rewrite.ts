import {
  GENERATED_STYLE_DEFAULT,
  descriptionNeedsTranslation,
  fallbackEnglishPrompt,
  parseBeatRewrite,
  sanitizeBeatOpis,
  sanitizeBeatStyle,
  withInstrumentalClause,
} from "@/lib/beats/ai-beat/prompt";

const REWRITE_URL = "https://api.x.ai/v1/chat/completions";

const SYSTEM = [
  "You prepare one instrumental hip-hop beat for Stable Audio.",
  "Reply with JSON only: {\"title\":\"...\",\"prompt\":\"...\",\"style\":\"...\",\"opis\":\"...\"}.",
  "title: a short original Polish name, 2 to 6 words. No artist names, no existing song titles.",
  "style: Polish, 2 to 6 words, the beat's style. No artist or song names.",
  "opis: one or two Polish sentences about mood, drums, bass and melody. No artist or song names.",
  "prompt: English only. Drums, bass and melody. No vocals, no singing, no rap, no speech, no lyrics.",
  "Do not name any artist, song, album, label or producer.",
  "If the user names one, drop the name and keep only the musical idea.",
  "When a BPM is given, include that exact number and the word BPM.",
].join(" ");

export type RewrittenBeatPrompt = {
  title: string;
  prompt: string;
  style: string;
  opis: string;
};

function userOpis(description: string): string {
  return description.replace(/\s+/g, " ").trim().slice(0, 500);
}

function englishFallback(description: string, bpm: number | null): RewrittenBeatPrompt {
  return {
    title: "Bit BitRymDym",
    prompt: fallbackEnglishPrompt(description, bpm),
    style: GENERATED_STYLE_DEFAULT,
    opis: userOpis(description),
  };
}

export type RewriteDeps = {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

export async function rewriteBeatPrompt(
  description: string,
  bpm: number | null,
  deps: RewriteDeps = {},
): Promise<RewrittenBeatPrompt> {
  const key = deps.apiKey?.trim();
  if (!key) {
    if (descriptionNeedsTranslation(description)) {
      throw new Error("translate");
    }
    return englishFallback(description, bpm);
  }

  const tempo = bpm ? `Requested tempo: ${bpm} BPM.` : "Choose a natural hip-hop tempo.";
  const controller = new AbortController();
  // grok-4.7 defaults to high reasoning (~15s+); low keeps this under the route budget.
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await (deps.fetchFn ?? fetch)(REWRITE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deps.model || "grok-4.7",
        temperature: 0.4,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${tempo}\nDescription:\n${description}` },
        ],
      }),
    });
    if (!res.ok) throw new Error("translate");
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? parseBeatRewrite(content) : null;
    if (!parsed) throw new Error("translate");
    const prompt = bpm && !promptHasBpm(parsed.prompt, bpm)
      ? withInstrumentalClause(`${parsed.prompt} ${bpm} BPM.`)
      : parsed.prompt;
    return {
      title: parsed.title,
      prompt,
      style: sanitizeBeatStyle(parsed.style),
      opis: sanitizeBeatOpis(parsed.opis) ?? userOpis(description),
    };
  } catch (error) {
    if (!descriptionNeedsTranslation(description)) {
      return englishFallback(description, bpm);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function promptHasBpm(prompt: string, bpm: number): boolean {
  return new RegExp(`\\b${bpm}\\s*BPM\\b`, "i").test(prompt);
}
