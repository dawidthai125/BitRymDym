import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Sample promo film", () => {
  it("embeds the Sample how-it-works film on /sampel", () => {
    const page = readFileSync(join(process.cwd(), "src/app/sampel/(katalog)/page.tsx"), "utf8");
    const film = readFileSync(
      join(process.cwd(), "src/components/community/sample-promo-film.tsx"),
      "utf8",
    );
    expect(page).toContain("SamplePromoFilm");
    expect(film).toContain('src="/promo/sample-jak-dziala-v2.mp4"');
    expect(film).toContain('poster="/promo/sample-jak-dziala-v2-poster.jpg"');
    expect(film).toContain('id="jak-dziala-sample"');
  });

  it("keeps the promo assets in public/promo", () => {
    const mp4 = statSync(join(process.cwd(), "public/promo/sample-jak-dziala-v2.mp4"));
    const poster = statSync(
      join(process.cwd(), "public/promo/sample-jak-dziala-v2-poster.jpg"),
    );
    expect(mp4.size).toBeGreaterThan(500_000);
    expect(poster.size).toBeGreaterThan(5_000);
  });
});
