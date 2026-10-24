import { describe, expect, it } from "vitest";

import {
  BRD_THEME_BOOT_SCRIPT,
  BRD_THEME_STORAGE_KEY,
  isBrdTheme,
  normalizeBrdTheme,
  toggleBrdTheme,
} from "@/lib/ui/theme";

describe("brd theme helpers", () => {
  it("defaults missing/invalid to dark", () => {
    expect(normalizeBrdTheme(null)).toBe("dark");
    expect(normalizeBrdTheme("")).toBe("dark");
    expect(normalizeBrdTheme("system")).toBe("dark");
    expect(normalizeBrdTheme("light")).toBe("light");
    expect(normalizeBrdTheme("dark")).toBe("dark");
  });

  it("type guard and toggle", () => {
    expect(isBrdTheme("dark")).toBe(true);
    expect(isBrdTheme("nope")).toBe(false);
    expect(toggleBrdTheme("dark")).toBe("light");
    expect(toggleBrdTheme("light")).toBe("dark");
  });

  it("boot script references storage key and default dark", () => {
    expect(BRD_THEME_STORAGE_KEY).toBe("bitrymdym.theme");
    expect(BRD_THEME_BOOT_SCRIPT).toContain(BRD_THEME_STORAGE_KEY);
    expect(BRD_THEME_BOOT_SCRIPT).toContain('t="dark"');
    expect(BRD_THEME_BOOT_SCRIPT).toContain("data-theme");
  });
});
