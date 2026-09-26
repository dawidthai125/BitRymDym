import { describe, expect, it } from "vitest";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  confirmationStatusFromAuthError,
  CONFIRMATION_COPY,
  CONFIRMATION_EMAIL_CALLBACK_PATH,
  POST_CONFIRMATION_IDENTITY,
  parseConfirmationStatus,
} from "@/lib/auth/confirmation";
import {
  interpretSignUpResult,
  SIGNUP_PENDING_NEUTRAL_MESSAGE,
} from "@/lib/auth/signup-result";
import { getAuthEmailRedirectTo } from "@/lib/site-url";

describe("token_hash + type=signup (cross-browser)", () => {
  it("prefers otp/verifyOtp params over PKCE code when both present", () => {
    const result = classifyAuthCallbackParams({
      code: "pkce-code",
      tokenHash: "hash-value",
      type: "signup",
    });
    expect(result).toEqual({
      kind: "otp",
      tokenHash: "hash-value",
      type: "signup",
    });
  });

  it("classifies signup token_hash for verifyOtp success path", () => {
    const result = classifyAuthCallbackParams({
      code: null,
      tokenHash: "hash-value",
      type: "signup",
    });
    expect(result.kind).toBe("otp");
    if (result.kind === "otp") {
      expect(result.type).toBe("signup");
      expect(result.tokenHash).toBe("hash-value");
    }
    expect(confirmationResultPath("success")).toBe(
      "/auth/confirmed?status=success",
    );
  });
});

describe("invalid / expired token_hash", () => {
  it("maps invalid token errors to invalid status", () => {
    expect(
      confirmationStatusFromAuthError("Token has expired or is invalid"),
    ).toBe("invalid");
    expect(confirmationStatusFromAuthError("invalid token")).toBe("invalid");
    expect(CONFIRMATION_COPY.invalid.body).toMatch(/nieprawidłowy|wygasł/i);
    expect(confirmationResultPath("invalid")).toBe(
      "/auth/confirmed?status=invalid",
    );
  });

  it("maps expired OTP errors to invalid status", () => {
    expect(confirmationStatusFromAuthError("otp_expired")).toBe("invalid");
    expect(confirmationStatusFromAuthError("Email link is invalid or has expired")).toBe(
      "invalid",
    );
  });
});

describe("missing / incomplete callback params", () => {
  it("classifies fully missing params as missing", () => {
    expect(
      classifyAuthCallbackParams({
        code: null,
        tokenHash: null,
        type: null,
      }),
    ).toEqual({ kind: "missing" });
  });

  it("treats token_hash without type as missing (no detail leak)", () => {
    expect(
      classifyAuthCallbackParams({
        code: null,
        tokenHash: "orphaned-hash",
        type: null,
      }),
    ).toEqual({ kind: "missing" });
  });

  it("treats type without token_hash as missing", () => {
    expect(
      classifyAuthCallbackParams({
        code: null,
        tokenHash: null,
        type: "signup",
      }),
    ).toEqual({ kind: "missing" });
  });

  it("falls back unknown status to safe error copy", () => {
    expect(parseConfirmationStatus("nope")).toBe("error");
    expect(parseConfirmationStatus(undefined)).toBe("error");
    expect(confirmationStatusFromAuthError("connection refused")).toBe("error");
    expect(CONFIRMATION_COPY.error.body).not.toMatch(/supabase|jwt/i);
  });
});

describe("PKCE code flow preserved", () => {
  it("classifies code-only as pkce (no token_hash)", () => {
    expect(
      classifyAuthCallbackParams({
        code: "abc",
        tokenHash: null,
        type: null,
      }),
    ).toEqual({ kind: "pkce", code: "abc" });
  });

  it("maps PKCE verifier mismatch to invalid (no raw leak)", () => {
    expect(
      confirmationStatusFromAuthError(
        "code challenge does not match previously saved code verifier",
      ),
    ).toBe("invalid");
    expect(confirmationStatusFromAuthError("bad_code_verifier")).toBe("invalid");
  });
});

describe("success page Polish copy", () => {
  it("exposes activation title, body, and sign-in CTA contract", () => {
    expect(CONFIRMATION_COPY.success.title).toBe("Konto zostało aktywowane!");
    expect(CONFIRMATION_COPY.success.body).toMatch(/potwierdzony/i);
    expect(CONFIRMATION_COPY.success.body).toMatch(/zalogować/i);
    expect(confirmationResultPath("success")).toContain("/auth/confirmed");
  });
});

describe("signup anti-enumeration unchanged", () => {
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

describe("post-confirmation identity (OD-19)", () => {
  it("defaults remain USER + BEGINNER_RAPPER with no ADMIN", () => {
    expect(POST_CONFIRMATION_IDENTITY.role).toBe("USER");
    expect(POST_CONFIRMATION_IDENTITY.accountLevel).toBe("BEGINNER_RAPPER");
    expect(POST_CONFIRMATION_IDENTITY.role).not.toBe("ADMIN");
  });
});

describe("email template callback contract", () => {
  it("uses token_hash template path, not ConfirmationURL", () => {
    expect(CONFIRMATION_EMAIL_CALLBACK_PATH).toContain("token_hash={{ .TokenHash }}");
    expect(CONFIRMATION_EMAIL_CALLBACK_PATH).toContain("type=signup");
    expect(CONFIRMATION_EMAIL_CALLBACK_PATH).not.toContain("ConfirmationURL");
  });

  it("keeps app emailRedirectTo at /auth/callback", () => {
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
