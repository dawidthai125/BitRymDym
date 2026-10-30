import "server-only";

/**
 * Gold — AI cover generator: prompt → rules + Groq safeguard → free image provider chain
 * (Cloudflare FLUX schnell → Pollinations, 25 s each, failover + remembered limits) →
 * crop to 16:9 / 1:1 → the same Gemini filter as own video graphics (approve only) →
 * stored as the project's own video image (usable as `source: "upload"` imageId) and,
 * for the owner's own USER beat, settable as the beat cover (beat-cover pipeline again).
 */
import { randomInt, randomUUID } from "node:crypto";

import sharp from "sharp";

import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { uploadOwnBeatCover } from "@/lib/beats/cover/cover-service";
import { BeatRequestError } from "@/lib/beats/request-error";
import { warsawDayStartIso } from "@/lib/studio/cleanup/cleanup-server";
import { StudioMasterUnavailable } from "@/lib/studio/master/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { filterVideoImage } from "../image";
import { youtubeImageKey, youtubeVideoAllowed } from "../youtube-video";

import { memoryProviderState, runAiImageChain, type ProviderStateStore } from "./chain";
import { AI_COVER_MESSAGES, AI_COVER_PROVIDER_TIMEOUT_MS, AI_COVER_SIZE, aiCoverEnabled, aiCoverPerDay, isAiCoverAspect, type AiCoverAspect } from "./config";
import { checkPromptRules } from "./prompt-rules";
import { aiImageProvidersFromEnv, type AiProviderId } from "./providers";
import { screenAiCoverPrompt } from "./screen";

const ARTIFACTS = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof createSupabaseAdminClient>;
const missing = (e: { code?: string } | null) => !!e && ["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "");

/** Fallback when the state table is missing (per instance only). */
const memoryState = memoryProviderState();

/** Provider exhaustion shared by all instances (table studio_ai_provider_state); falls back to memory. */
function dbProviderState(admin: Admin): ProviderStateStore {
  return {
    async blockedUntil(ids) {
      const { data, error } = await admin.from("studio_ai_provider_state").select("provider, blocked_until").in("provider", ids);
      const mem = await memoryState.blockedUntil(ids);
      if (error) return mem;
      const out = { ...mem };
      for (const r of (data ?? []) as { provider: AiProviderId; blocked_until: string }[]) {
        out[r.provider] = Math.max(out[r.provider] ?? 0, Date.parse(r.blocked_until) || 0);
      }
      return out;
    },
    async block(id, untilMs, reason) {
      await memoryState.block(id, untilMs, reason);
      await admin.from("studio_ai_provider_state").upsert(
        { provider: id, blocked_until: new Date(untilMs).toISOString(), reason: reason.slice(0, 20), updated_at: new Date().toISOString() },
        { onConflict: "provider" },
      );
    },
  };
}

async function project(admin: Admin, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id, beat_id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  return { beatId: ((data as { beat_id?: string | null }).beat_id ?? null) as string | null };
}

/** The project's beat is the user's own (USER, not archived) → the AI image may become its cover. */
export async function projectOwnBeatId(admin: Admin, ownerId: string, beatId: string | null): Promise<string | null> {
  if (!beatId || !UUID.test(beatId)) return null;
  const { data } = await admin.from("beats").select("id, owner_id, ownership_type, status").eq("id", beatId).maybeSingle();
  const r = data as { owner_id?: string; ownership_type?: string; status?: string } | null;
  return r && r.owner_id === ownerId && r.ownership_type === "USER" && r.status !== "ARCHIVED" ? beatId : null;
}

/** Today's generations (Warsaw day); failed attempts (all providers down) do not count. */
export async function aiCoversUsedToday(admin: Admin, ownerId: string): Promise<number> {
  const { count, error } = await admin.from("studio_ai_cover_usage").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).gte("created_at", warsawDayStartIso()).neq("status", "failed");
  if (missing(error)) throw new StudioMasterUnavailable("ai_cover_missing");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAiCoverState(p: { ownerId: string; projectId: string; tier: PremiumTier }) {
  if (!youtubeVideoAllowed(p.tier) || !aiCoverEnabled()) return null;
  const admin = createSupabaseAdminClient();
  const proj = await project(admin, p.ownerId, p.projectId);
  const used = await aiCoversUsedToday(admin, p.ownerId).catch((e) => (e instanceof StudioMasterUnavailable ? null : Promise.reject(e)));
  if (used == null) return { available: false as const };
  return { available: true as const, used, perDay: aiCoverPerDay(), ownBeat: !!(await projectOwnBeatId(admin, p.ownerId, proj.beatId)) };
}

export type AiCoverDeny = {
  ok: false;
  error: "tier_video" | "bad_request" | "prompt_rejected" | "prompt_check_down" | "daily_limit" | "ai_unavailable" | "image_rejected";
  message?: string;
};

/** Crop / resize to the stored size (Cloudflare renders 1024² → centre-of-interest crop for 16:9). */
async function toAspect(img: Buffer, aspect: AiCoverAspect): Promise<Buffer> {
  const { w, h } = AI_COVER_SIZE[aspect];
  return sharp(img, { limitInputPixels: 64_000_000 }).rotate().resize(w, h, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer();
}

export async function generateAiCover(p: { ownerId: string; projectId: string; tier: PremiumTier; prompt: unknown; aspect: unknown }):
  Promise<{ ok: true; imageId: string; previewUrl: string | null; width: number; height: number; provider: AiProviderId; used: number; perDay: number } | AiCoverDeny> {
  if (!aiCoverEnabled()) throw new StudioMasterUnavailable("ai_cover_off");
  if (!youtubeVideoAllowed(p.tier)) return { ok: false, error: "tier_video" };
  if (!isAiCoverAspect(p.aspect)) return { ok: false, error: "bad_request" };
  const rules = checkPromptRules(p.prompt);
  if (!rules.ok) return { ok: false, error: rules.reason === "too_short" || rules.reason === "too_long" ? "bad_request" : "prompt_rejected", message: rules.message };
  const admin = createSupabaseAdminClient();
  await project(admin, p.ownerId, p.projectId);
  const perDay = aiCoverPerDay();
  const used = await aiCoversUsedToday(admin, p.ownerId);
  if (used >= perDay) return { ok: false, error: "daily_limit" };

  const screen = await screenAiCoverPrompt(rules.prompt, { groqKey: process.env.GROQ_API_KEY });
  if (!screen.ok) {
    return screen.reason === "policy"
      ? { ok: false, error: "prompt_rejected", message: AI_COVER_MESSAGES.promptRejected }
      : { ok: false, error: "prompt_check_down", message: AI_COVER_MESSAGES.promptCheckDown };
  }

  // Reserve the slot first (counts toward the cap while generating).
  const usageId = randomUUID();
  const { error: insErr } = await admin.from("studio_ai_cover_usage").insert({ id: usageId, owner_id: p.ownerId, project_id: p.projectId, aspect: p.aspect, status: "pending" });
  if (missing(insErr)) throw new StudioMasterUnavailable("ai_cover_missing");
  if (insErr) throw new Error(insErr.message);
  const finish = (patch: Record<string, unknown>) => admin.from("studio_ai_cover_usage").update(patch).eq("id", usageId).then(() => undefined, () => undefined);

  const providers = aiImageProvidersFromEnv(process.env, (a) => AI_COVER_SIZE[a]);
  const chain = await runAiImageChain(providers, { prompt: screen.finalPrompt, aspect: p.aspect, seed: randomInt(1, 2_000_000_000) }, {
    timeoutMs: AI_COVER_PROVIDER_TIMEOUT_MS, state: dbProviderState(admin),
  });
  const attempts = chain.attempts.map((a) => `${a.provider}:${a.outcome}`).join(",").slice(0, 200);
  if (!chain.ok) {
    await finish({ status: "failed", attempts });
    return { ok: false, error: "ai_unavailable", message: AI_COVER_MESSAGES.allFailed };
  }

  let filtered: Awaited<ReturnType<typeof filterVideoImage>>;
  try {
    filtered = await filterVideoImage(await toAspect(chain.image, p.aspect));
  } catch (e) {
    await finish({ status: "image_rejected", provider: chain.provider, attempts });
    if (e instanceof BeatRequestError) return { ok: false, error: "image_rejected", message: e.message };
    throw e;
  }
  const imageId = randomUUID();
  const key = youtubeImageKey(p.ownerId, p.projectId, imageId);
  const { error: upErr } = await admin.storage.from(ARTIFACTS).upload(key, filtered.image, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    await finish({ status: "failed", provider: chain.provider, attempts });
    if (/mime|not allowed|invalid_mime/i.test(upErr.message)) throw new StudioMasterUnavailable("video_bucket");
    throw new Error("ai_cover_upload");
  }
  await finish({ status: "ok", provider: chain.provider, image_id: imageId, attempts });
  const { data: s } = await admin.storage.from(ARTIFACTS).createSignedUrl(key, 600);
  return { ok: true, imageId, previewUrl: s?.signedUrl ?? null, width: filtered.width, height: filtered.height, provider: chain.provider, used: used + 1, perDay };
}

/** Use a project video image (AI or own upload) as the cover of the owner's own beat — full beat-cover pipeline. */
export async function setProjectImageAsBeatCover(p: { context: AuthContext; projectId: string; imageId: unknown }) {
  if (!aiCoverEnabled()) throw new StudioMasterUnavailable("ai_cover_off");
  if (typeof p.imageId !== "string" || !UUID.test(p.imageId)) return { ok: false as const, error: "bad_request" as const };
  const admin = createSupabaseAdminClient();
  const proj = await project(admin, p.context.userId, p.projectId);
  const beatId = await projectOwnBeatId(admin, p.context.userId, proj.beatId);
  if (!beatId) return { ok: false as const, error: "not_own_beat" as const };
  const { data, error } = await admin.storage.from(ARTIFACTS).download(youtubeImageKey(p.context.userId, p.projectId, p.imageId));
  if (error || !data) return { ok: false as const, error: "image_missing" as const };
  const r = await uploadOwnBeatCover(p.context, beatId, new Uint8Array(await data.arrayBuffer()));
  return { ok: true as const, beatId, coverStatus: r.coverStatus };
}
