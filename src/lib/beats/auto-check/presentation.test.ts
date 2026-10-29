import { describe, expect, it } from "vitest";

import { autoCheckBadge, readCheckResults, safeMatchHref, vocalRanges } from "@/lib/beats/auto-check/presentation";

describe("auto-check presentation", () => {
  it("badges", () => {
    expect(autoCheckBadge(null).label).toBe("Filtr: brak sprawdzenia");
    expect(autoCheckBadge({ status: "passed", overridden_at: null, appeal_requested_at: null }).tone).toBe("ok");
    expect(autoCheckBadge({ status: "rejected_vocals", overridden_at: null, appeal_requested_at: "x" }).label).toBe("Filtr: wokal · odwołanie");
    expect(autoCheckBadge({ status: "rejected_match", overridden_at: "x", appeal_requested_at: null }).label).toContain("uchylony");
    expect(autoCheckBadge({ status: "error", overridden_at: null, appeal_requested_at: null, error_code: "needs_config" }).label).toContain("konfiguracji");
  });
  it("merges vocal windows", () => {
    expect(vocalRanges([{ startSeconds: 12, endSeconds: 13, db: -1 }, { startSeconds: 13, endSeconds: 14, db: -1 }, { startSeconds: 70, endSeconds: 71, db: -1 }])).toEqual(["0:12–0:14", "1:10–1:11"]);
  });
  it("only safe hrefs", () => {
    expect(safeMatchHref("/admin/moderation/x")).toBe("/admin/moderation/x");
    expect(safeMatchHref("//evil.com")).toBeNull();
    expect(safeMatchHref("javascript:alert(1)")).toBeNull();
    expect(safeMatchHref("https://musicbrainz.org/recording/1")).toContain("musicbrainz");
  });
  it("tolerates malformed results", () => {
    expect(readCheckResults(null)).toEqual({ recognition: [], vocal: null });
  });
});
