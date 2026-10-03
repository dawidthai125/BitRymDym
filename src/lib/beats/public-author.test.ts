import { describe, expect, it } from "vitest";

import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";
import { resolvePublicAuthor } from "@/lib/beats/public-author-resolve";

describe("resolvePublicAuthor (OTD-ACCOUNT-02)", () => {
  it("uses profiles.display_name for living USER owner", () => {
    expect(
      resolvePublicAuthor({
        ownershipType: "USER",
        ownerId: "u1",
        producer: "Old Producer",
        ownerDisplayName: "Tajski",
      }),
    ).toBe("Tajski");
  });

  it("falls back to producer when profile name missing", () => {
    expect(
      resolvePublicAuthor({
        ownershipType: "USER",
        ownerId: "u1",
        producer: "Legacy",
        ownerDisplayName: null,
      }),
    ).toBe("Legacy");
  });

  it("uses anonymized / producer for retained USER with null owner", () => {
    expect(
      resolvePublicAuthor({
        ownershipType: "USER",
        ownerId: null,
        producer: ANONYMIZED_PUBLIC_AUTHOR,
        ownerDisplayName: null,
      }),
    ).toBe(ANONYMIZED_PUBLIC_AUTHOR);
  });

  it("keeps PLATFORM producer as-is", () => {
    expect(
      resolvePublicAuthor({
        ownershipType: "PLATFORM",
        ownerId: null,
        producer: "BitRymDym",
        ownerDisplayName: "Ignored",
      }),
    ).toBe("BitRymDym");
  });

  it("never invents email or user_number", () => {
    const label = resolvePublicAuthor({
      ownershipType: "USER",
      ownerId: "u1",
      producer: null,
      ownerDisplayName: "Mira",
    });
    expect(label).not.toContain("@");
    expect(label).not.toMatch(/ID:\s*\d/);
  });
});
