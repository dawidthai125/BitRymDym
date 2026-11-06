import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PLAN_POLICY, maxStemsForTier } from "@/config/plan-policy";
import { STEM_AUDIO_MAX_BYTES, STEM_MAX_SECONDS, STEM_USER_ACTIVE_CAP, TAKE_AUDIO_MAX_BYTES } from "@/config/recording";
import { validateTakeUploadMeta } from "@/lib/takes/validation";

const read = (p: string) => readFileSync(p, "utf8");

describe("stem import — limits", () => {
  it("Silver 8 and Gold 16 stems; Free and Bronze none", () => {
    expect(maxStemsForTier("FREE")).toBe(0);
    expect(maxStemsForTier("BRONZE")).toBe(0);
    expect(maxStemsForTier("SILVER")).toBe(8);
    expect(maxStemsForTier("GOLD")).toBe(16);
    expect(PLAN_POLICY.GOLD.studio.maxRecordingTracks).toBeGreaterThanOrEqual(PLAN_POLICY.GOLD.studio.maxStems);
  });
  it("stems may be bigger and longer than vocal takes, with a bounded user total", () => {
    expect(STEM_AUDIO_MAX_BYTES).toBeGreaterThan(TAKE_AUDIO_MAX_BYTES);
    expect(STEM_MAX_SECONDS).toBe(240);
    expect(STEM_USER_ACTIVE_CAP).toBeGreaterThanOrEqual(PLAN_POLICY.GOLD.studio.maxStems);
  });
  it("upload meta uses the stem size cap only when asked", () => {
    const size = TAKE_AUDIO_MAX_BYTES + 1;
    expect(validateTakeUploadMeta({ contentType: "audio/wav", byteSize: size }).ok).toBe(false);
    expect(validateTakeUploadMeta({ contentType: "audio/wav", byteSize: size, maxBytes: STEM_AUDIO_MAX_BYTES }).ok).toBe(true);
    expect(validateTakeUploadMeta({ contentType: "audio/wav", byteSize: STEM_AUDIO_MAX_BYTES + 1, maxBytes: STEM_AUDIO_MAX_BYTES }).ok).toBe(false);
  });
});

describe("stem import — stems never count as recordings", () => {
  it("every recording counter filters is_stem", () => {
    expect(read("src/lib/plans/plan-usage.ts").match(/eq\("is_stem", false\)/g)?.length).toBe(2);
    expect(read("src/lib/takes/recording-eligibility-service.ts").match(/eq\("is_stem", false\)/g)?.length).toBe(2);
    expect(read("src/lib/takes/list-own-takes.ts")).toContain('.eq("is_stem", false)');
    expect(read("src/lib/takes/list-replaceable-takes.ts")).toContain('.eq("is_stem", false)');
  });
  it("migration keeps stems out of the vocal limits and caps them per project", () => {
    const sql = read("supabase/migrations/20261106160000_studio_stems.sql");
    expect(sql.match(/and not t\.is_stem/g)?.length).toBe(2);
    expect(sql).toContain("claim_stem_take_session");
    expect(sql).toContain("STEM_PROJECT_CAP");
    expect(sql).toContain("STEM_USER_CAP");
    expect(sql).toContain("revoke all on function public.claim_stem_take_session");
    expect(sql).toContain("<= case when is_stem then 240 else 180 end");
  });
  it("finalize skips creator XP for stems and uses the stem size cap", () => {
    const src = read("src/lib/takes/take-transport.ts");
    expect(src).toContain("is_stem !== true");
    expect(src).toContain("isStem ? STEM_AUDIO_MAX_BYTES : TAKE_AUDIO_MAX_BYTES");
  });
  it("session route has no client-chosen storage or owner fields", () => {
    const src = read("src/app/api/studio/projects/[projectId]/stems/session/route.ts");
    expect(src).not.toMatch(/objectKey|ownerId|bucket/);
  });
});

describe("stem import — project delete leaves no orphan files", () => {
  it("a BEFORE DELETE trigger turns stems into DELETED takes for the janitor", () => {
    const sql = read("supabase/migrations/20261106170000_studio_stems_release_on_project_delete.sql");
    expect(sql).toContain("before delete on public.studio_projects");
    expect(sql).toContain("status = 'DELETED'");
    expect(sql).toContain("stem_project_id = null");
    expect(sql).toContain("or status = 'DELETED'");
  });
});
