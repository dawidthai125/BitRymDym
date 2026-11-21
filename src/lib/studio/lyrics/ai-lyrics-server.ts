import "server-only";
import { usageWindowStart } from "@/lib/plans/usage-resets";

/**
 * AI lyrics: ownership check → daily cap (reserve a slot) → provider chain
 * (xAI → Groq → Gemini, same keys as BITEK) → cleaned text. The text is never stored; the ledger keeps lengths only.
 */
import { randomUUID } from "node:crypto";

import { AuthError } from "@/lib/auth/session";
import { warsawDayStartIso } from "@/lib/studio/cleanup/cleanup-server";
import { lyricsProvidersFromEnv, type BitekLlmProvider } from "@/lib/studio/bitek/chat/providers";
import { StudioMasterUnavailable } from "@/lib/studio/master/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { AI_LYRICS_MESSAGES, aiLyricsPerDay, validateAiLyricsInput } from "./ai-lyrics";
import { runLyricsPipeline, type LyricsPipelineResult } from "./ai-lyrics-pipeline";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: { code?: string } | null) => !!e && ["42P01", "PGRST205"].includes(e.code ?? "");

export type AiLyricsDeny = {
  ok: false;
  error: "tier_lyrics" | "bad_request" | "daily_limit" | "ai_unavailable";
  message?: string;
};
export type AiLyricsOk = { ok: true; text: string; used: number; perDay: number; rhyme: number; repairs: number; model: string | null; trace: LyricsPipelineResult["trace"] };

/** Ownership check; returns the project tempo (BPM) for the prompt. */
async function assertOwner(admin: Admin, ownerId: string, projectId: string): Promise<number | null> {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id, tempo_bpm").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const bpm = Number((data as { tempo_bpm?: unknown }).tempo_bpm);
  return Number.isFinite(bpm) ? bpm : null;
}

/** Today's generations (Warsaw day); failed attempts do not count. */
async function usedToday(admin: Admin, ownerId: string): Promise<number> {
  const { count, error } = await admin
    .from("studio_ai_lyrics_usage")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", await usageWindowStart(ownerId, "lyrics", warsawDayStartIso(), admin))
    .neq("status", "failed");
  if (missing(error)) throw new StudioMasterUnavailable("ai_lyrics_missing");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const LYRICS_BUSY_MESSAGE = "Poprzednie generowanie tekstu jeszcze trwa. Poczekaj na wynik i spróbuj ponownie.";

export type AiLyricsClaim = { status: "ok" | "daily_limit" | "busy" | "unavailable"; used: number };

/** Reserve one generation through claim_ai_lyrics_usage; fail-closed on any error. */
export async function claimAiLyricsUsage(
  admin: Admin,
  c: { ownerId: string; usageId: string; projectId: string; mode: string; inputChars: number; perDay: number; since: string | null },
): Promise<AiLyricsClaim> {
  if (!c.since) return { status: "unavailable", used: 0 };
  try {
    const { data, error } = await admin.rpc("claim_ai_lyrics_usage", {
      p_owner: c.ownerId,
      p_usage_id: c.usageId,
      p_project_id: c.projectId,
      p_mode: c.mode,
      p_input_chars: c.inputChars,
      p_since: c.since,
      p_per_day: c.perDay,
      p_max_attempts: c.perDay * 3,
      p_busy_seconds: 300,
    });
    if (error) return { status: "unavailable", used: 0 };
    const row = (Array.isArray(data) ? data[0] : data) as { status?: string; used?: number } | null;
    if (row?.status === "ok" || row?.status === "daily_limit" || row?.status === "busy") return { status: row.status, used: Number(row.used ?? 0) };
  } catch {
    /* fall through */
  }
  return { status: "unavailable", used: 0 };
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

export async function generateAiLyrics(p: {
  ownerId: string;
  projectId: string;
  tier: PremiumTier;
  mode: unknown;
  text: unknown;
  style?: unknown;
  providers?: BitekLlmProvider[];
}): Promise<AiLyricsOk | AiLyricsDeny> {
  const perDay = aiLyricsPerDay(p.tier);
  if (perDay === 0) return { ok: false, error: "tier_lyrics" };
  const providers = p.providers ?? lyricsProvidersFromEnv(process.env);
  if (!providers.length) return { ok: false, error: "ai_unavailable", message: AI_LYRICS_MESSAGES.unavailable };

  const admin = createSupabaseAdminClient();
  const bpm = await assertOwner(admin, p.ownerId, p.projectId);
  const input = validateAiLyricsInput(p.mode, p.text, p.style, bpm);
  if (!input.ok) return input;
  // Atomic reservation (RPC takes a per-owner lock, counts today's usage and inserts the pending row).
  // Any RPC failure (e.g. migration not applied) fails closed — the cap is never bypassed.
  const usageId = randomUUID();
  const claim = await claimAiLyricsUsage(admin, {
    ownerId: p.ownerId,
    usageId,
    projectId: p.projectId,
    mode: input.mode,
    inputChars: input.text.length,
    perDay,
    since: await usageWindowStart(p.ownerId, "lyrics", warsawDayStartIso(), admin).catch(() => null),
  });
  if (claim.status === "unavailable") return { ok: false, error: "ai_unavailable", message: AI_LYRICS_MESSAGES.unavailable };
  if (claim.status === "busy") return { ok: false, error: "daily_limit", message: LYRICS_BUSY_MESSAGE };
  if (claim.status === "daily_limit") return { ok: false, error: "daily_limit" };
  const used = claim.used - 1;
  const finish = (patch: Record<string, unknown>) =>
    admin.from("studio_ai_lyrics_usage").update(patch).eq("id", usageId).then(() => undefined, () => undefined);

  let result: Awaited<ReturnType<typeof runLyricsPipeline>>;
  try {
    result = await runLyricsPipeline({ providers, input, repairDeadline: Date.now() + 25_000 });
  } catch (e) {
    await finish({ status: "failed" });
    throw e;
  }
  if (!result) {
    await finish({ status: "failed" });
    return { ok: false, error: "ai_unavailable", message: AI_LYRICS_MESSAGES.unavailable };
  }
  await finish({ status: "ok", provider: result.provider.slice(0, 20) });
  return { ok: true, text: result.text, used: used + 1, perDay, rhyme: Math.round(result.rhyme * 100) / 100, repairs: result.repairs, model: result.model, trace: result.trace };
}
