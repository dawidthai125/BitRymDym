import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("homepage plans and how it works", () => {
  const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const pl = JSON.parse(readFileSync(join(process.cwd(), "messages/pl.json"), "utf8")) as {
    home: { page: Record<string, unknown> & { consts: Record<string, string> } };
  };
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8")) as {
    home: { page: Record<string, unknown> & { consts: Record<string, string> } };
  };

  it("draws the plan table from PLAN_POLICY, not from baked caps", () => {
    expect(page).toContain("PLAN_POLICY");
    expect(page).toContain("GUEST_POLICY");
    expect(page).toContain('data-testid="home-plan-board"');
    expect(page).toContain("maxStems");
    expect(page).toContain("youtubeVideosPerWeek");
    expect(page).toContain("manualNotes");
    expect(page).not.toContain("vocal separation");
  });

  it("keeps the film, then lists the studio steps", () => {
    const section = page.slice(
      page.indexOf('id="jak-to-dziala"'),
      page.indexOf('aria-labelledby="home-premium"'),
    );
    expect(section.indexOf("<HomePromoFilm")).toBeGreaterThan(section.indexOf("<h2"));
    expect(section.indexOf("<ol")).toBeGreaterThan(section.indexOf("<HomePromoFilm"));
    expect(section).toContain("steps.map");
    for (const key of ["stemy", "automatykaNuty", "mixIMaster", "oddajPlik", "krokAutomatyka", "krokMix"]) {
      expect(pl.home.page.consts[key]?.length).toBeGreaterThan(3);
      expect(en.home.page.consts[key]?.length).toBeGreaterThan(3);
    }
  });

  it("has the same plan labels in Polish and English", () => {
    for (const key of ["krokBit", "krokStemy", "planWspolne", "planTabelaAria", "planCenaPlatna"]) {
      expect(typeof pl.home.page[key]).toBe("string");
      expect(typeof en.home.page[key]).toBe("string");
    }
  });
});
