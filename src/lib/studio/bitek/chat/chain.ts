import { groundBitekResult } from "./ground";
import { bitekRulesChat } from "./intents";
import { bitekMasterRulesChat, bitekMasterStyleChat, bitekMasterTargetChat, classifyMasterRequest } from "./master-intents";
import { buildBitekSystemPrompt, isBitekWrongLanguage } from "./prompt";
import { parseBitekModelOutput } from "./proposals";
import { bitekRecordHelper } from "./record-helper";
import { resolveBitekRelative } from "./relative";
import { BitekProviderError, type BitekLlmProvider } from "./providers";
import { BITEK_LIMITS, type BitekChatContext, type BitekChatResult, type BitekChatTurn } from "./types";

export type BitekChainLog = {
  provider: BitekChatResult["provider"];
  ms: number;
  attempts: { id: string; outcome: string; ms: number; status?: number; code?: string }[];
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
  // Recording: helper only. No mix faders, no model that can invent a vocal.
  if (params.context.step === "record") {
    params.log?.({ provider: "rules", ms: now() - t0, attempts: [] });
    return bitekRecordHelper(params.message, params.context);
  }
  // Conversational follow-up on the last applied change ("więcej", "za dużo", "cofnij") — deterministic.
  const relative = resolveBitekRelative(params.message, params.context);
  if (relative) {
    params.log?.({ provider: "rules", ms: now() - t0, attempts: [] });
    return groundBitekResult(relative, params.context);
  }
  // Mastering: single-track asks, style presets and measured loudness targets are deterministic.
  // Open questions still go through the LLM; rules are the fallback.
  if (params.context.step === "master") {
    const style = bitekMasterStyleChat(params.message, params.context);
    const target = style ? null : bitekMasterTargetChat(params.message, params.context);
    const scope = classifyMasterRequest(params.message);
    const decided = style ?? target ?? (scope.kind === "track" ? bitekMasterRulesChat(params.message, params.context, scope) : null);
    if (decided) {
      params.log?.({ provider: "rules", ms: now() - t0, attempts: [] });
      return decided;
    }
  }
  const attempts: BitekChainLog["attempts"] = [];
  const turns = [
    ...params.history.slice(-BITEK_LIMITS.historyMaxTurns).map((h) => ({
      role: h.role,
      content: h.content.slice(0, BITEK_LIMITS.historyTurnMaxChars),
    })),
    { role: "user" as const, content: params.message },
  ];
  const systemFull = buildBitekSystemPrompt(params.context);
  for (const p of params.providers) {
    const system = p.compactPrompt ? buildBitekSystemPrompt(params.context, { compact: true }) : systemFull;
    const messages = [{ role: "system" as const, content: system }, ...turns];
    const started = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), p.timeoutMs);
    try {
      const text = await p.complete(messages, controller.signal);
      const parsed = parseBitekModelOutput(text, params.context);
      if (!parsed) throw new BitekProviderError("bad_response");
      let result = groundBitekResult({ provider: p.id, ...parsed }, params.context);
      // Model chatted but did not name a real action — use the deterministic mix plan when it has one.
      if (params.context.step === "mix" && result.proposals.length === 0 && !result.jobs?.length) {
        const rules = bitekRulesChat(params.message, params.context);
        if (rules.proposals.length > 0 || (rules.jobs && rules.jobs.length > 0)) result = { ...rules, provider: p.id };
      }
      if (isBitekWrongLanguage(result.reply, params.context.lang)) throw new BitekProviderError("wrong_lang");
      attempts.push({ id: p.id, outcome: "ok", ms: now() - started });
      params.log?.({ provider: p.id, ms: now() - t0, attempts });
      return result;
    } catch (e) {
      const kind = e instanceof BitekProviderError ? e.kind : "error";
      const status = e instanceof BitekProviderError ? e.status : undefined;
      const code = e instanceof BitekProviderError ? e.code : undefined;
      attempts.push({ id: p.id, outcome: kind, ms: now() - started, ...(status ? { status } : {}), ...(code ? { code } : {}) });
    } finally {
      clearTimeout(timer);
    }
  }
  const result =
    params.context.step === "master" ? bitekMasterRulesChat(params.message, params.context) : bitekRulesChat(params.message, params.context);
  params.log?.({ provider: "rules", ms: now() - t0, attempts });
  return groundBitekResult(result, params.context);
}
