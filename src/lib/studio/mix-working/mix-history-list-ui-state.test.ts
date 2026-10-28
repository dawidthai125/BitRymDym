/**
 * A3.2 — deterministic list panel state machine (loading vs empty vs error).
 */

import { describe, expect, it } from "vitest";

import {
  resolveMixHistoryListPanelKind,
  type MixHistoryListLoadState,
} from "@/lib/studio/mix-working/mix-history-list-ui-state";

function kind(
  loadState: MixHistoryListLoadState,
  revisionCount: number,
) {
  return resolveMixHistoryListPanelKind({ loadState, revisionCount });
}

describe("A3.2 resolveMixHistoryListPanelKind", () => {
  it("shows loading for idle/loading before any rows (no false empty)", () => {
    expect(kind("idle", 0)).toBe("loading");
    expect(kind("loading", 0)).toBe("loading");
  });

  it("shows empty only after success with zero rows", () => {
    expect(kind("success", 0)).toBe("empty");
  });

  it("shows error for failed request with no rows (not empty)", () => {
    expect(kind("error", 0)).toBe("error");
  });

  it("keeps list visible while reloading when rows already exist", () => {
    expect(kind("loading", 3)).toBe("list");
    expect(kind("idle", 2)).toBe("list");
    expect(kind("error", 2)).toBe("list");
    expect(kind("success", 4)).toBe("list");
  });

  it("models delayed non-empty fetch: loading → list, never empty mid-flight", () => {
    const sequence: Array<{
      loadState: MixHistoryListLoadState;
      revisionCount: number;
    }> = [
      { loadState: "loading", revisionCount: 0 },
      { loadState: "success", revisionCount: 2 },
    ];
    expect(kind(sequence[0]!.loadState, sequence[0]!.revisionCount)).toBe(
      "loading",
    );
    expect(kind(sequence[0]!.loadState, sequence[0]!.revisionCount)).not.toBe(
      "empty",
    );
    expect(kind(sequence[1]!.loadState, sequence[1]!.revisionCount)).toBe(
      "list",
    );
  });

  it("models reopen while refetching cached rows: list, not empty", () => {
    // Reopen with previous rows still in memory during loading.
    expect(kind("loading", 5)).toBe("list");
    expect(kind("loading", 5)).not.toBe("empty");
  });

  it("models project switch: cleared rows + loading → skeleton, not empty", () => {
    expect(kind("loading", 0)).toBe("loading");
    expect(kind("loading", 0)).not.toBe("empty");
  });

  it("models HTTP error then retry loading without flashing empty", () => {
    expect(kind("error", 0)).toBe("error");
    expect(kind("loading", 0)).toBe("loading");
    expect(kind("success", 0)).toBe("empty");
  });
});
