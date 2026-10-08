/**
 * Phase 7.1.3 — derived Inspector context (OD-P7.1-02 = B).
 * Selection remains SSOT in StudioEditorInner; this only derives UI context.
 * Priority: record → clip → track → empty.
 */

export type StudioInspectorContext = "record" | "clip" | "track" | "empty";

export type DeriveStudioInspectorContextInput = {
  recordingActive: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
};

export function deriveStudioInspectorContext(
  input: DeriveStudioInspectorContextInput,
): StudioInspectorContext {
  if (input.recordingActive) return "record";
  if (input.selectedClipId) return "clip";
  if (input.selectedTrackId) return "track";
  return "empty";
}

export function studioInspectorContextTitle(
  context: StudioInspectorContext,
): string {
  switch (context) {
    case "record":
      return "Nagrywanie";
    case "clip":
      return "Klip / plik";
    case "track":
      return "Ścieżka";
    case "empty":
      return "Inspector";
  }
}
