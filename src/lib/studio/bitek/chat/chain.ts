import { bitekRulesChat } from "./intents";
import { buildBitekSystemPrompt } from "./prompt";
import { parseBitekModelOutput } from "./proposals";
import { BitekProviderError, type BitekLlmProvider } from "./providers";
import { BITEK_LIMITS, type BitekChatContext, type BitekChatResult, type BitekChatTurn } from "./types";

export type BitekChainLog = {
  provider: BitekChatResult["provider"];
  ms: number;
  attempts: { id: string; outcome: string; ms: number }[];
};

/** Try providers in order; fail over on 429/5xx/timeout/network/bad JSON; rules are the final answer. Logs carry no message content. */
export async function runBitekChatChain(params: {
  providers: BitekLlmProvider[];
  message: string;
  history: BitekChatTurn[];
  context: BitekChatContext;
  log?: (entry: BitekChainLog) => void;
  now?: () => number;
}): Promise<BitekChatResult> {
  const now = params.now ?? Date.now;
  const t0 = now();
  const attempts: BitekChainLog["attempts"] = [];
  const messages = [
    { role: "system" as const, content: buildBitekSystemPrompt(params.context) },
    ...params.history.slice(-BITEK_LIMITS.historyMaxTurns).map((h) => ({
      role: h.role,
      content: h.content.slice(0, BITEK_LIMITS.historyTurnMaxChars),
    })),
    { role: "user" as const, content: params.message },
  ];
  for (const p of params.providers) {
    const started = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), p.timeoutMs);
    try {
      const text = await p.complete(messages, controller.signal);
      const parsed = parseBitekModelOutput(text, params.context);
      if (!parsed) throw new BitekProviderError("bad_response");
      attempts.push({ id: p.id, outcome: "ok", ms: now() - started });
      params.log?.({ provider: p.id, ms: now() - t0, attempts });
      return { provider: p.id, ...parsed };
    } catch (e) {
      const kind = e instanceof BitekProviderError ? e.kind : "error";
      attempts.push({ id: p.id, outcome: kind, ms: now() - started });
    } finally {
      clearTimeout(timer);
    }
  }
  const result = bitekRulesChat(params.message, params.context);
  params.log?.({ provider: "rules", ms: now() - t0, attempts });
  return result;
}
