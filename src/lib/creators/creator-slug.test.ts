import { describe, expect, it } from "vitest";

import { creatorPath, creatorSlug, publicIdFromBytes, publicIdFromSlug, slugifyKsywka } from "./creator-slug";

const ID = "abcde23456";

describe("creator address", () => {
  it("makes a plain slug from a ksywka", () => {
    expect(slugifyKsywka("Żółty MC_2")).toBe("zolty-mc-2");
    expect(slugifyKsywka("ŁÓDŹ ąęśćńźż")).toBe("lodz-aescnzz");
    expect(slugifyKsywka("  --x--  ")).toBe("x");
    expect(slugifyKsywka("Привет")).toBe("");
    expect(slugifyKsywka("../../<script>")).toBe("script");
    expect(slugifyKsywka("a".repeat(90))).toHaveLength(40);
  });
  it("id first, ksywka after it; no ksywka means no address", () => {
    expect(creatorSlug(ID, "Żółty MC")).toBe(`${ID}-zolty-mc`);
    expect(creatorSlug(ID, "Привет")).toBe(ID);
    expect(creatorSlug(ID, "   ")).toBeNull();
    expect(creatorPath(null, "Żółty")).toBeNull();
    expect(creatorPath(ID, "Żółty")).toBe(`/tworca/${ID}-zolty`);
  });
  it("resolves by the id only, whatever the rest says", () => {
    expect(publicIdFromSlug(`${ID}-zolty`)).toBe(ID);
    expect(publicIdFromSlug(`${ID}-stara-ksywka`)).toBe(ID);
    expect(publicIdFromSlug(ID)).toBe(ID);
    for (const bad of ["", "12", "1-zolty", `${ID}zolty`, ID.toUpperCase(), `${ID}-${"x".repeat(200)}`, `${ID}/x`, "abcdel2345", "0b7f3c1e-6c1a-4e57-9a62-1d2c3b4a5f60"]) {
      expect(publicIdFromSlug(bad), bad).toBeNull();
    }
  });
  it("random ids fit the pattern", () => {
    for (let i = 0; i < 256; i += 5) {
      const id = publicIdFromBytes(new Uint8Array(10).fill(i));
      expect(publicIdFromSlug(id)).toBe(id);
      expect(id).toMatch(/^[a-z2-9]{10}$/);
    }
  });
});
