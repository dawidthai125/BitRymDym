import { describe, expect, it } from "vitest";

import { validateNewPassword } from "@/lib/auth/password-policy";

describe("validateNewPassword", () => {
  it("requires password", () => {
    expect(validateNewPassword("", "").ok).toBe(false);
  });

  it("enforces min length", () => {
    expect(validateNewPassword("short", "short").ok).toBe(false);
  });

  it("requires confirmation match", () => {
    expect(validateNewPassword("longenough", "different1").ok).toBe(false);
  });

  it("accepts valid pair", () => {
    expect(validateNewPassword("longenough", "longenough")).toEqual({
      ok: true,
    });
  });
});
