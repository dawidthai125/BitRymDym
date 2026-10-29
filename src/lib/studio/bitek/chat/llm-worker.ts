/**
 * BITEK E3 worker core (framework-free; used by scripts/bitek-llm-worker-poll.ts).
 * Claims queue jobs, calls the localhost llama-server, writes the result. Logs carry no content.
 */
export type BitekWorkerConfig =
  | { action: "exit_disabled"; reason: string }
  | {
      action: "run";
      workerRef: string;
      llmUrl: string;
      llmToken: string;
      llmModel: string;
      pollMs: number;
      llmTimeoutMs: number;
      purgeEveryMs: number;
    };

const FALSEY = new Set(["", "0", "false", "off", "no"]);

export function decideBitekWorkerConfig(env: Record<string, string | undefined>, pid: number): BitekWorkerConfig {
  const enabled = (env.BITEK_LLM_WORKER_ENABLED ?? "").trim().toLowerCase();
  if (FALSEY.has(enabled)) return { action: "exit_disabled", reason: "BITEK_LLM_WORKER_ENABLED not true" };
  if (enabled !== "true") return { action: "exit_disabled", reason: "BITEK_LLM_WORKER_ENABLED invalid" };
  const llmToken = (env.BITEK_LLM_TOKEN ?? "").trim();
  if (!llmToken) return { action: "exit_disabled", reason: "BITEK_LLM_TOKEN missing" };
  const llmUrl = (env.BITEK_LLM_URL ?? "http://127.0.0.1:8091/v1").trim().replace(/\/$/, "");
  const host = (() => {
    try {
      return new URL(llmUrl).hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "127.0.0.1" && host !== "localhost") return { action: "exit_disabled", reason: "BITEK_LLM_URL must be localhost" };
  const int = (v: string | undefined, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : d;
  };
  return {
    action: "run",
    workerRef: (env.BITEK_LLM_WORKER_REF ?? "").trim() || `e3-bitek-${pid}`,
    llmUrl,
    llmToken,
    llmModel: (env.BITEK_LLM_MODEL ?? "qwen2.5-1.5b-instruct").trim(),
    pollMs: int(env.BITEK_LLM_POLL_MS, 300, 100, 5000),
    llmTimeoutMs: int(env.BITEK_LLM_TIMEOUT_MS, 22000, 1000, 120000),
    purgeEveryMs: 10 * 60 * 1000,
  };
}

export type BitekJob = { id: string; messages: unknown; expires_at: string };

export type BitekWorkerDeps = {
  claim(): Promise<BitekJob | null>;
  complete(id: string, result: string | null, errorCode: string | null): Promise<boolean>;
  fetchFn?: typeof fetch;
  log?: (e: Record<string, unknown>) => void;
  now?: () => number;
};

function sanitizeMessages(raw: unknown): { role: string; content: string }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const out: { role: string; content: string }[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "system" && role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, 12000) });
  }
  return out;
}

/** Process at most one job. Returns true if a job was handled (so the loop polls again immediately). */
export async function processOneBitekJob(cfg: Extract<BitekWorkerConfig, { action: "run" }>, deps: BitekWorkerDeps): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const job = await deps.claim();
  if (!job) return false;
  const t0 = now();
  const messages = sanitizeMessages(job.messages);
  if (!messages) {
    await deps.complete(job.id, null, "bad_payload");
    deps.log?.({ event: "bitek_llm_job", outcome: "bad_payload", ms: 0 });
    return true;
  }
  const remaining = Date.parse(job.expires_at) - now();
  const timeout = Math.max(1000, Math.min(cfg.llmTimeoutMs, Number.isFinite(remaining) ? remaining + 2000 : cfg.llmTimeoutMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let outcome = "ok";
  let result: string | null = null;
  let tokens: number | undefined;
  try {
    const res = await (deps.fetchFn ?? fetch)(`${cfg.llmUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.llmToken}` },
      body: JSON.stringify({
        model: cfg.llmModel,
        messages,
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      outcome = `http_${res.status}`;
    } else {
      const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: { completion_tokens?: number } };
      const content = json.choices?.[0]?.message?.content;
      tokens = json.usage?.completion_tokens;
      if (typeof content === "string" && content.trim()) result = content.slice(0, 8000);
      else outcome = "empty";
    }
  } catch {
    outcome = controller.signal.aborted ? "timeout" : "llm_unreachable";
  } finally {
    clearTimeout(timer);
  }
  await deps.complete(job.id, result, result ? null : outcome);
  deps.log?.({ event: "bitek_llm_job", outcome, ms: now() - t0, tokens });
  return true;
}
