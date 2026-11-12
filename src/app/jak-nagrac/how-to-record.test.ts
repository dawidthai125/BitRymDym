import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_POLICY } from "@/config/plan-policy";

const read = (p: string) => readFileSync(p, "utf8");
const pl = JSON.parse(read("messages/pl.json")).common;
const en = JSON.parse(read("messages/en.json")).common;

describe("jak-nagrac + licence summary", () => {
  it("messages exist in both languages with the same keys", () => {
    for (const ns of ["licenseSummary", "howToPage"] as const) {
      expect(Object.keys(pl[ns]).sort()).toEqual(Object.keys(en[ns]).sort());
    }
    expect(Object.keys(pl.licenseSummary.wiersz).sort()).toEqual(
      Object.keys(en.licenseSummary.wiersz).sort(),
    );
  });
  it("licence summary reflects terms §7: credit allowed, Content ID needs consent", () => {
    const terms = read("src/content/legal/terms.ts");
    expect(terms).toContain("Content ID");
    expect(pl.licenseSummary.wiersz.contentId).toMatch(/Content ID/);
    expect(pl.licenseSummary.wiersz.kredyt).toMatch(/prod\./);
  });
  it("plan table reads plan-policy, not hard-coded numbers", () => {
    const page = read("src/app/jak-nagrac/page.tsx");
    expect(page).toContain("PLAN_POLICY[tier]");
    expect(PLAN_POLICY.FREE.recording.sessionsPerDay).toBeGreaterThan(0);
  });
  it("page is linked from sitemap, footer and the beat page", () => {
    expect(read("src/app/sitemap.ts")).toContain("/jak-nagrac");
    expect(read("src/components/site/site-footer.tsx")).toContain("/jak-nagrac");
    expect(read("src/app/beat/[id]/page.tsx")).toContain("<LicenseSummary");
  });
  it("record panel shows plan limits from plan-policy", () => {
    expect(read("src/components/studio/studio-recording-panel.tsx")).toContain("studio-record-plan-limits");
    expect(read("src/components/studio/studio-editor.tsx")).toContain("PLAN_POLICY[trackCapacity.premiumTier].recording.sessionsPerDay");
  });
});

describe("jak-nagrac vs home: no duplicated steps", () => {
  it("guide points to the home section instead of repeating the steps", () => {
    const page = read("src/app/jak-nagrac/page.tsx");
    expect(page).toContain('href="/#jak-to-dziala"');
    expect(page).not.toContain("krok1");
    expect(read("src/app/page.tsx")).toContain("/jak-nagrac");
    expect(read("src/app/page.tsx")).toContain('id="jak-to-dziala"');
  });
});

describe("simple record view: pick the best take", () => {
  const panel = read("src/components/studio/studio-recording-panel.tsx");
  it("list is open by default in the simple view, same-beat takes only, numbered, max 6", () => {
    expect(panel).toContain("useState(simple)");
    expect(panel).toContain("filter((t) => t.sameBeat)");
    expect(panel).toContain(".slice(0, 6)");
    expect(panel).toContain('tr("ujecieNr"');
  });
  it("reloads after a take is kept or discarded (phase/takeId signature)", () => {
    expect(panel).toContain("simpleTakeSig");
  });
  it("copy exists in PL and EN", () => {
    for (const m of [pl, en]) {
      expect(read("messages/pl.json")).toContain("ujecieNr");
      expect(read("messages/en.json")).toContain("ujecieNr");
      void m;
    }
  });
});

describe("Free watermark copy (flag-driven)", () => {
  it("premium, home and guide switch on the same flag", () => {
    for (const f of ["src/app/premium/page.tsx", "src/app/page.tsx", "src/app/jak-nagrac/page.tsx"]) {
      expect(read(f)).toContain("freeWatermarkDownloadEnabled()");
    }
  });
  it("terms §7 carries the Free watermark clause and the version moved", () => {
    expect(read("src/content/legal/terms.ts")).toContain("Plik ze znakiem wodnym (Plan Free");
    expect(read("src/lib/legal/legal-config.ts")).toContain('TERMS_VERSION = "2026-11-12.1"');
  });
});
