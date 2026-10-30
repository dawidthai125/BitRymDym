import "server-only";

import {
  OPENAI_MODERATION_MODEL,
  OPENAI_MODERATION_TIMEOUT_MS,
  isCoverAiModerationEnabled,
} from "@/config/beat-covers";
import {
  coverModerationSkipped,
  decideCoverModeration,
  type CoverModerationOutcome,
} from "@/lib/beats/cover/cover-decision";

type OpenAiModerationResponse = {
  results?: Array<{
    flagged?: boolean;
    category_scores?: Record<string, number>;
  }>;
};

/**
 * OpenAI omni-moderation-latest on the (EXIF-stripped) JPEG preview of a
 * cover. Feature-flagged: without OPENAI_API_KEY (or on any API error) the
 * cover goes to the moderator queue. The key is never logged.
 */
export async function moderateCoverImage(
  jpegPreview: Buffer,
): Promise<CoverModerationOutcome> {
  if (!isCoverAiModerationEnabled()) return coverModerationSkipped("disabled");
  const apiKey = process.env.OPENAI_API_KEY!.trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_MODERATION_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODERATION_MODEL,
        input: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${jpegPreview.toString("base64")}`,
            },
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[beat-cover] moderation HTTP", res.status);
      return coverModerationSkipped("error");
    }
    const json = (await res.json()) as OpenAiModerationResponse;
    const result = json.results?.[0];
    if (!result?.category_scores) return coverModerationSkipped("error");
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(result.category_scores)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        scores[k] = Math.round(v * 10000) / 10000;
      }
    }
    const flagged = result.flagged === true;
    return {
      provider: "openai",
      flagged,
      scores,
      ...decideCoverModeration({ flagged, scores }),
    };
  } catch (error) {
    console.error(
      "[beat-cover] moderation failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return coverModerationSkipped("error");
  } finally {
    clearTimeout(timer);
  }
}
