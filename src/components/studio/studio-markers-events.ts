import type { StudioMarkerDto } from "@/lib/studio/studio-markers-state";

/** The markers panel (record tab) tells the timeline ruler what is saved now. */
export const STUDIO_MARKERS_CHANGED_EVENT = "brd:studio-markers-changed";

export type StudioMarkersChangedDetail = { projectId: string; markers: StudioMarkerDto[] };

export function notifyStudioMarkersChanged(projectId: string, markers: StudioMarkerDto[]): void {
  window.dispatchEvent(
    new CustomEvent<StudioMarkersChangedDetail>(STUDIO_MARKERS_CHANGED_EVENT, {
      detail: { projectId, markers },
    }),
  );
}
