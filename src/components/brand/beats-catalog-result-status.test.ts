import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { beatsCatalogResultStatusMessage } from "@/components/brand/beats-catalog-client";

describe("BeatsCatalogClient result status — source contract", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/brand/beats-catalog-client.tsx"),
    "utf8",
  );

  it("exposes polite atomic live region (pattern: brd-input-monitor)", () => {
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/aria-atomic="true"/);
    expect(src).toMatch(/className="sr-only"/);
  });

  it("hides visible meta count from AT (aria-hidden on count paragraph)", () => {
    expect(src).toContain("formatBeatCountLabel");
    const metaBlock = src.match(
      /aria-hidden[\s\S]*?\{count, plural, one \{# bit\}/,
    );
    expect(metaBlock?.[0]).toBeTruthy();
  });

  it("renders live message from filtered/total counts (stable string skips re-announce)", () => {
    expect(src).toContain("beatsCatalogResultStatusMessage(");
    expect(src).toContain("filtered.length");
    expect(src).toMatch(/const liveResultStatus = beatsCatalogResultStatusMessage/);
    expect(src).toMatch(/\{liveResultStatus\}/);
  });

  it("beatsCatalogResultStatusMessage — pluralization and filtered subset", () => {
    expect(beatsCatalogResultStatusMessage(1, 3)).toBe("1 bit · z 3");
    expect(beatsCatalogResultStatusMessage(2, 2)).toBe("2 bity");
    expect(beatsCatalogResultStatusMessage(2, 5)).toBe("2 bity · z 5");
    expect(beatsCatalogResultStatusMessage(3, 3)).toBe("3 bity");
    expect(beatsCatalogResultStatusMessage(4, 10)).toBe("4 bity · z 10");
    expect(beatsCatalogResultStatusMessage(5, 5)).toBe("5 bitów");
    expect(beatsCatalogResultStatusMessage(12, 20)).toBe("12 bitów · z 20");
    expect(beatsCatalogResultStatusMessage(21, 21)).toBe("21 bitów");
    expect(beatsCatalogResultStatusMessage(22, 22)).toBe("22 bity");
    expect(beatsCatalogResultStatusMessage(24, 30)).toBe("24 bity · z 30");
    expect(beatsCatalogResultStatusMessage(0, 5)).toBe(
      "Cicho. Brak bitów dla tych filtrów.",
    );
  });

  it("uses formatBeatCountLabel for live status count label", () => {
    // UI passes the locale-aware plural (messages beats.count.count);
    // the default copy keeps formatBeatCountLabel.
    expect(src).toMatch(/count: formatBeatCountLabel/);
  });
});
