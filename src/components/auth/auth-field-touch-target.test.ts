import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";

describe("auth / home touch targets (MOBILE_DEEP + product audit P2)", () => {
  const root = process.cwd();

  it("AUTH_FIELD_CLASS enforces min-h-11 (44px project target)", () => {
    expect(AUTH_FIELD_CLASS).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
  });

  it("every auth text input uses AUTH_FIELD_CLASS (no stray field chrome)", () => {
    const files = [
      "src/components/auth/auth-forms.tsx",
      "src/components/auth/display-name-form.tsx",
    ] as const;

    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      const inputs = [...src.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0]!);
      expect(inputs.length, `${rel} should declare text inputs`).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(input).toContain("className={AUTH_FIELD_CLASS}");
      }
      const fieldUsages = [...src.matchAll(/className=\{AUTH_FIELD_CLASS\}/g)];
      expect(fieldUsages.length).toBe(inputs.length);
      expect(src).not.toMatch(
        /className=["'`][^"'`]*\bpy-2\b[^"'`]*["'`]/,
      );
    }
  });


  it("home Pełny spis catalog link has min-h-11 hit area", () => {
    const home = readFileSync(join(root, "src/app/page.tsx"), "utf8");
    const catalogLink = home.match(
      /href="\/beats"\s+className="([^"]*)"[\s\S]*?Pełny spis/,
    );
    expect(catalogLink).toBeTruthy();
    expect(catalogLink![1]).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
  });
});

