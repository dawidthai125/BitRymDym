import { readFileSync } from "node:fs";

import plMessages from "../../../messages/pl.json";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings hub (navigation only)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/settings/page.tsx"),
    "utf8",
  );

  it("keeps auth gate and AppShell", () => {
    expect(src).toContain("getCurrentProfile()");
    expect(src).toContain('redirect("/sign-in")');
    expect(src).toContain('AppShell tone="studio"');
  });

  it("states it is a hub to existing settings, not new options", () => {
    expect(src).toMatch(/prowadzi do istniejących ustawień/i);
    expect(src).toMatch(/Nie\s+dodaje nowych opcji/i);
    expect(src).not.toMatch(/kolejnej fali/i);
  });

  it("links only to confirmed working destinations", () => {
    const expected = [
      "/account#profil",
      "/account#security",
      "/account#powiadomienia",
      "/account#danger",
      "/account",
      "/account/takes",
      "/account/beats",
      "/account/downloads",
      "/account/shared",
      "/premium",
    ];
    for (const href of expected) {
      expect(src).toContain(`href: "${href}"`);
    }
    // Do not advertise favorites stub or invent theme route.
    expect(src).not.toContain("/library/favorites");
    expect(src).not.toContain("/settings/theme");
  });

  it("reuses ThemeToggle instead of duplicating theme logic", () => {
    expect(src).toContain('from "@/components/site/theme-toggle"');
    expect(src).toContain("<ThemeToggle");
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("bitrymdym.theme");
  });

  it("does not embed duplicate profile/password forms", () => {
    expect(src).not.toContain("DisplayNameForm");
    expect(src).not.toContain("ChangePasswordForm");
    expect(src).not.toContain("ChangeEmailForm");
    expect(src).not.toContain("DeleteAccountForm");
  });

  it("Premium copy points at the Premium page and does not claim checkout is always on", () => {
    expect(src).toContain("informacjaOPoziomachI");
    const text = plMessages.account.settingsPage.consts.informacjaOPoziomachI;
    expect(text).toMatch(/gdy płatności są włączone/);
    expect(text).not.toMatch(/kup teraz/i);
  });

  it("exposes real h2 headings for theme and link groups", () => {
    expect(src).toMatch(/id="settings-theme"[\s\S]*?>\s*Motyw\s*</);
    expect(src).toContain('aria-labelledby={headingId}');
    expect(src).toMatch(/<h2\b[^>]*\bid=\{headingId\}/);
    expect(src).toContain('"kontoPowiazaneEkrany"');
    expect(plMessages.account.settingsPage.consts.kontoPowiazaneEkrany).toBe(
      "Konto — powiązane ekrany",
    );
  });

  it("account hash destinations still exist on /account", () => {
    const account = readFileSync(
      join(process.cwd(), "src/app/account/page.tsx"),
      "utf8",
    );
    for (const id of ["profil", "security", "danger"] as const) {
      expect(account).toContain(`id="${id}"`);
    }
  });
});
