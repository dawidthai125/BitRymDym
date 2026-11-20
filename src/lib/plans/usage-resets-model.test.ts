import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { USAGE_RESET_METRICS, isUsageResetMetric, windowStartAfterReset } from "./usage-resets-model";

describe("admin usage resets", () => {
  it("keeps the normal window when there is no reset or the reset is older", () => {
    expect(windowStartAfterReset("2026-11-20T00:00:00.000Z", null)).toBe("2026-11-20T00:00:00.000Z");
    expect(windowStartAfterReset("2026-11-20T00:00:00.000Z", "2026-11-19T12:00:00.000Z")).toBe("2026-11-20T00:00:00.000Z");
  });

  it("moves the window to a newer reset", () => {
    expect(windowStartAfterReset("2026-11-20T00:00:00.000Z", "2026-11-20T09:30:00+00:00")).toBe("2026-11-20T09:30:00.000Z");
  });

  it("ignores garbage", () => {
    expect(windowStartAfterReset("2026-11-20T00:00:00.000Z", "nope")).toBe("2026-11-20T00:00:00.000Z");
    expect(isUsageResetMetric("masters")).toBe(true);
    expect(isUsageResetMetric("all")).toBe(false);
  });

  it("uses the same metric names as the DB constraint, and every quota RPC honours its marker", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261120090000_admin_usage_resets.sql"),
      "utf8",
    );
    for (const m of USAGE_RESET_METRICS) expect(sql).toContain(`'${m}'`);
    for (const fn of [
      "claim_song_completion",
      "claim_desktop_studio_send",
      "claim_studio_master_job",
      "consume_studio_download",
      "enqueue_studio_cleanup_job",
      "enqueue_studio_youtube_video",
    ]) {
      const start = sql.indexOf(`function public.${fn}(`);
      expect(start, fn).toBeGreaterThan(0);
      const body = sql.slice(start, sql.indexOf("$function$;", start));
      expect(body, fn).toContain("public.usage_reset_at(");
    }
  });
});
