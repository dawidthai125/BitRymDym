import { describe, expect, it } from "vitest";

import {
  interpretSignUpResult,
  SIGNUP_PENDING_NEUTRAL_MESSAGE,
} from "@/lib/auth/signup-result";
import { getAuthEmailRedirectTo } from "@/lib/site-url";

describe("interpretSignUpResult", () => {
  it("returns error state when signUp fails", () => {
    const result = interpretSignUpResult({
      error: { message: "Signup failed" },
      session: null,
      identities: [],
    });
    expect(result).toEqual({ kind: "error", error: "Signup failed" });
  });

  it("redirects only when a real session exists", () => {
    const result = interpretSignUpResult({
      error: null,
      session: { access_token: "x" },
      identities: [{ id: "1" }],
    });
    expect(result).toEqual({ kind: "session" });
  });

  it("new email without session: pending confirmation message, no session kind", () => {
    const result = interpretSignUpResult({
      error: null,
      session: null,
      identities: [{ provider: "email" }],
    });
    expect(result.kind).toBe("pending_confirmation");
    if (result.kind === "pending_confirmation") {
      expect(result.message).toBe(SIGNUP_PENDING_NEUTRAL_MESSAGE);
      expect(result.message.toLowerCase()).toMatch(/skrzynk|e-mail|email/);
    }
  });

  it("confirmed duplicate (empty identities): same neutral message (anti-enumeration)", () => {
    const fresh = interpretSignUpResult({
      error: null,
      session: null,
      identities: [{ provider: "email" }],
    });
    const duplicate = interpretSignUpResult({
      error: null,
      session: null,
      identities: [],
    });
    expect(fresh).toEqual(duplicate);
    expect(duplicate.kind).toBe("pending_confirmation");
    if (duplicate.kind === "pending_confirmation") {
      expect(duplicate.message).toBe(SIGNUP_PENDING_NEUTRAL_MESSAGE);
      expect(duplicate.message.toLowerCase()).not.toMatch(
        /already registered|email zajęty|email already/,
      );
    }
  });

  it("does not treat error=null alone as authenticated session", () => {
    const result = interpretSignUpResult({
      error: null,
      session: null,
      identities: [],
    });
    expect(result.kind).not.toBe("session");
  });
});

describe("signup emailRedirectTo contract", () => {
  it("keeps canonical production redirect via getAuthEmailRedirectTo (/auth/callback)", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://bitrymdym.pl";
    try {
      expect(getAuthEmailRedirectTo()).toBe(
        "https://bitrymdym.pl/auth/callback",
      );
      expect(getAuthEmailRedirectTo()).not.toContain("vercel.app");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});
