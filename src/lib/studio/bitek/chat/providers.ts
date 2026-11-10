import type { BitekChatTurn, BitekProviderId } from "./types";

/** Server-only LLM provider chain for BITEK. Keys come from server env only. */

export type BitekProviderErrorKind = "rate_limited" | "server" | "timeout" | "network" | "bad_response" | "client" | "wrong_lang";

export class BitekProviderError extends Error {
  constructor(
    readonly kind: BitekProviderErrorKind,
    readonly status?: number,
    /** Provider error code from the response body (e.g. "invalid_api_key"); never message text. */
    readonly code?: string,
  ) {
    super(`bitek provider ${kind}${status ? ` ${status}` : ""}`);
  }
}

export interface BitekLlmProvider {
  id: Exclude<BitekProviderId, "rules">;
  /** Model name, for diagnostics only. */
  model?: string;
  timeoutMs: number;
  /** Use the short system prompt (small self-hosted model). */
  compactPrompt?: boolean;
  complete(messages: { role: "system" | BitekChatTurn["role"]; content: string }[], signal: AbortSignal): Promise<string>;
}

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

/** OpenAI-compatible chat completions (Groq, Gemini's OpenAI endpoint, llama.cpp server, Ollama /v1). */
export function openAiCompatibleProvider(opts: {
  id: BitekLlmProvider["id"];
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
  fetchFn?: FetchFn;
}): BitekLlmProvider {
  const f = opts.fetchFn ?? fetch;
  return {
    id: opts.id,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
    async complete(messages, signal) {
      let res: Response;
      try {
        res = await f(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({
            model: opts.model,
            messages,
            temperature: opts.temperature ?? 0.4,
            max_tokens: opts.maxTokens ?? 400,
            ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
            ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
          }),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new BitekProviderError("timeout");
        void e;
        throw new BitekProviderError("network");
      }
      if (res.status === 429) throw new BitekProviderError("rate_limited", 429);
      if (res.status >= 500) throw new BitekProviderError("server", res.status);
      if (!res.ok) {
        let code: string | undefined;
        try {
          const body = (await res.json()) as unknown;
          const err = (Array.isArray(body) ? body[0] : body) as { error?: { code?: unknown; status?: unknown } } | null;
          const c = err?.error?.code ?? err?.error?.status;
          if (typeof c === "string" || typeof c === "number") code = String(c).replace(/[^\w.-]/g, "").slice(0, 40);
        } catch {
          /* ignore */
        }
        throw new BitekProviderError("client", res.status, code);
      }
      let json: { choices?: { message?: { content?: unknown } }[] };
      try {
        json = await res.json();
      } catch {
        throw new BitekProviderError("bad_response");
      }
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new BitekProviderError("bad_response");
      return content;
    },
  };
}

/**
 * Order: xAI → Groq → Gemini → E3 (self-hosted, via DB queue) → rules (caller).
 * One provider at a time. A provider is configured only when its env var is present.
 */
export function bitekProvidersFromEnv(
  env: Env = process.env,
  fetchFn?: FetchFn,
  opts: { e3Queue?: () => BitekLlmProvider } = {},
): BitekLlmProvider[] {
  const list: BitekLlmProvider[] = [];
  if (env.XAI_API_KEY) {
    list.push(
      openAiCompatibleProvider({
        id: "xai",
        baseUrl: "https://api.x.ai/v1",
        apiKey: env.XAI_API_KEY,
        model: env.BITEK_XAI_MODEL || "grok-4.7",
        maxTokens: 900,
        timeoutMs: 20000,
        jsonMode: true,
        fetchFn,
      }),
    );
  }
  if (env.GROQ_API_KEY) {
    list.push(
      openAiCompatibleProvider({
        id: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        // llama-3.3-70b-versatile became Enterprise-only on Groq (404 model_not_found, 2026-10).
        model: env.BITEK_GROQ_MODEL || "openai/gpt-oss-20b",
        reasoningEffort: "low",
        maxTokens: 900,
        timeoutMs: 8000,
        jsonMode: true,
        fetchFn,
      }),
    );
  }
  if (env.GEMINI_API_KEY) {
    list.push(
      openAiCompatibleProvider({
        id: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: env.GEMINI_API_KEY,
        // gemini-2.5-* is limited to legacy users (404 for new keys, 2026-10).
        model: env.BITEK_GEMINI_MODEL || "gemini-3.5-flash-lite",
        reasoningEffort: "low",
        maxTokens: 900,
        timeoutMs: 20000,
        jsonMode: true,
        fetchFn,
      }),
    );
  }
  // E3 = self-hosted model reached via the DB queue (bitek_llm_jobs), never directly.
  if ((env.BITEK_E3_QUEUE_ENABLED ?? "").trim().toLowerCase() === "true" && opts.e3Queue) {
    list.push(opts.e3Queue());
  }
  return list;
}

/**
 * Providers for lyrics: stronger models and a higher temperature than BITEK chat (creative text, longer output).
 * Order: xAI → Groq large → Gemini Flash → Gemini Flash-Lite → Groq small. A model that does not exist for the key just
 * fails fast and the next one is tried. Models are overridable by env.
 */
export function lyricsProvidersFromEnv(env: Env = process.env, fetchFn?: FetchFn): BitekLlmProvider[] {
  const list: BitekLlmProvider[] = [];
  const xai = env.XAI_API_KEY
    ? openAiCompatibleProvider({
        id: "xai",
        baseUrl: "https://api.x.ai/v1",
        apiKey: env.XAI_API_KEY,
        model: env.LYRICS_XAI_MODEL || env.BITEK_XAI_MODEL || "grok-4.7",
        maxTokens: 2200,
        temperature: 0.85,
        timeoutMs: 20000,
        jsonMode: false,
        fetchFn,
      })
    : null;
  const groq = (model: string, effort: "low" | "medium" | "high") =>
    env.GROQ_API_KEY
      ? openAiCompatibleProvider({ id: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: env.GROQ_API_KEY, model, reasoningEffort: effort, maxTokens: 2200, temperature: 0.85, timeoutMs: 20000, jsonMode: false, fetchFn })
      : null;
  const gemini = (model: string) =>
    env.GEMINI_API_KEY
      ? openAiCompatibleProvider({ id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: env.GEMINI_API_KEY, model, reasoningEffort: "low", maxTokens: 2200, temperature: 0.9, timeoutMs: 20000, jsonMode: true, fetchFn })
      : null;
  for (const p of [
    xai,
    groq(env.LYRICS_GROQ_MODEL || "openai/gpt-oss-120b", "medium"),
    gemini(env.LYRICS_GEMINI_MODEL || "gemini-3.5-flash"),
    gemini(env.BITEK_GEMINI_MODEL || "gemini-3.5-flash-lite"),
    groq(env.BITEK_GROQ_MODEL || "openai/gpt-oss-20b", "low"),
  ]) {
    if (p) list.push(p);
  }
  return list;
}
