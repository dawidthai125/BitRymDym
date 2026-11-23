import { STUDIO_TITLE_MAX_LENGTH } from "@/config/studio";
import { StudioValidationError } from "@/lib/studio/studio-validation-error";

/** Project title from the user: trimmed, one line, 1–120 characters. */
export function normalizeStudioProjectTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (title.length < 1) throw new StudioValidationError("Wpisz nazwę projektu.");
  if (title.length > STUDIO_TITLE_MAX_LENGTH) {
    throw new StudioValidationError(`Nazwa projektu może mieć najwyżej ${STUDIO_TITLE_MAX_LENGTH} znaków.`);
  }
  return title;
}
