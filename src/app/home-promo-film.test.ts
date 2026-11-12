import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("homepage Jak to działa promo film", () => {
  const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const film = readFileSync(
    join(process.cwd(), "src/components/home/home-promo-film.tsx"),
    "utf8",
  );
  const section = page.slice(
    page.indexOf('id="jak-to-dziala"'),
    page.indexOf('aria-labelledby="home-premium"'),
  );

  it("sits under the heading and above the steps, click to play", () => {
    const heading = section.indexOf("<h2");
    const player = section.indexOf("<HomePromoFilm");
    const steps = section.indexOf("<ol");
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(player).toBeGreaterThan(heading);
    expect(steps).toBeGreaterThan(player);
    expect(film).toContain('src="/promo/jak-to-dziala.mp4"');
    expect(film).toContain('type="video/mp4"');
    expect(film).toContain("controls");
    expect(film).toContain("playsInline");
    expect(film).toContain('preload="metadata"');
    expect(film).toContain('poster="/promo/jak-to-dziala-poster.jpg"');
    // Source reads are resolved by src/test/intl-test-mocks.ts: t("key") may arrive as the pl copy.
    const copy = JSON.parse(
      readFileSync(join(process.cwd(), "messages/pl.json"), "utf8"),
    ).home.page as Record<string, string>;
    const wired = (key: string) =>
      film.includes(`{t("${key}")}`) || film.includes(copy[key]);
    expect(
      film.includes('aria-label={t("promoFilm")}') ||
        film.includes(`aria-label="${copy.promoFilm}"`),
    ).toBe(true);
    expect(wired("promoPodpis")).toBe(true);
    expect(wired("promoDeck")).toBe(true);
    expect(wired("promoLeci")).toBe(true);
    expect(`${section}\n${film}`).not.toMatch(/\bautoPlay\b|\bautoplay\b/);
  });

  it("pauses the catalog when the film starts, and the film when a beat plays", () => {
    expect(film).toContain('phase === "playing"');
    expect(film).toContain("player.toggle()");
    expect(film).toContain("video.pause()");
    expect(film).toContain('aria-hidden="true"');
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
    ) as {
      home: {
        page: {
          promoFilm: string;
          promoPodpis: string;
          promoDeck: string;
          promoLeci: string;
          promoStop: string;
        };
      };
    };
    const en = JSON.parse(
      readFileSync(join(process.cwd(), "messages/en.json"), "utf8"),
    ) as {
      home: {
        page: {
          promoFilm: string;
          promoPodpis: string;
          promoDeck: string;
          promoLeci: string;
          promoStop: string;
        };
      };
    };
    for (const key of [
      "promoFilm",
      "promoPodpis",
      "promoDeck",
      "promoLeci",
      "promoStop",
    ] as const) {
      expect(pl.home.page[key].length, key).toBeGreaterThan(0);
      expect(en.home.page[key].length, key).toBeGreaterThan(0);
    }
    expect(pl.home.page.promoPodpis).toMatch(/BITEK/);
    expect(pl.home.page.promoPodpis).toMatch(/Windows/);
    expect(pl.home.page.promoPodpis).toMatch(/Mac/);
    expect(en.home.page.promoPodpis).toMatch(/BITEK/);
  });
});
