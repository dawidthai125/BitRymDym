import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract: community „Wrzuć bit” must not advertise /beats/upload to ADMIN.
 * Page + transport remain USER-only; staff PLATFORM create is /admin/beats/new.
 */
describe("community upload nav contract", () => {
  const root = process.cwd();

  it("site-header uses canAccessCommunityUpload (USER-only), not showAdmin OR", () => {
    const src = readFileSync(
      join(root, "src/components/site/site-header.tsx"),
      "utf8",
    );
    expect(src).toContain("canAccessCommunityUpload");
    expect(src).toContain("showUpload = canAccessCommunityUpload(role)");
    expect(src).not.toMatch(/showUpload\s*=\s*role\s*===\s*"USER"\s*\|\|\s*showAdmin/);
  });

  it("user-menu Wrzuć bit still targets /beats/upload when shown", () => {
    const src = readFileSync(
      join(root, "src/components/site/user-menu.tsx"),
      "utf8",
    );
    expect(src).toContain('href="/beats/upload"');
    expect(src).toContain("Wrzuć bit");
    expect(src).toContain("showUpload");
  });

  it("beats/upload does not silently bounce authenticated non-USER to /account only", () => {
    const src = readFileSync(
      join(root, "src/app/beats/upload/page.tsx"),
      "utf8",
    );
    expect(src).toContain('role !== "USER"');
    expect(src).toContain('redirect("/admin/beats/new")');
    expect(src).toContain('redirect("/sign-in")');
    expect(src).not.toContain('requireRole(["USER"])');
  });

  it("ADMIN /beats/upload → /admin/beats/new outside auth try/catch (NEXT_REDIRECT safe)", () => {
    const src = readFileSync(
      join(root, "src/app/beats/upload/page.tsx"),
      "utf8",
    );
    // First try/catch is auth resolution only — must not host role redirects.
    const authBlock = src.match(
      /let context;\s*try\s*\{([\s\S]*?)\}\s*catch\s*\(error\)\s*\{([\s\S]*?)\}/,
    );
    expect(authBlock).toBeTruthy();
    expect(authBlock![1]).toContain("requireUser()");
    expect(authBlock![1]).not.toContain("redirect(");
    expect(authBlock![2]).toContain('redirect("/sign-in")');
    expect(authBlock![2]).not.toContain('redirect("/admin/beats/new")');

    const afterAuth = src.slice(
      (authBlock!.index ?? 0) + authBlock![0].length,
    );
    expect(afterAuth).toMatch(
      /role !== "USER"[\s\S]*?role === "ADMIN"[\s\S]*?redirect\("\/admin\/beats\/new"\)/,
    );
  });
});
