import "server-only";

import { AuthError, requirePermission } from "@/lib/auth/session";
import { BeatRequestError } from "@/lib/beats/request-error";
import { rewriteBeatPrompt, suggestDistinctTitle } from "@/lib/beats/ai-beat/rewrite";
import { pickDistinctTitle, titleRejectReason } from "@/lib/beats/ai-beat/title-variety";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  STABLE_AUDIO_MODEL,
  STABLE_AUDIO_START_URL,
  isStableAudioGenerationId,
  parseStabilityAudio,
  parseStabilityStart,
  randomStableAudioSeed,
  stableAudioResultUrl,
  type StabilityPoll,
  type StableAudioSampling,
} from "@/lib/beats/ai-beat/stability";
import type { BeatDuration } from "@/lib/beats/ai-beat/prompt";

const CLIENT_HEADERS = {
  "stability-client-id": "BitRymDym",
  "stability-client-version": "1",
};

export async function requireAdminGenerator() {
  const context = await requirePermission("beats.create");
  if (context.profile.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Only ADMIN may generate platform beats.");
  }
}

/** Titles already in the catalogue (newest first) — new names must not echo them. */
export async function existingBeatTitles(): Promise<string[]> {
  try {
    const { data } = await createSupabaseAdminClient()
      .from("beats")
      .select("title")
      .order("created_at", { ascending: false })
      .limit(300);
    return (data ?? []).map((r) => String((r as { title?: unknown }).title ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Last check before a generated beat is saved (result route, 120 s budget): a title that
 * echoes the catalogue gets up to two fresh suggestions; otherwise it is kept.
 */
export async function ensureDistinctBeatTitle(title: string, description: string): Promise<string> {
  const existing = await existingBeatTitles();
  if (titleRejectReason(title, existing) === null) return title;
  const xai = { apiKey: process.env.XAI_API_KEY, model: process.env.BITEK_XAI_MODEL || "grok-4.7" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = await suggestDistinctTitle(description, existing, xai);
    if (next) return next;
  }
  return title;
}

function stabilityKey(): string {
  const key = process.env.STABILITY_API_KEY?.trim();
  if (!key) {
    throw new BeatRequestError("Brak klucza Stability AI na serwerze.");
  }
  return key;
}

export async function startBeatGeneration(params: {
  description: string;
  duration: BeatDuration;
  bpm: number | null;
  /** Fixed seed (a revision reuses the winner's) and prompt strictness; omitted = model defaults. */
  sampling?: Partial<StableAudioSampling>;
}): Promise<{ generationId: string; title: string; style: string; opis: string; seed: number; cfgScale: number | null }> {
  await requireAdminGenerator();
  let rewritten: { title: string; prompt: string; style: string; opis: string };
  const xai = { apiKey: process.env.XAI_API_KEY, model: process.env.BITEK_XAI_MODEL || "grok-4.7" };
  const titlePromise = existingBeatTitles().then(async (existing) => ({
    existing,
    title: await suggestDistinctTitle(params.description, existing, xai),
  }));
  try {
    rewritten = await rewriteBeatPrompt(params.description, params.bpm, xai);
    const { existing, title } = await titlePromise;
    // Distinct name first; the rewrite's own title only when it is distinct too.
    rewritten = { ...rewritten, title: title ?? pickDistinctTitle([rewritten.title], existing) ?? rewritten.title };
  } catch (error) {
    console.error(
      "[beat-rewrite] failed:",
      error instanceof Error ? error.name : "unknown",
    );
    throw new BeatRequestError("Nie udało się przetłumaczyć opisu. Spróbuj jeszcze raz.");
  }

  const form = new FormData();
  form.set("prompt", rewritten.prompt);
  form.set("model", STABLE_AUDIO_MODEL);
  form.set("duration", String(params.duration));
  form.set("output_format", "wav");
  const seed = params.sampling?.seed ?? randomStableAudioSeed();
  form.set("seed", String(seed));
  const cfgScale = params.sampling?.cfgScale ?? null;
  if (cfgScale != null) form.set("cfg_scale", String(cfgScale));

  let response: Response;
  try {
    response = await fetch(STABLE_AUDIO_START_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stabilityKey()}`,
        Accept: "application/json",
        ...CLIENT_HEADERS,
      },
      body: form,
      // 2026-11-22: rewrite (≤25 s) + start must stay under the route's 45 s limit.
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new BeatRequestError("Nie udało się połączyć z modelem. Spróbuj jeszcze raz.");
  }

  const body = await response.json().catch(() => null);
  const started = parseStabilityStart(response.status, body);
  if (!started.ok) throw new BeatRequestError(started.message);
  return {
    generationId: started.id,
    title: rewritten.title,
    style: rewritten.style,
    opis: rewritten.opis,
    seed,
    cfgScale,
  };
}

export async function pollBeatGeneration(generationId: string): Promise<StabilityPoll> {
  await requireAdminGenerator();
  if (!isStableAudioGenerationId(generationId)) {
    throw new BeatRequestError("Nieznane generowanie.");
  }

  let response: Response;
  try {
    response = await fetch(stableAudioResultUrl(generationId), {
      headers: {
        Authorization: `Bearer ${stabilityKey()}`,
        Accept: "audio/*",
        ...CLIENT_HEADERS,
      },
      // Poll route allows 120 s; a hung connection must not use it all.
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new BeatRequestError("Nie udało się odebrać bitu. Spróbuj jeszcze raz.");
  }

  if (response.status === 202) return { status: "pending" };

  if (response.status === 200) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new BeatRequestError("Nie udało się odebrać bitu. Spróbuj jeszcze raz.");
    }
    return parseStabilityAudio(200, response.headers.get("content-type"), bytes);
  }

  const body = await response.json().catch(() => null);
  const name =
    body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name
      : undefined;
  return parseStabilityAudio(response.status, null, new Uint8Array(), name);
}
