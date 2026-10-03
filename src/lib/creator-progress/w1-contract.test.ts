import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CREATOR_EXPERIENCE_DAILY_CAPS,
  idempotencyKeyFor,
} from "@/config/creator-experience";
import { PROTECTED_PROFILE_FIELDS } from "@/lib/auth/permissions";
import { ACCOUNT_LEVELS } from "@/types/domain";
import { CREATOR_RANKS } from "@/types/creator-progress";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Creator Progress W1 contract (static)", () => {
  const sql = read(
    "supabase/migrations/20261003210121_creator_progress_w1_experience.sql",
  );

  it("creates ledger + experience_total + service_role award RPC", () => {
    expect(sql).toContain("CREATE TABLE public.creator_experience_events");
    expect(sql).toContain("idempotency_key");
    expect(sql).toContain("ADD COLUMN experience_total");
    expect(sql).toContain("award_creator_experience");
    expect(sql).toContain("Only service_role may mutate creator_experience_events");
    expect(sql).toContain("award_creator_experience requires service_role");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("creator_experience_events_select_own");
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.award_creator_experience");
  });

  it("does not alter account_level enum or write Rank into account_level", () => {
    expect(sql).not.toMatch(/ALTER TYPE public\.account_level/);
    expect(sql).not.toContain("ADD VALUE");
    expect(sql).toContain("NOT profiles.account_level");
    expect(ACCOUNT_LEVELS).toEqual([
      "BEGINNER_RAPPER",
      "PRO_RAPPER",
      "LEGEND_RAPPER",
    ]);
    expect(CREATOR_RANKS).toContain("ROOKIE_RAPPER");
    expect(CREATOR_RANKS).toContain("ELITE_RAPPER");
  });

  it("protects experience_total on profile self-update", () => {
    expect(PROTECTED_PROFILE_FIELDS).toContain("experience_total");
    expect(PROTECTED_PROFILE_FIELDS).toContain("account_level");
  });

  it("wires trusted award hooks (not client)", () => {
    const award = read("src/lib/creator-progress/award.ts");
    expect(award).toContain('import "server-only"');
    expect(award).toContain("award_creator_experience");

    const actions = read("src/lib/auth/actions.ts");
    expect(actions).toContain("hookProfileCompleted");

    const beats = read("src/lib/beats/service.ts");
    expect(beats).toContain("hookBeatApproved");
    expect(beats).toContain("hookBeatFirstPublished");

    const takes = read("src/lib/takes/take-transport.ts");
    expect(takes).toContain("hookTakeReadyAuth");
    expect(takes).not.toMatch(/anon-take-transport[\s\S]*hookTakeReady/);

    const anon = read("src/lib/takes/anon-take-transport.ts");
    expect(anon).not.toContain("hookTakeReady");
    expect(anon).not.toContain("awardTakeReady");

    const render = read("src/lib/audio/render-job-service.ts");
    expect(render).toContain("hookRenderJobSucceeded");
    const pipeline = read("src/lib/audio/render-worker-pipeline.ts");
    expect(pipeline).toContain("hookRenderJobSucceeded");
  });

  it("encodes idempotency + daily caps from freeze", () => {
    expect(idempotencyKeyFor("BEAT_APPROVED", "b1")).toBe("beat_approved:b1");
    expect(idempotencyKeyFor("BEAT_FIRST_PUBLISHED", "b1")).toBe(
      "beat_first_published:b1",
    );
    expect(idempotencyKeyFor("RENDER_SUCCEEDED", "j1")).toBe(
      "render_succeeded:j1",
    );
    expect(CREATOR_EXPERIENCE_DAILY_CAPS.RENDER_SUCCEEDED).toBe(2);
    expect(CREATOR_EXPERIENCE_DAILY_CAPS.TAKE_READY).toBe(3);
  });

  it("does not open Premium / UI / recording hybrid in W1", () => {
    const award = read("src/lib/creator-progress/award.ts");
    expect(award).not.toContain("resolveProductEntitlement");
    expect(award).not.toContain("BRONZE");
    expect(sql).not.toMatch(/ALTER TABLE public\.premium_entitlements/i);
    expect(sql).not.toMatch(/ADD COLUMN\s+tier\b/i);
  });
});
