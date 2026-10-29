/**
 * BITEK E3 queue smoke test (no real user): enqueue one synthetic job with service_role,
 * wait for the E3 worker, print latency and the parsed reply.
 *   npx tsx --import ./scripts/register-server-only-stub.mjs scripts/bitek-llm-e2e.ts
 */
import { buildBitekSystemPrompt } from "../src/lib/studio/bitek/chat/prompt";
import { parseBitekModelOutput } from "../src/lib/studio/bitek/chat/proposals";
import { bitekQueueProvider, supabaseBitekQueueDb } from "../src/lib/studio/bitek/chat/queue-provider";
import type { BitekChatContext } from "../src/lib/studio/bitek/chat/types";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const ctx: BitekChatContext = {
    lang: "pl",
    step: "mix",
    tracks: [
      { ref: "t1", name: "Bit", role: "BEAT", gainDb: 0, pan: 0, muted: false },
      { ref: "t2", name: "Wokal", role: "VOCAL", gainDb: -6, pan: 0, muted: false },
    ],
    analysis: null,
  } as BitekChatContext;
  const admin = createSupabaseAdminClient();
  const provider = bitekQueueProvider({ db: supabaseBitekQueueDb(admin as never) });
  const t0 = Date.now();
  const raw = await provider.complete(
    [
      { role: "system", content: buildBitekSystemPrompt(ctx) },
      { role: "user", content: "Wokal jest za cichy, co zrobić?" },
    ],
    new AbortController().signal,
  );
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ event: "bitek_llm_e2e", ms, parsed: parseBitekModelOutput(raw, ctx) }));
}

main().catch((e) => {
  console.log(JSON.stringify({ event: "bitek_llm_e2e_failed", kind: (e as { kind?: string }).kind ?? String(e) }));
  process.exit(1);
});
