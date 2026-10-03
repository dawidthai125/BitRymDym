import { describe, expect, it } from "vitest";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  confirmationStatusFromAuthError,
  decideAuthCallbackRoute,
  isRecoveryCallback,
  CONFIRMATION_COPY,
  CONFIRMATION_EMAIL_CALLBACK_PATH,
  POST_CONFIRMATION_IDENTITY,
  RECOVERY_CALLBACK_FLOW,
  RECOVERY_EMAIL_CALLBACK_PATH,
  parseConfirmationStatus,
} from "@/lib/auth/confirmation";
import {
  interpretSignUpResult,
  SIGNUP_PENDING_NEUTRAL_MESSAGE,
} from "@/lib/auth/signup-result";
import {
  getAuthEmailRedirectTo,
  getAuthPasswordResetRedirectTo,
} from "@/lib/site-url";

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
  it("classifies code-only as pkce non-recovery (no token_hash)", () => {
    expect(
      classifyAuthCallbackParams({
        code: "abc",
        tokenHash: null,
        type: null,
      }),
    ).toEqual({ kind: "pkce", code: "abc", recovery: false });
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

describe("password recovery callback contract", () => {
  it("classifies OTP recovery (token_hash + type=recovery)", () => {
    const result = classifyAuthCallbackParams({
      code: null,
      tokenHash: "rec-hash",
      type: "recovery",
    });
    expect(result).toEqual({
      kind: "otp",
      tokenHash: "rec-hash",
      type: "recovery",
    });
    expect(isRecoveryCallback(result)).toBe(true);
  });

  it("classifies PKCE recovery via flow=recovery", () => {
    const result = classifyAuthCallbackParams({
      code: "pkce-code",
      tokenHash: null,
      type: null,
      flow: RECOVERY_CALLBACK_FLOW,
    });
    expect(result).toEqual({
      kind: "pkce",
      code: "pkce-code",
      recovery: true,
    });
    expect(isRecoveryCallback(result)).toBe(true);
  });

  it("classifies PKCE recovery via type=recovery with code (no token_hash)", () => {
    const result = classifyAuthCallbackParams({
      code: "pkce-code",
      tokenHash: null,
      type: "recovery",
    });
    expect(result).toEqual({
      kind: "pkce",
      code: "pkce-code",
      recovery: true,
    });
  });

  it("OTP recovery success → reset_password without signOut", () => {
    const decision = decideAuthCallbackRoute({
      classified: {
        kind: "otp",
        tokenHash: "h",
        type: "recovery",
      },
      exchangeOk: true,
    });
    expect(decision).toEqual({ kind: "reset_password", signOut: false });
  });

  it("PKCE recovery success → reset_password without signOut", () => {
    const decision = decideAuthCallbackRoute({
      classified: { kind: "pkce", code: "c", recovery: true },
      exchangeOk: true,
    });
    expect(decision).toEqual({ kind: "reset_password", signOut: false });
  });

  it("signup confirmation success still signs out → confirmed", () => {
    const decision = decideAuthCallbackRoute({
      classified: {
        kind: "otp",
        tokenHash: "h",
        type: "signup",
      },
      exchangeOk: true,
    });
    expect(decision).toEqual({
      kind: "confirmed",
      status: "success",
      signOut: true,
    });
  });

  it("non-recovery PKCE success still signs out → confirmed", () => {
    const decision = decideAuthCallbackRoute({
      classified: { kind: "pkce", code: "c", recovery: false },
      exchangeOk: true,
    });
    expect(decision).toEqual({
      kind: "confirmed",
      status: "success",
      signOut: true,
    });
  });

  it("failed recovery routes to forgot_password without signOut", () => {
    const decision = decideAuthCallbackRoute({
      classified: { kind: "pkce", code: "c", recovery: true },
      exchangeOk: false,
      exchangeErrorMessage: "Token has expired or is invalid",
    });
    expect(decision).toEqual({ kind: "forgot_password", signOut: false });
  });

  it("expired/reused OTP recovery → forgot_password without signOut", () => {
    const decision = decideAuthCallbackRoute({
      classified: {
        kind: "otp",
        tokenHash: "used-once",
        type: "recovery",
      },
      exchangeOk: false,
      exchangeErrorMessage: "otp_expired",
    });
    expect(decision).toEqual({ kind: "forgot_password", signOut: false });
  });

  it("flow=recovery alone (missing proof) is not reset_password", () => {
    const classified = classifyAuthCallbackParams({
      code: null,
      tokenHash: null,
      type: null,
      flow: RECOVERY_CALLBACK_FLOW,
    });
    expect(classified).toEqual({ kind: "missing" });
    const decision = decideAuthCallbackRoute({
      classified,
      exchangeOk: false,
    });
    expect(decision).toEqual({
      kind: "confirmed",
      status: "error",
      signOut: false,
    });
    expect(decision.kind).not.toBe("reset_password");
  });

  it("non-recovery exchange failure stays confirmed invalid (unchanged)", () => {
    const decision = decideAuthCallbackRoute({
      classified: {
        kind: "otp",
        tokenHash: "h",
        type: "signup",
      },
      exchangeOk: false,
      exchangeErrorMessage: "otp_expired",
    });
    expect(decision).toEqual({
      kind: "confirmed",
      status: "invalid",
      signOut: false,
    });
  });

  it("documents recovery email template + reset redirectTo contracts", () => {
    expect(RECOVERY_EMAIL_CALLBACK_PATH).toContain("token_hash={{ .TokenHash }}");
    expect(RECOVERY_EMAIL_CALLBACK_PATH).toContain("type=recovery");
    expect(RECOVERY_EMAIL_CALLBACK_PATH).not.toContain("ConfirmationURL");

    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://bitrymdym.pl";
    try {
      expect(getAuthPasswordResetRedirectTo()).toBe(
        "https://bitrymdym.pl/auth/callback?flow=recovery",
      );
      expect(getAuthEmailRedirectTo()).toBe(
        "https://bitrymdym.pl/auth/callback",
      );
      expect(getAuthEmailRedirectTo()).not.toContain("flow=recovery");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
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
