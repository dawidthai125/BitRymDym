/**
 * Prompt screening + English rewrite via Groq (OpenAI-compatible):
 *  - openai/gpt-oss-safeguard-20b classifies the prompt against our cover policy (JSON),
 *  - openai/gpt-oss-20b rewrites it into a short English visual prompt (FLUX follows English best).
 * Both run in parallel. The safeguard is fail-closed (Groq down → refuse, never generate
 * unchecked); the rewrite is best-effort (falls back to the user's text). The rewrite is
 * re-checked by the local rules.
 */
import { AI_COVER_STYLE_SUFFIX } from "./config";
import { matchPromptRule } from "./prompt-rules";

type FetchFn = typeof fetch;
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
export const SAFEGUARD_MODEL = "openai/gpt-oss-safeguard-20b";
export const REWRITE_MODEL = "openai/gpt-oss-20b";

export const SAFEGUARD_POLICY = `You classify prompts for an AI image generator that makes music cover art (album / single / YouTube video images). Prompts may be Polish or English.
VIOLATION (1) if the request asks for or clearly implies: sexual, nude, erotic or suggestive content; hateful, extremist or discriminatory content or symbols; graphic violence, gore, self-harm; any real, identifiable person (celebrities, artists, politicians, religious figures, any named person) or their likeness; brand logos, trademarks, company names or copyrighted characters / franchises; minors in any sexual or risky context; promotion of illegal drugs or weapons; text meant to deceive (fake official documents).
SAFE (0): abstract art, landscapes, cities, objects, animals, moods, colors, music genres, fictional unnamed people in non-sexual scenes.
If unsure, answer 1.
Return JSON only: {"violation":0|1,"category":"none|sexual|hate|violence|real_person|logo_brand|minors|drugs|other","rationale":"max 10 words"}`;

const REWRITE_SYSTEM = `Rewrite the user's idea (Polish or English) as one concise English prompt (max 60 words) for an AI image generator creating music cover art. Describe only visuals: subject, scene, style, colors, lighting, composition. Never add text, letters, logos, brands or real people. Return JSON only: {"prompt":"..."}`;

export type ScreenVerdict =
  | { ok: true; finalPrompt: string; rewritten: boolean }
  | { ok: false; reason: "policy"; category: string }
  | { ok: false; reason: "unavailable" };

async function groqJson(f: FetchFn, key: string, model: string, system: string, user: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await f(GROQ, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: 400, reasoning_effort: "low", response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const c = j.choices?.[0]?.message?.content;
    if (typeof c !== "string") return null;
    const v = JSON.parse(c) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function buildFinalPrompt(visual: string): string {
  return `${visual.replace(/\s+/g, " ").trim().replace(/[.,;\s]+$/, "")}, ${AI_COVER_STYLE_SUFFIX}`;
}

export async function screenAiCoverPrompt(prompt: string, opts: { groqKey?: string; fetchFn?: FetchFn; timeoutMs?: number }): Promise<ScreenVerdict> {
  if (!opts.groqKey) return { ok: false, reason: "unavailable" };
  const f = opts.fetchFn ?? fetch;
  const t = opts.timeoutMs ?? 8000;
  const [verdict, rewrite] = await Promise.all([
    groqJson(f, opts.groqKey, SAFEGUARD_MODEL, SAFEGUARD_POLICY, prompt, t),
    groqJson(f, opts.groqKey, REWRITE_MODEL, REWRITE_SYSTEM, prompt, t),
  ]);
  const v = verdict?.violation;
  if (v !== 0 && v !== 1 && v !== "0" && v !== "1") return { ok: false, reason: "unavailable" };
  if (Number(v) === 1) return { ok: false, reason: "policy", category: typeof verdict?.category === "string" ? verdict.category.slice(0, 20) : "other" };
  const en = typeof rewrite?.prompt === "string" ? rewrite.prompt.trim().slice(0, 600) : "";
  const useEn = en.length >= 3 && !matchPromptRule(en);
  return { ok: true, finalPrompt: buildFinalPrompt(useEn ? en : prompt), rewritten: useEn };
}
