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
    const metaBlock = src.match(
      /aria-hidden[\s\S]*?filtered\.length === 1 \? "1 bit"/,
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
    expect(beatsCatalogResultStatusMessage(2, 2)).toBe("2 bitów");
    expect(beatsCatalogResultStatusMessage(0, 5)).toBe(
      "Cicho. Brak bitów dla tych filtrów.",
    );
  });
});
