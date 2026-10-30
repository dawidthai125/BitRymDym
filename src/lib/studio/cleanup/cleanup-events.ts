/** Window event: a take's playable source changed (vocal cleanup applied / removed). detail: { takeId } */
export const STUDIO_TAKE_SOURCE_CHANGED_EVENT = "brd:studio-take-source-changed";

export function emitStudioTakeSourceChanged(takeId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDIO_TAKE_SOURCE_CHANGED_EVENT, { detail: { takeId } }));
}
