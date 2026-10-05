/**
 * P4.2 — take title normalize / validate (pure).
 */

import { TAKE_TITLE_MAX_LENGTH } from "@/config/recording";

export function normalizeTakeTitle(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") {
    throw new Error("Title must be a string.");
  }
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  if (trimmed.length > TAKE_TITLE_MAX_LENGTH) {
    throw new Error(
      `Title must be at most ${TAKE_TITLE_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export function displayTakeTitle(params: {
  title: string | null | undefined;
  beatTitle: string | null | undefined;
}): string {
  if (params.title && params.title.trim().length > 0) {
    return params.title.trim();
  }
  if (params.beatTitle && params.beatTitle.trim().length > 0) {
    return params.beatTitle.trim();
  }
  return "Nagranie";
}
