import { sanitizeBeatStyle } from "@/lib/beats/ai-beat/prompt";
import { checkPromptRules } from "@/lib/studio/video/ai-cover/prompt-rules";

const LETTERING_MAX = 24;
const COLORS_MAX = 60;

function cleanCoverField(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/["“”„«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Cover lettering. Empty means the artwork must contain no words. */
export function sanitizeCoverLettering(value: unknown): string {
  return cleanCoverField(value, LETTERING_MAX);
}

/** Color note for the cover. Empty means dark colors. */
export function sanitizeCoverColors(value: unknown): string {
  return cleanCoverField(value, COLORS_MAX);
}

export type CoverBriefResult =
  | { ok: true; prompt: string }
  | { ok: false; message: string };

/**
 * Square cover prompt. Lettering and colors are limits, not a free rewrite.
 * A rule failure returns the message instead of dropping the user's text.
 */
export function coverBriefPrompt(input: {
  style: string | null;
  lettering: unknown;
  colors: unknown;
}): CoverBriefResult {
  const style = sanitizeBeatStyle(input.style);
  const lettering = sanitizeCoverLettering(input.lettering);
  const colors = sanitizeCoverColors(input.colors);
  const writing = lettering
    ? `The only text is exactly "${lettering}". No other words.`
    : "No writing, no letters.";
  const palette = colors ? `Colors: ${colors}.` : "Dark colors.";
  const built = `Square abstract hip-hop artwork. Style: ${style}. ${writing} ${palette} No real faces.`;
  const checked = checkPromptRules(built);
  if (!checked.ok) return { ok: false, message: checked.message };
  return { ok: true, prompt: checked.prompt };
}
