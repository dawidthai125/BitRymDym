import "server-only";

import { randomUUID } from "node:crypto";

import { BEAT_COVER_BUCKET } from "@/config/beat-covers";
import { coverBriefPrompt } from "@/lib/beats/ai-beat/cover-brief";
import { requireAdminGenerator } from "@/lib/beats/ai-beat/generate";
import { sanitizeBeatStyle } from "@/lib/beats/ai-beat/prompt";
import { isUuid } from "@/lib/beats/audio-validation";
import { GENERATED_BEAT_TAG } from "@/lib/beats/catalog-lane";
import { COVER_AUTO_REJECTED_MESSAGE } from "@/lib/beats/cover/cover-service";
import { assertCoverIsDistinct } from "@/lib/beats/cover/cover-distinct";
import { processCoverImage } from "@/lib/beats/cover/cover-image";
import { moderateCoverImage } from "@/lib/beats/cover/cover-moderation";
import type { CoverModerationOutcome } from "@/lib/beats/cover/cover-decision";
import { BeatRequestError } from "@/lib/beats/request-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPromptRules } from "@/lib/studio/video/ai-cover/prompt-rules";
import {
  AiImageError,
  aiImageProvidersFromEnv,
  cloudflareCredentialShape,
} from "@/lib/studio/video/ai-cover/providers";

const NOT_WAITING = "Tego bitu nie ma w katalogu oczekujących.";
const COVER_COOLDOWN_MS = 10_000;
const COVER_GENERATE_TIMEOUT_MS = 45_000;
const SAFE_COVER_PROMPT =
  "Square abstract instrumental hip-hop artwork, dark colors, geometric drums and bass, no writing, no letters, no real faces.";

type WaitingCoverRow = {
  id: string;
  ownership_type: string;
  status: string;
  tags: string[] | null;
  style: string | null;
  cover_status: string | null;
  cover_updated_at: string | null;
  cover_path: string | null;
  cover_thumb_path: string | null;
};

function isWaitingDraft(row: WaitingCoverRow | null): row is WaitingCoverRow {
  return Boolean(
    row &&
      row.ownership_type === "PLATFORM" &&
      row.status === "DRAFT" &&
      Array.isArray(row.tags) &&
      row.tags.includes(GENERATED_BEAT_TAG),
  );
}

function coverPromptFromStyle(style: string | null): string {
  const cleaned = sanitizeBeatStyle(style);
  const built = `Square abstract instrumental hip-hop artwork. Style: ${cleaned}. No writing, no letters, no real faces.`;
  const checked = checkPromptRules(built);
  if (checked.ok) return checked.prompt;
  const fallback = checkPromptRules(SAFE_COVER_PROMPT);
  if (!fallback.ok) {
    throw new BeatRequestError("Nie udało się przygotować opisu okładki.");
  }
  return fallback.prompt;
}

function promptForCover(style: string | null, lettering: unknown, colors: unknown): string {
  const brief = coverBriefPrompt({ style, lettering, colors });
  if (brief.ok) return brief.prompt;
  const asked =
    (typeof lettering === "string" && lettering.trim().length > 0) ||
    (typeof colors === "string" && colors.trim().length > 0);
  if (asked) throw new BeatRequestError(brief.message);
  return coverPromptFromStyle(style);
}

function polishCoverImageError(error: unknown): BeatRequestError {
  if (error instanceof BeatRequestError) return error;
  if (error instanceof AiImageError) {
    console.error("[beat-cover] image failed", {
      kind: error.kind,
      status: error.status ?? null,
      codes: error.codes,
      shape: error.codes.includes(7003) ? cloudflareCredentialShape(process.env) : undefined,
    });
    if (error.kind === "limit") {
      return new BeatRequestError("Dzienny limit obrazów jest wyczerpany.");
    }
    if (error.kind === "auth") {
      return new BeatRequestError("Klucz obrazu na serwerze został odrzucony.");
    }
    if (error.kind === "network" || error.kind === "timeout") {
      return new BeatRequestError("Nie udało się połączyć z generatorem okładek.");
    }
    if (error.kind === "rate") {
      return new BeatRequestError("Generator okładek jest chwilowo zajęty. Spróbuj za minutę.");
    }
    if (error.kind === "server") {
      return new BeatRequestError("Generator okładek jest chwilowo niedostępny. Spróbuj za chwilę.");
    }
    if (error.codes.includes(7003)) {
      return new BeatRequestError("Identyfikator konta obrazów na serwerze jest nieprawidłowy.");
    }
    if (error.codes.includes(5007)) {
      return new BeatRequestError("Model okładek nie jest dostępny.");
    }
    if (error.codes.includes(5006) || error.kind === "refused") {
      return new BeatRequestError("Generator odrzucił opis okładki.");
    }
  } else {
    console.error(
      "[beat-cover] image failed",
      error instanceof Error ? error.name : "unknown",
    );
  }
  return new BeatRequestError("Nie udało się wygenerować okładki.");
}

function moderationSnapshot(moderation: CoverModerationOutcome, at: string, dhash: string) {
  return {
    provider: moderation.provider,
    decision: moderation.decision,
    flagged: moderation.flagged,
    maxScore: moderation.maxScore,
    topCategory: moderation.topCategory,
    scores: moderation.scores,
    skippedReason: moderation.skippedReason ?? null,
    at,
    dhash,
  };
}

async function removeCoverObjects(paths: Array<string | null>): Promise<void> {
  const keys = paths.filter((path): path is string => Boolean(path));
  if (keys.length === 0) return;
  const { error } = await createSupabaseAdminClient()
    .storage.from(BEAT_COVER_BUCKET)
    .remove(keys);
  if (error) console.error("[beat-cover] remove failed:", error.message);
}

/** Admin generates a square cover and stores it as approved. */
export async function generateWaitingBeatCover(
  beatId: string,
  brief: { lettering?: unknown; colors?: unknown } = {},
): Promise<{ coverStatus: "approved" }> {
  await requireAdminGenerator();
  if (!isUuid(beatId)) throw new BeatRequestError(NOT_WAITING);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select(
      "id, ownership_type, status, tags, style, cover_status, cover_updated_at, cover_path, cover_thumb_path",
    )
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = (data as WaitingCoverRow | null) ?? null;
  if (!isWaitingDraft(row)) throw new BeatRequestError(NOT_WAITING);

  const updatedAt = row.cover_updated_at ? new Date(row.cover_updated_at).getTime() : 0;
  if (updatedAt && Date.now() - updatedAt < COVER_COOLDOWN_MS) {
    throw new BeatRequestError(
      "Odczekaj chwilę przed kolejną zmianą okładki.",
      "CONFLICT",
    );
  }

  const providers = aiImageProvidersFromEnv(process.env);
  const provider = providers.find((item) => item.id === "xai") ?? providers[0];
  if (!provider) {
    throw new BeatRequestError("Brak klucza obrazu na serwerze.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COVER_GENERATE_TIMEOUT_MS);
  let image: Buffer;
  try {
    image = await provider.generate(
      { prompt: promptForCover(row.style, brief.lettering, brief.colors), aspect: "1:1", seed: 1 },
      controller.signal,
    );
  } catch (generateError) {
    throw polishCoverImageError(generateError);
  } finally {
    clearTimeout(timer);
  }

  const processed = await processCoverImage(image);
  const moderation = await moderateCoverImage(processed.moderationPreview);
  if (moderation.decision === "reject") {
    throw new BeatRequestError(COVER_AUTO_REJECTED_MESSAGE);
  }

  const distinct = await assertCoverIsDistinct(admin, {
    ownerId: "platform",
    excludeBeatId: beatId,
    bytes: processed.full,
  });

  const stem = `platform/${beatId}/${randomUUID()}`;
  const fullPath = `${stem}-full.webp`;
  const thumbPath = `${stem}-thumb.webp`;
  const bucket = admin.storage.from(BEAT_COVER_BUCKET);
  for (const [path, body] of [
    [fullPath, processed.full],
    [thumbPath, processed.thumb],
  ] as const) {
    const uploaded = await bucket.upload(path, body, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
    if (uploaded.error) {
      await removeCoverObjects([fullPath, thumbPath]);
      throw new Error(uploaded.error.message);
    }
  }

  const at = new Date().toISOString();
  const saved = await admin
    .from("beats")
    .update({
      cover_path: fullPath,
      cover_thumb_path: thumbPath,
      cover_status: "approved",
      cover_moderation: moderationSnapshot(moderation, at, distinct.dhash),
      cover_rejection_reason: null,
      cover_updated_at: at,
    })
    .eq("id", beatId)
    .eq("ownership_type", "PLATFORM")
    .eq("status", "DRAFT")
    .select("id");
  if (saved.error || !saved.data || saved.data.length === 0) {
    await removeCoverObjects([fullPath, thumbPath]);
    if (saved.error) throw new Error(saved.error.message);
    throw new BeatRequestError(
      "Ten bit zmienił się w trakcie zapisu okładki.",
      "CONFLICT",
    );
  }

  await removeCoverObjects([row.cover_path, row.cover_thumb_path]);
  return { coverStatus: "approved" };
}
