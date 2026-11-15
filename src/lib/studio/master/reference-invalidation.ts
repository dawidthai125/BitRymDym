/** A reference change after the first load makes an approved master stale. The first report is only hydration. */
export function referenceEditInvalidatesMaster(
  prev: { loaded: boolean; referenceId: string | null },
  nextReferenceId: string | null,
): boolean {
  return prev.loaded && prev.referenceId !== nextReferenceId;
}
