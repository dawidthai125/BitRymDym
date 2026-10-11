/**
 * Studio project hard-delete conflict helpers (export history / FK RESTRICT).
 * Keeps ON DELETE RESTRICT; does not cascade-delete render_jobs or audio_artifacts.
 */

export const STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL =
  "Nie można trwale usunąć tego projektu, ponieważ ma powiązaną historię eksportów. Historia zadań i pliki pozostają zachowane.";

/** Known FK constraint names blocking studio_projects DELETE (ON DELETE RESTRICT). */
const EXPORT_HISTORY_FK_CONSTRAINTS = [
  "render_jobs_project_id_fkey",
  "audio_artifacts_project_id_fkey",
] as const;

/**
 * True when a Postgres / PostgREST error is the export-history RESTRICT race
 * (dependent row appeared after the existence pre-check).
 */
export function isStudioProjectExportHistoryFkViolation(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const mentionsConstraint = EXPORT_HISTORY_FK_CONSTRAINTS.some((name) =>
    message.includes(name),
  );
  if (!mentionsConstraint) return false;
  // Prefer 23503 when present; accept message-only (PostgREST wrappers vary).
  if (error.code != null && error.code !== "" && error.code !== "23503") {
    return false;
  }
  return true;
}
