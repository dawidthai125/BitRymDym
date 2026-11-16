import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth profile nav cache", () => {
  it("caches profile+permissions across requests without cookies in the callback", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/auth/session.ts"),
      "utf8",
    );
    expect(src).toMatch(/unstable_cache/);
    expect(src).toMatch(/createSupabaseAdminClient/);
    expect(src).toMatch(/auth-profile-context/);
    expect(src).toMatch(/AUTH_PROFILE_REVALIDATE_SECONDS/);
    expect(src).toMatch(/getSupabaseServiceRoleKey/);
  });

  it("ships nested admin loading shells for detail routes", () => {
    for (const rel of [
      "src/app/admin/users/[userId]/loading.tsx",
      "src/app/admin/moderation/[id]/loading.tsx",
      "src/app/admin/beats/[id]/loading.tsx",
      "src/components/admin/admin-segment-loading.tsx",
    ]) {
      expect(readFileSync(join(process.cwd(), rel), "utf8")).toMatch(
        /AdminSegmentLoading/,
      );
    }
  });
});
