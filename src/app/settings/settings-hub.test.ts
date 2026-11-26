import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("account settings tab", () => {
  const src = read("src/app/account/settings/page.tsx");

  it("keeps the old addresses working", () => {
    expect(read("src/app/settings/page.tsx")).toContain('redirect("/account/settings")');
    expect(read("src/app/library/page.tsx")).toContain('redirect("/account/favorites")');
    expect(read("src/app/profile/page.tsx")).toContain('redirect("/account/settings#profil")');
    expect(read("src/app/account/page.tsx")).toContain("<AccountHashRedirect");
  });

  it("keeps the auth gate", () => {
    expect(src).toContain("getCurrentProfile()");
    expect(src).toContain('redirect(signInPathWithNext("/account/settings"))');
  });

  it("has every section that old links point to, with the account forms", () => {
    for (const id of ["profil", "security", "powiadomienia", "wyglad", "danger"]) {
      expect(src).toContain(`id="${id}"`);
    }
    for (const form of ["<DisplayNameForm", "<ChangeEmailForm", "<ChangePasswordForm", "<DeleteAccountForm", "<NotificationPreferencesForm"]) {
      expect(src).toContain(form);
    }
  });

  it("the overview no longer carries password, e-mail or deletion forms", () => {
    const overview = read("src/app/account/page.tsx");
    for (const form of ["ChangeEmailForm", "ChangePasswordForm", "DeleteAccountForm", "DisplayNameForm"]) {
      expect(overview).not.toContain(form);
    }
  });

  it("reuses ThemeToggle instead of duplicating theme logic", () => {
    expect(src).toContain('from "@/components/site/theme-toggle"');
    expect(src).toContain("<ThemeToggle");
    expect(src).not.toContain("localStorage");
  });
});
