/**
 * Pure filename → title suggestion for admin PLATFORM create (Scope A).
 * No AI — strip extension and light cleanup only.
 */

export function suggestTitleFromFilename(
  filename: string | null | undefined,
): string {
  if (typeof filename !== "string") {
    return "";
  }

  const trimmed = filename.trim();
  if (!trimmed) {
    return "";
  }

  // Use last path segment if a path slipped in.
  const base = trimmed.replace(/\\/g, "/").split("/").pop() ?? trimmed;

  // Remove last extension (handles multi-dot names: archive.tar.wav → archive.tar)
  const withoutExt = base.includes(".")
    ? base.replace(/\.[^/.]+$/, "")
    : base;

  const cleaned = withoutExt
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}
