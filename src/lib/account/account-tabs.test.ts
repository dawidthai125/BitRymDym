import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCOUNT_TABS, activeAccountTab, settingsPathForHash } from "./account-tabs";

describe("profile tabs", () => {
  it("has six tabs and every page exists", () => {
    expect(ACCOUNT_TABS.map((t) => t.id)).toEqual(["overview", "takes", "library", "works", "settings", "support"]);
    for (const page of ACCOUNT_TABS.flatMap((t) => t.pages)) {
      expect(existsSync(join(process.cwd(), "src/app", page.href, "page.tsx")), page.href).toBe(true);
    }
  });
  it("marks the group of a page, also nested ones", () => {
    expect(activeAccountTab("/account")).toBe("overview");
    expect(activeAccountTab("/account/shared")).toBe("library");
    expect(activeAccountTab("/account/beats/abc/edit")).toBe("works");
    expect(activeAccountTab("/account/profil")).toBe("settings");
    expect(activeAccountTab("/beats")).toBeNull();
  });
  it("sends old section links to settings and keeps the referral anchor", () => {
    for (const hash of ["#profil", "#security", "#powiadomienia", "#danger"]) {
      expect(settingsPathForHash(hash)).toBe(`/account/settings${hash}`);
    }
    expect(settingsPathForHash("#zapros")).toBeNull();
    expect(settingsPathForHash("")).toBeNull();
  });
});
