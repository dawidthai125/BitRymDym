import { describe, expect, it } from "vitest";

import {
  mapPasswordProviderError,
  PASSWORD_LEAKED_ERROR,
  PASSWORD_SAME_AS_OLD_ERROR,
  PASSWORD_TOO_LONG_ERROR,
  PASSWORD_TOO_SHORT_ERROR,
  PASSWORD_TOO_SIMPLE_ERROR,
  passwordChecks,
  validateNewPassword,
} from "@/lib/auth/password-policy";

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

describe("password rules shown to the user", () => {
  it("reports each rule on its own", () => {
    expect(passwordChecks("abc", "")).toEqual({ length: false, notTooLong: true, match: false });
    expect(passwordChecks("longenough", "longenough")).toEqual({ length: true, notTooLong: true, match: true });
    expect(passwordChecks("ą".repeat(37), "").notTooLong).toBe(false);
  });

  it("refuses more than 72 bytes before calling the provider", () => {
    const p = "ą".repeat(37);
    expect(validateNewPassword(p, p)).toEqual({ ok: false, error: PASSWORD_TOO_LONG_ERROR });
  });

  it("says what is wrong for every provider answer", () => {
    expect(mapPasswordProviderError("Password is known to be weak and easy to guess, please choose a different one.")).toBe(PASSWORD_LEAKED_ERROR);
    expect(mapPasswordProviderError("Password should contain at least one character of each: abc, ABC, 0123456789")).toBe(PASSWORD_TOO_SIMPLE_ERROR);
    expect(mapPasswordProviderError("Password should be at least 8 characters.")).toBe(PASSWORD_TOO_SHORT_ERROR);
    expect(mapPasswordProviderError("Password cannot be longer than 72 characters")).toBe(PASSWORD_TOO_LONG_ERROR);
    expect(mapPasswordProviderError("New password should be different from the old password.")).toBe(PASSWORD_SAME_AS_OLD_ERROR);
    expect(mapPasswordProviderError("Invalid login credentials")).toBeNull();
  });
});
