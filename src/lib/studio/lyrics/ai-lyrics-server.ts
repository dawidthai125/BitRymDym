import "server-only";

/**
 * Silver+ AI lyrics: ownership check → daily cap (reserve a slot) → provider chain
 * (Groq → Gemini, same keys as BITEK) → cleaned text. The text is never stored; the ledger keeps lengths only.
 */
import { randomUUID } from "node:crypto";

import { AuthError } from "@/lib/auth/session";
import { warsawDayStartIso } from "@/lib/studio/cleanup/cleanup-server";
import { BitekProviderError, bitekProvidersFromEnv, type BitekLlmProvider } from "@/lib/studio/bitek/chat/providers";
import { StudioMasterUnavailable } from "@/lib/studio/master/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import {
  AI_LYRICS_MESSAGES,
  aiLyricsPerDay,
  buildAiLyricsMessages,
  parseAiLyricsOutput,
  validateAiLyricsInput,
} from "./ai-lyrics";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: { code?: string } | null) => !!e && ["42P01", "PGRST205"].includes(e.code ?? "");

export type AiLyricsDeny = {
  ok: false;
  error: "tier_lyrics" | "bad_request" | "daily_limit" | "ai_unavailable";
  message?: string;
};
export type AiLyricsOk = { ok: true; text: string; used: number; perDay: number };

async function assertOwner(admin: Admin, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
}

/** Today's generations (Warsaw day); failed attempts do not count. */
async function usedToday(admin: Admin, ownerId: string): Promise<number> {
  const { count, error } = await admin
    .from("studio_ai_lyrics_usage")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", warsawDayStartIso())
    .neq("status", "failed");
  if (missing(error)) throw new StudioMasterUnavailable("ai_lyrics_missing");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAiLyricsState(p: { ownerId: string; projectId: string; tier: PremiumTier }) {
  const perDay = aiLyricsPerDay(p.tier);
  if (perDay === 0) return { allowed: false as const };
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const used = await usedToday(admin, p.ownerId).catch((e) => (e instanceof StudioMasterUnavailable ? null : Promise.reject(e)));
  if (used == null) return { allowed: true as const, available: false as const };
  return { allowed: true as const, available: true as const, used, perDay };
}

async function runProviders(
  providers: BitekLlmProvider[],
  messages: { role: "system" | "user"; content: string }[],
): Promise<{ text: string; provider: string } | null> {
  for (const provider of providers) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), provider.timeoutMs + 8000);
    try {
      const raw = await provider.complete(messages, ctrl.signal);
      const text = parseAiLyricsOutput(raw);
      if (text) return { text, provider: provider.id };
    } catch (e) {
      if (!(e instanceof BitekProviderError)) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function generateAiLyrics(p: {
  ownerId: string;
  projectId: string;
  tier: PremiumTier;
  mode: unknown;
  text: unknown;
  providers?: BitekLlmProvider[];
}): Promise<AiLyricsOk | AiLyricsDeny> {
  const perDay = aiLyricsPerDay(p.tier);
  if (perDay === 0) return { ok: false, error: "tier_lyrics" };
  const input = validateAiLyricsInput(p.mode, p.text);
  if (!input.ok) return input;
  const providers = p.providers ?? bitekProvidersFromEnv(process.env);
  if (!providers.length) return { ok: false, error: "ai_unavailable", message: AI_LYRICS_MESSAGES.unavailable };

  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const used = await usedToday(admin, p.ownerId);
  if (used >= perDay) return { ok: false, error: "daily_limit" };

  // Reserve the slot first (counts toward the cap while generating).
  const usageId = randomUUID();
  const { error: insErr } = await admin.from("studio_ai_lyrics_usage").insert({
    id: usageId,
    owner_id: p.ownerId,
    project_id: p.projectId,
    mode: input.mode,
    input_chars: input.text.length,
    status: "pending",
  });
  if (missing(insErr)) throw new StudioMasterUnavailable("ai_lyrics_missing");
  if (insErr) throw new Error(insErr.message);
  const finish = (patch: Record<string, unknown>) =>
    admin.from("studio_ai_lyrics_usage").update(patch).eq("id", usageId).then(() => undefined, () => undefined);

  let result: Awaited<ReturnType<typeof runProviders>>;
  try {
    result = await runProviders(providers, buildAiLyricsMessages(input));
  } catch (e) {
    await finish({ status: "failed" });
    throw e;
  }
  if (!result) {
    await finish({ status: "failed" });
    return { ok: false, error: "ai_unavailable", message: AI_LYRICS_MESSAGES.unavailable };
  }
  await finish({ status: "ok", provider: result.provider.slice(0, 20) });
  return { ok: true, text: result.text, used: used + 1, perDay };
}
