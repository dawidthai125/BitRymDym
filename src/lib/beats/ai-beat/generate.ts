import "server-only";

import { AuthError, requirePermission } from "@/lib/auth/session";
import { BeatRequestError } from "@/lib/beats/request-error";
import { rewriteBeatPrompt } from "@/lib/beats/ai-beat/rewrite";
import {
  STABLE_AUDIO_MODEL,
  STABLE_AUDIO_START_URL,
  isStableAudioGenerationId,
  parseStabilityAudio,
  parseStabilityStart,
  stableAudioResultUrl,
  type StabilityPoll,
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
}): Promise<{ generationId: string; title: string; style: string; opis: string }> {
  await requireAdminGenerator();
  let rewritten: { title: string; prompt: string; style: string; opis: string };
  try {
    rewritten = await rewriteBeatPrompt(params.description, params.bpm, {
      apiKey: process.env.XAI_API_KEY,
      model: process.env.BITEK_XAI_MODEL || "grok-4.7",
    });
  } catch {
    throw new BeatRequestError("Nie udało się przetłumaczyć opisu. Spróbuj jeszcze raz.");
  }

  const form = new FormData();
  form.set("prompt", rewritten.prompt);
  form.set("model", STABLE_AUDIO_MODEL);
  form.set("duration", String(params.duration));
  form.set("output_format", "wav");

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
    });
  } catch {
    throw new BeatRequestError("Nie udało się odebrać bitu. Spróbuj jeszcze raz.");
  }

  if (response.status === 202) return { status: "pending" };

  if (response.status === 200) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return parseStabilityAudio(200, response.headers.get("content-type"), bytes);
  }

  const body = await response.json().catch(() => null);
  const name =
    body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name
      : undefined;
  return parseStabilityAudio(response.status, null, new Uint8Array(), name);
}
