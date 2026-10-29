import type { BitekChatTurn, BitekProviderId } from "./types";

/** Server-only LLM provider chain for BITEK. Keys come from server env only. */

export type BitekProviderErrorKind = "rate_limited" | "server" | "timeout" | "network" | "bad_response" | "client";

export class BitekProviderError extends Error {
  constructor(
    readonly kind: BitekProviderErrorKind,
    readonly status?: number,
  ) {
    super(`bitek provider ${kind}${status ? ` ${status}` : ""}`);
  }
}

export interface BitekLlmProvider {
  id: Exclude<BitekProviderId, "rules">;
  timeoutMs: number;
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
  fetchFn?: FetchFn;
}): BitekLlmProvider {
  const f = opts.fetchFn ?? fetch;
  return {
    id: opts.id,
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
            temperature: 0.4,
            max_tokens: 400,
            ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
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
      if (!res.ok) throw new BitekProviderError("client", res.status);
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
 * Order: Groq → Gemini Flash → E3 (self-hosted) → rules (caller).
 * A provider is configured only when its env vars are present.
 */
export function bitekProvidersFromEnv(env: Env = process.env, fetchFn?: FetchFn): BitekLlmProvider[] {
  const list: BitekLlmProvider[] = [];
  if (env.GROQ_API_KEY) {
    list.push(
      openAiCompatibleProvider({
        id: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: env.BITEK_GROQ_MODEL || "llama-3.3-70b-versatile",
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
        model: env.BITEK_GEMINI_MODEL || "gemini-2.5-flash",
        timeoutMs: 10000,
        jsonMode: true,
        fetchFn,
      }),
    );
  }
  if (env.BITEK_E3_URL && env.BITEK_E3_TOKEN) {
    list.push(
      openAiCompatibleProvider({
        id: "e3",
        baseUrl: env.BITEK_E3_URL,
        apiKey: env.BITEK_E3_TOKEN,
        model: env.BITEK_E3_MODEL || "qwen2.5-3b-instruct",
        timeoutMs: 25000,
        jsonMode: true,
        fetchFn,
      }),
    );
  }
  return list;
}
