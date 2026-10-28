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

/** STU-08 — IDLE mount reports active=false and must not drop an explicit Record choice. */
export function studioPreferRecordAfterCaptureReport(
  prev: boolean,
  active: boolean,
): boolean {
  return active || prev;
}

/** Catalog / scratch place asked Record to stay — keep preferRecord, never File. */
export function studioPreferRecordAfterClipCreated(input: {
  keepRecordPanel?: boolean;
}): boolean {
  return input.keepRecordPanel === true;
}

/** Timeline clip select must not drop Record while a scratch session is active. */
export function studioPreferRecordAfterTimelineSelect(input: {
  scratchSessionActive: boolean;
}): boolean {
  return input.scratchSessionActive;
}

/** STU-10 — block overlay close only while capture is in flight on the overlay host. */
export function studioInspectorOverlayCloseBlocked(input: {
  recordingLocked: boolean;
  overlayHostsInspector: boolean;
}): boolean {
  return input.recordingLocked && input.overlayHostsInspector;
}

export const STUDIO_INSPECTOR_CLOSE_BLOCKED_PL =
  "Nie można zamknąć Inspectora, dopóki trwa nagrywanie lub zapisywanie take'a.";

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
