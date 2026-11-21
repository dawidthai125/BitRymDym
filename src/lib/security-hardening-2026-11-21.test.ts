import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("security hardening (review 2026-11-21)", () => {
  it("sends HSTS", () => {
    expect(read("next.config.ts")).toContain("Strict-Transport-Security");
  });
  it("compares the cron secret in constant time", () => {
    expect(read("src/app/api/cron/takes-janitor/route.ts")).toContain("timingSafeEqual");
  });
  it("hides the fake worker route in production", () => {
    expect(read("src/app/api/mix/worker/fake-complete/route.ts")).toContain('NODE_ENV === "production"');
  });
  it("checks content-length before buffering uploads", () => {
    expect(read("src/app/api/studio/samples/route.ts")).toContain('headers.get("content-length")');
    expect(read("src/app/api/studio/projects/[projectId]/video/image/route.ts")).toContain('headers.get("content-length")');
  });
  it("limits Sampek per user and hides provider errors", () => {
    const r = read("src/app/api/studio/play/sampek/route.ts");
    expect(r).toContain("SAMPEK_MAX_PER_WINDOW");
    expect(r).not.toContain("error instanceof Error ? error.message : \"Sampek nie odpowiedział.\"");
  });
  it("acks PayU refund notifications instead of retrying forever", () => {
    expect(read("src/lib/payments/webhook-service.ts")).toContain("refund notification received");
  });
});
