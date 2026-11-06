/**
 * Draft → rhyme check → repair loop. Provider-agnostic (injected providers), no env, no DB.
 * The first usable draft comes from the first provider that answers; if it rhymes badly, the weak
 * lines go back to the same provider (then the next ones) up to AI_LYRICS_MAX_REPAIRS times.
 * The best-scoring draft wins, so a worse rewrite never replaces a better first try.
 */
import { BitekProviderError, type BitekLlmProvider } from "@/lib/studio/bitek/chat/providers";

import {
  AI_LYRICS_MAX_REPAIRS,
  AI_LYRICS_RHYME_TARGET,
  buildAiLyricsMessages,
  buildAiLyricsRepairMessages,
  parseAiLyricsOutput,
  pickBestLyrics,
  type AiLyricsInput,
} from "./ai-lyrics";
import { rhymeReport } from "./rhyme";

export type LyricsPipelineResult = {
  text: string;
  provider: BitekLlmProvider["id"];
  model: string | null;
  /** Share of line pairs that rhyme (0..1). */
  rhyme: number;
  repairs: number;
};

type Messages = { role: "system" | "user"; content: string }[];

async function ask(provider: BitekLlmProvider, messages: Messages): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), provider.timeoutMs + 2000);
  try {
    return parseAiLyricsOutput(await provider.complete(messages, ctrl.signal));
  } catch (e) {
    if (!(e instanceof BitekProviderError)) throw e;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runLyricsPipeline(p: {
  providers: BitekLlmProvider[];
  input: AiLyricsInput;
  /** Epoch ms after which no repair round is started (the first draft is never cut). */
  repairDeadline?: number;
  now?: () => number;
}): Promise<LyricsPipelineResult | null> {
  const now = p.now ?? Date.now;
  const drafts: string[] = [];
  let first: { provider: BitekLlmProvider; index: number } | null = null;

  for (let i = 0; i < p.providers.length; i++) {
    const text = await ask(p.providers[i], buildAiLyricsMessages(p.input));
    if (text) {
      drafts.push(text);
      first = { provider: p.providers[i], index: i };
      break;
    }
  }
  if (!first) return null;
  let source: BitekLlmProvider = first.provider;
  const firstIndex = first.index;

  let repairs = 0;
  let best = pickBestLyrics(drafts)!;
  while (best.report.score < AI_LYRICS_RHYME_TARGET && best.report.checked > 0 && repairs < AI_LYRICS_MAX_REPAIRS) {
    if (p.repairDeadline !== undefined && now() > p.repairDeadline) break;
    repairs += 1;
    const messages = buildAiLyricsRepairMessages(p.input, best.text, best.report);
    // Same provider first (it knows the context best), then the rest of the chain.
    const order: BitekLlmProvider[] = [source, ...p.providers.filter((_, i) => i !== firstIndex)];
    let fixed: string | null = null;
    for (const provider of order) {
      fixed = await ask(provider, messages);
      if (fixed) {
        source = provider;
        break;
      }
    }
    if (!fixed) break;
    drafts.push(fixed);
    best = pickBestLyrics(drafts)!;
  }

  return {
    text: best.text,
    provider: source.id,
    model: source.model ?? null,
    rhyme: rhymeReport(best.text).score,
    repairs,
  };
}
