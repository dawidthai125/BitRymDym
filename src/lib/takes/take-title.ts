/**
 * P4.2 — take title normalize / validate (pure).
 */

import { TAKE_TITLE_MAX_LENGTH } from "@/config/recording";

export type TakeTitleErrorCode =
  | "TITLE_NOT_STRING"
  | "TITLE_RESERVED_PREFIX"
  | "TITLE_TOO_LONG";

/** Owner-input mistake in a take title (a 400, never a permission error). */
export class TakeTitleError extends Error {
  readonly code: TakeTitleErrorCode;

  constructor(code: TakeTitleErrorCode, message: string) {
    super(message);
    this.name = "TakeTitleError";
    this.code = code;
  }
}

export function isTakeTitleErrorCode(value: unknown): value is TakeTitleErrorCode {
  return (
    value === "TITLE_NOT_STRING" ||
    value === "TITLE_RESERVED_PREFIX" ||
    value === "TITLE_TOO_LONG"
  );
}

export function normalizeTakeTitle(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") {
    throw new TakeTitleError("TITLE_NOT_STRING", "Title must be a string.");
  }
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  // "smp:" / "catalog:" mark sample copies (Studio plumbing, download guard, rights check): never typed by owners.
  if (/^(smp|catalog):/i.test(trimmed)) {
    throw new TakeTitleError(
      "TITLE_RESERVED_PREFIX",
      "Title cannot start with smp: or catalog:.",
    );
  }
  if (trimmed.length > TAKE_TITLE_MAX_LENGTH) {
    throw new TakeTitleError(
      "TITLE_TOO_LONG",
      `Title must be at most ${TAKE_TITLE_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}

/** Client pre-check with the same rules as the server; null when the title is acceptable. */
export function takeTitleErrorCode(raw: unknown): TakeTitleErrorCode | null {
  try {
    normalizeTakeTitle(raw);
    return null;
  } catch (e) {
    if (e instanceof TakeTitleError) return e.code;
    throw e;
  }
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
