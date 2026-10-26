import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Header chrome touch targets — MOBILE_DEEP / product audit P2 residual
 * (header search was min-h-10 = 40px; project CTA standard is min-h-11).
 */
describe("header search + account menu touch targets", () => {
  const root = process.cwd();

  it("HeaderSearch input uses min-h-11, not min-h-10", () => {
    const src = readFileSync(
      join(root, "src/components/site/header-search.tsx"),
      "utf8",
    );
    expect(src).toMatch(/(?:^|\s|")min-h-11(?:\s|"|$)/);
    expect(src).not.toMatch(/(?:^|\s|")min-h-10(?:\s|"|$)/);
  });

  it("UserMenu nav links and Wyloguj expose min-h-11 hit area", () => {
    const src = readFileSync(
      join(root, "src/components/site/user-menu.tsx"),
      "utf8",
    );
    const navLinkClass = src.match(
      /function AccountNavLink[\s\S]*?className=\{cn\(\s*"([^"]*)"/,
    );
    expect(navLinkClass?.[1]).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);

    const logoutClass = src.match(
      /type="submit"\s+className=\{cn\(\s*"([^"]*)"/,
    );
    expect(logoutClass?.[1]).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
  });
});
