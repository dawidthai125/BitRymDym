import { describe, expect, it } from "vitest";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  confirmationStatusFromAuthError,
  CONFIRMATION_COPY,
  parseConfirmationStatus,
} from "@/lib/auth/confirmation";
import {
  interpretSignUpResult,
  SIGNUP_PENDING_NEUTRAL_MESSAGE,
} from "@/lib/auth/signup-result";
import { getAuthEmailRedirectTo } from "@/lib/site-url";

describe("confirmation success UX", () => {
  it("exposes Polish success copy and sign-in CTA path", () => {
    expect(CONFIRMATION_COPY.success.title).toBe("Konto zostało aktywowane!");
    expect(CONFIRMATION_COPY.success.body).toMatch(/potwierdzony/i);
    expect(CONFIRMATION_COPY.success.body).toMatch(/zalogować/i);
    expect(confirmationResultPath("success")).toBe(
      "/auth/confirmed?status=success",
    );
  });
});

describe("invalid / expired confirmation", () => {
  it("maps expired/invalid Auth errors to invalid status with Polish copy", () => {
    expect(confirmationStatusFromAuthError("Token has expired or is invalid")).toBe(
      "invalid",
    );
    expect(confirmationStatusFromAuthError("otp_expired")).toBe("invalid");
    expect(CONFIRMATION_COPY.invalid.body).toMatch(/nieprawidłowy|wygasł/i);
    expect(confirmationResultPath("invalid")).toBe(
      "/auth/confirmed?status=invalid",
    );
  });
});

describe("callback error / missing params", () => {
  it("classifies missing callback params", () => {
    expect(
      classifyAuthCallbackParams({
        code: null,
        tokenHash: null,
        type: null,
      }),
    ).toEqual({ kind: "missing" });
  });

  it("classifies PKCE code without exposing other secrets", () => {
    expect(
      classifyAuthCallbackParams({
        code: "abc",
        tokenHash: "should-not-prefer",
        type: "signup",
      }),
    ).toEqual({ kind: "pkce", code: "abc" });
  });

  it("classifies OTP token_hash + type", () => {
    expect(
      classifyAuthCallbackParams({
        code: null,
        tokenHash: "hash",
        type: "signup",
      }),
    ).toEqual({ kind: "otp", tokenHash: "hash", type: "signup" });
  });

  it("falls back unknown status to safe error copy", () => {
    expect(parseConfirmationStatus("nope")).toBe("error");
    expect(parseConfirmationStatus(undefined)).toBe("error");
    expect(confirmationStatusFromAuthError("connection refused")).toBe("error");
    expect(CONFIRMATION_COPY.error.body).not.toMatch(/supabase|token|jwt/i);
  });
});

describe("sign-in CTA contract", () => {
  it("success path is a confirmed page that links to /sign-in in UI copy contract", () => {
    expect(confirmationResultPath("success")).toContain("/auth/confirmed");
    expect(CONFIRMATION_COPY.success.body.toLowerCase()).toContain("zalogować");
  });
});

describe("signup without session (anti-enumeration preserved)", () => {
  it("pending confirmation stays on signup UX message, not session", () => {
    const result = interpretSignUpResult({
      error: null,
      session: null,
      identities: [{ provider: "email" }],
    });
    expect(result.kind).toBe("pending_confirmation");
    if (result.kind === "pending_confirmation") {
      expect(result.message).toBe(SIGNUP_PENDING_NEUTRAL_MESSAGE);
    }
  });

  it("duplicate confirmed email uses same neutral message", () => {
    const a = interpretSignUpResult({
      error: null,
      session: null,
      identities: [{ provider: "email" }],
    });
    const b = interpretSignUpResult({
      error: null,
      session: null,
      identities: [],
    });
    expect(a).toEqual(b);
  });
});

describe("emailRedirectTo contract", () => {
  it("points canonical production redirect at /auth/callback", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://bitrymdym.pl";
    try {
      expect(getAuthEmailRedirectTo()).toBe(
        "https://bitrymdym.pl/auth/callback",
      );
      expect(getAuthEmailRedirectTo()).not.toContain("vercel.app");
      expect(getAuthEmailRedirectTo()).not.toMatch(/\/account$/);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});
