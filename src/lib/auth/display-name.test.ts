import { describe, expect, it } from "vitest";

import {
  ANONYMIZED_PUBLIC_AUTHOR,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  validateDisplayName,
} from "@/lib/auth/display-name";

describe("validateDisplayName (ACCOUNT/PROFILE-01)", () => {
  it("requires ksywka", () => {
    expect(validateDisplayName("").ok).toBe(false);
    expect(validateDisplayName(null).ok).toBe(false);
    expect(validateDisplayName("   ").ok).toBe(false);
  });

  it("accepts valid ksywka", () => {
    const r = validateDisplayName("Tajski");
    expect(r).toEqual({ ok: true, value: "Tajski" });
  });

  it("trims whitespace", () => {
    expect(validateDisplayName("  Mira  ")).toEqual({
      ok: true,
      value: "Mira",
    });
  });

  it("rejects shorter than min", () => {
    expect(validateDisplayName("Ab").ok).toBe(false);
  });

  it("rejects longer than max", () => {
    expect(validateDisplayName("x".repeat(DISPLAY_NAME_MAX + 1)).ok).toBe(
      false,
    );
  });

  it("allows PL letters, digits, spaces, _ and -", () => {
    expect(validateDisplayName("Żółć_Rap-99").ok).toBe(true);
    expect(validateDisplayName("Mira Beats").ok).toBe(true);
  });

  it("rejects HTML / angle brackets and control chars", () => {
    expect(validateDisplayName("<script>").ok).toBe(false);
    expect(validateDisplayName("foo>bar").ok).toBe(false);
    expect(validateDisplayName("a\nb").ok).toBe(false);
  });

  it("rejects other punctuation", () => {
    expect(validateDisplayName("foo@bar").ok).toBe(false);
    expect(validateDisplayName("foo.bar").ok).toBe(false);
  });

  it("allows duplicate-shaped names (no uniqueness at validation)", () => {
    expect(validateDisplayName("Dawid").ok).toBe(true);
    expect(validateDisplayName("Dawid").ok).toBe(true);
  });

  it("exposes anonymized public author constant", () => {
    expect(ANONYMIZED_PUBLIC_AUTHOR.length).toBeGreaterThanOrEqual(
      DISPLAY_NAME_MIN,
    );
  });
});
