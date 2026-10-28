/**
 * A3.2 — explicit list UI state for Mix Working revision history.
 * Empty is only valid after a successful response with zero rows.
 */

export type MixHistoryListLoadState =
  | "idle"
  | "loading"
  | "success"
  | "error";

export type MixHistoryListPanelKind =
  | "loading"
  | "error"
  | "empty"
  | "list";

export function resolveMixHistoryListPanelKind(input: {
  loadState: MixHistoryListLoadState;
  revisionCount: number;
}): MixHistoryListPanelKind {
  const { loadState, revisionCount } = input;

  if (loadState === "error" && revisionCount === 0) {
    return "error";
  }

  // Initial / in-flight: never treat as empty — show skeleton until success.
  if (
    (loadState === "idle" || loadState === "loading") &&
    revisionCount === 0
  ) {
    return "loading";
  }

  if (loadState === "success" && revisionCount === 0) {
    return "empty";
  }

  return "list";
}
