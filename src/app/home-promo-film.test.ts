import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("homepage Jak to działa promo film", () => {
  const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const section = page.slice(
    page.indexOf('id="jak-to-dziala"'),
    page.indexOf('aria-labelledby="home-premium"'),
  );

  it("sits under the heading and above the steps, click to play", () => {
    const heading = section.indexOf("<h2");
    const video = section.indexOf("<video");
    const steps = section.indexOf("<ol");
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(video).toBeGreaterThan(heading);
    expect(steps).toBeGreaterThan(video);
    expect(section).toContain('src="/promo/jak-to-dziala.mp4"');
    expect(section).toContain('type="video/mp4"');
    expect(section).toContain("controls");
    expect(section).toContain("playsInline");
    expect(section).toContain('preload="metadata"');
    expect(section).toContain('poster="/promo/jak-to-dziala-poster.jpg"');
    expect(section).toContain('aria-label="Film: bit, nagranie, studio"');
    expect(section).toContain(
      "Bit, nagranie i studio. BITEK wchodzi do mixu i masteru dopiero, gdy o to poprosisz.",
    );
    expect(section).not.toMatch(/\bautoPlay\b|\bautoplay\b/);
  });

  it("ships a real mp4 and a jpeg poster", () => {
    const mp4 = statSync(join(process.cwd(), "public/promo/jak-to-dziala.mp4"));
    const poster = readFileSync(
      join(process.cwd(), "public/promo/jak-to-dziala-poster.jpg"),
    );
    expect(mp4.size).toBeGreaterThan(100_000);
    expect(poster[0]).toBe(0xff);
    expect(poster[1]).toBe(0xd8);
    expect(poster.length).toBeGreaterThan(20_000);
  });

  it("keeps the caption in Polish and English", () => {
    const pl = JSON.parse(
      readFileSync(join(process.cwd(), "messages/pl.json"), "utf8"),
    ) as { home: { page: { promoFilm: string; promoPodpis: string } } };
    const en = JSON.parse(
      readFileSync(join(process.cwd(), "messages/en.json"), "utf8"),
    ) as { home: { page: { promoFilm: string; promoPodpis: string } } };
    expect(pl.home.page.promoFilm.length).toBeGreaterThan(0);
    expect(en.home.page.promoFilm.length).toBeGreaterThan(0);
    expect(pl.home.page.promoPodpis).toMatch(/BITEK/);
    expect(en.home.page.promoPodpis).toMatch(/BITEK/);
  });
});
