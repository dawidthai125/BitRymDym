import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMAIL_CHANGE_AWAITING_MESSAGE,
  EMAIL_CHANGE_NOTICE_COPY,
  EMAIL_CHANGE_PRODUCT_SUCCESS_MESSAGE,
  EMAIL_CHANGE_START_FAILED,
  classifyEmailChangeVerification,
  parseSecureEmailChangeAttestation,
  secureEmailChangeFromPublicAuthSettings,
  emailChangeNoticeCookieOptions,
  emailChangeResultPath,
  noticeValueForSecret,
  openEmailChangeNotice,
  requestEmailChange,
  sealEmailChangeNotice,
  resolveEmailChangeNoticeDisplay,
  resolveEmailChangeOutcome,
} from "@/lib/auth/email-change";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("requestEmailChange", () => {
  const session = {
    sessionUserId: "user-1",
    sessionEmail: "old@example.com",
  };

  function harness(overrides?: {
    reauthOk?: boolean;
    startError?: string | null;
  }) {
    const calls: string[] = [];
    const run = (input: {
      newEmail?: string;
      confirmEmail?: string;
      currentPassword?: string;
      sessionUserId?: string | null;
      claimedUserId?: string | null;
      claimedUserNumber?: string | null;
    }) =>
      requestEmailChange({
        sessionUserId:
          input.sessionUserId === undefined
            ? session.sessionUserId
            : input.sessionUserId,
        sessionEmail: session.sessionEmail,
        newEmail: input.newEmail ?? "new@example.com",
        confirmEmail: input.confirmEmail ?? "new@example.com",
        currentPassword: input.currentPassword ?? "longenough",
        claimedUserId: input.claimedUserId,
        claimedUserNumber: input.claimedUserNumber,
        reauthenticate: async () => {
          calls.push("reauth");
          if (overrides?.reauthOk === false) {
            return { ok: false, error: "Nieprawidłowe aktualne hasło." };
          }
          return { ok: true };
        },
        startAuthEmailChange: async () => {
          calls.push("start");
          return { errorMessage: overrides?.startError ?? null };
        },
      });
    return { calls, run };
  }

  it("rejects a missing session before reauth or Auth", async () => {
    const { calls, run } = harness();
    const result = await run({ sessionUserId: null });
    expect(result).toMatchObject({ ok: false, started: false });
    expect(calls).toEqual([]);
  });

  it("rejects an empty address before reauth", async () => {
    const { calls, run } = harness();
    const result = await run({ newEmail: "  ", confirmEmail: "  " });
    expect(result).toMatchObject({
      ok: false,
      started: false,
      error: "Podaj adres e-mail.",
    });
    expect(calls).toEqual([]);
  });

  it("rejects a malformed address on the server path", async () => {
    const { calls, run } = harness();
    const result = await run({
      newEmail: "not-an-email",
      confirmEmail: "not-an-email",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/prawidłowy/);
    expect(calls).toEqual([]);
  });

  it("does not start Auth when reauth fails", async () => {
    const { calls, run } = harness({ reauthOk: false });
    const result = await run({});
    expect(result).toEqual({
      ok: false,
      started: false,
      error: "Nieprawidłowe aktualne hasło.",
    });
    expect(calls).toEqual(["reauth"]);
  });

  it("rejects a foreign user id and does not reauth", async () => {
    const { calls, run } = harness();
    await expect(run({ claimedUserId: "someone-else" })).rejects.toThrow(
      /foreign user id/,
    );
    expect(calls).toEqual([]);
  });

  it("ignores a client user number as identity", async () => {
    const { calls, run } = harness();
    const result = await run({ claimedUserNumber: "999999" });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["reauth", "start"]);
  });

  it("does not write a success message when Auth returns an error", async () => {
    const { calls, run } = harness({ startError: "already been registered" });
    const result = await run({});
    expect(result).toEqual({
      ok: false,
      started: false,
      error: EMAIL_CHANGE_START_FAILED,
    });
    expect(JSON.stringify(result)).not.toMatch(/registered|example\.com/i);
    expect(calls).toEqual(["reauth", "start"]);
  });

  it("reports awaiting confirmation, not a completed change", async () => {
    const { run } = harness();
    const result = await run({});
    expect(result).toEqual({
      ok: true,
      started: true,
      phase: "awaiting_confirmation",
      message: EMAIL_CHANGE_AWAITING_MESSAGE,
    });
    expect(result.ok && result.message).not.toMatch(/został zmieniony|adres zmieniony/i);
  });
});

describe("resolveEmailChangeOutcome", () => {
  it("does not treat a single pending confirmation as product success", () => {
    expect(
      resolveEmailChangeOutcome({
        secureEmailChangeEnabled: true,
        pendingNewEmail: "new@example.com",
      }),
    ).toBe("awaiting_other");
  });

  it("product success requires the secure flag and no pending address", () => {
    expect(
      resolveEmailChangeOutcome({
        secureEmailChangeEnabled: true,
        pendingNewEmail: null,
      }),
    ).toBe("product_success");
    expect(EMAIL_CHANGE_PRODUCT_SUCCESS_MESSAGE).toMatch(/obu|obecnej i nowej/i);
  });

  it("does not claim product success when the project flag was not read", () => {
    expect(
      resolveEmailChangeOutcome({
        secureEmailChangeEnabled: null,
        pendingNewEmail: null,
      }),
    ).toBe("auth_finished_config_unverified");
  });

  it("does not claim product success when secure email change is off", () => {
    expect(
      resolveEmailChangeOutcome({
        secureEmailChangeEnabled: false,
        pendingNewEmail: "",
      }),
    ).toBe("auth_finished_config_unverified");
  });
});

describe("parseSecureEmailChangeAttestation", () => {
  it("accepts only on and off", () => {
    expect(parseSecureEmailChangeAttestation("on")).toBe(true);
    expect(parseSecureEmailChangeAttestation(" ON ")).toBe(true);
    expect(parseSecureEmailChangeAttestation("off")).toBe(false);
    expect(parseSecureEmailChangeAttestation("OFF")).toBe(false);
  });

  it("fails closed when the attestation is missing or not exact", () => {
    expect(parseSecureEmailChangeAttestation(undefined)).toBeNull();
    expect(parseSecureEmailChangeAttestation(null)).toBeNull();
    expect(parseSecureEmailChangeAttestation("")).toBeNull();
    expect(parseSecureEmailChangeAttestation("true")).toBeNull();
    expect(parseSecureEmailChangeAttestation("1")).toBeNull();
  });
});

describe("secureEmailChangeFromPublicAuthSettings", () => {
  it("returns null for the public settings payload, which has no secure-email field", () => {
    expect(
      secureEmailChangeFromPublicAuthSettings({
        external: { email: true },
        disable_signup: false,
        mailer_autoconfirm: false,
        phone_autoconfirm: false,
        sms_provider: "twilio",
        saml_enabled: false,
      }),
    ).toBeNull();
  });

  it("accepts only an explicit boolean and fails closed otherwise", () => {
    expect(
      secureEmailChangeFromPublicAuthSettings({
        mailer_secure_email_change_enabled: true,
      }),
    ).toBe(true);
    expect(
      secureEmailChangeFromPublicAuthSettings({
        mailer_secure_email_change_enabled: false,
      }),
    ).toBe(false);
    expect(
      secureEmailChangeFromPublicAuthSettings({
        mailer_secure_email_change_enabled: "true",
      }),
    ).toBeNull();
    expect(secureEmailChangeFromPublicAuthSettings(null)).toBeNull();
    expect(secureEmailChangeFromPublicAuthSettings(undefined)).toBeNull();
  });
});

describe("classifyEmailChangeVerification", () => {
  it("shows 1/2 for the first confirmation when verify returns no session", () => {
    const status = classifyEmailChangeVerification({
      exchangeOk: true,
      verifyTransport: "otp",
      verifyIssuedSession: false,
      verifyReturnedUser: false,
      user: null,
      secureEmailChangeEnabled: true,
    });
    expect(status).toBe("one");
    expect(EMAIL_CHANGE_NOTICE_COPY.one.title).toBe("Pierwszy e-mail potwierdzony");
    expect(EMAIL_CHANGE_NOTICE_COPY.one.body).toContain("Potwierdzenie 1 z 2");
    expect(emailChangeResultPath(false)).toBe("/auth/email-change");
  });

  it("shows 1/2 when the readable account still has a pending address", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport: "otp",
      verifyIssuedSession: true,
        verifyReturnedUser: true,
        user: { email: "old@example.com", new_email: "next@example.com" },
        secureEmailChangeEnabled: true,
      }),
    ).toBe("one");
  });

  it("shows 2/2 only when secure email change is known and this verify finished it", () => {
    const status = classifyEmailChangeVerification({
      exchangeOk: true,
      verifyTransport: "otp",
      verifyIssuedSession: true,
      verifyReturnedUser: true,
      user: { email: "next@example.com", new_email: null },
      secureEmailChangeEnabled: true,
    });
    expect(status).toBe("both");
    expect(EMAIL_CHANGE_NOTICE_COPY.both.title).toBe(
      "Adres e-mail został zmieniony!",
    );
    expect(EMAIL_CHANGE_NOTICE_COPY.both.body).toContain("Oba potwierdzenia");
  });

  it("does not show 2/2 from a cleared new_email when the flag was not read", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport: "otp",
      verifyIssuedSession: true,
        verifyReturnedUser: true,
        user: { email: "next@example.com", new_email: null },
        secureEmailChangeEnabled: null,
      }),
    ).toBe("unknown");
  });

  it("does not show 2/2 when secure email change is off", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport: "otp",
      verifyIssuedSession: true,
        verifyReturnedUser: true,
        user: { email: "next@example.com", new_email: "" },
        secureEmailChangeEnabled: false,
      }),
    ).toBe("unknown");
  });

  it("maps an invalid token to invalid, not success", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: false,
        verifyTransport: "otp",
      verifyIssuedSession: false,
        verifyReturnedUser: false,
        user: null,
        secureEmailChangeEnabled: true,
      }),
    ).toBe("invalid");
    expect(EMAIL_CHANGE_NOTICE_COPY.invalid.title).toBe(
      "Nie udało się potwierdzić adresu",
    );
  });

  it("maps an expired link to invalid, not success", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: false,
        verifyTransport: "otp",
      verifyIssuedSession: false,
        verifyReturnedUser: false,
        user: { email: "old@example.com", new_email: "next@example.com" },
        secureEmailChangeEnabled: true,
      }),
    ).toBe("invalid");
  });

  it("keeps a session-issuing verify with no readable user unknown", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport: "otp",
      verifyIssuedSession: true,
        verifyReturnedUser: true,
        user: null,
        secureEmailChangeEnabled: true,
      }),
    ).toBe("unknown");
    expect(EMAIL_CHANGE_NOTICE_COPY.unknown.title).toBe(
      "Sprawdzamy status zmiany adresu",
    );
  });

  it("does not treat a PKCE response without a session as the first confirmation", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport: "pkce",
        verifyIssuedSession: false,
        verifyReturnedUser: false,
        user: null,
        secureEmailChangeEnabled: true,
      }),
    ).toBe("unknown");
  });

  it("does not treat a readable user without a pending address as 1/2", () => {
    expect(
      classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport: "otp",
      verifyIssuedSession: false,
        verifyReturnedUser: false,
        user: { email: "old@example.com", new_email: null },
        secureEmailChangeEnabled: true,
      }),
    ).toBe("unknown");
  });
});

describe("resolveEmailChangeNoticeDisplay", () => {
  it("does not show 1/2 on a later account visit just because a change is still pending", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: null,
        pendingNewEmail: "next@example.com",
        sessionReadable: true,
      }),
    ).toBeNull();
  });

  it("shows 1/2 when the signed notice and the still-pending address agree", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "one",
        pendingNewEmail: "next@example.com",
        sessionReadable: true,
      }),
    ).toBe("one");
  });

  it("shows nothing on a later account visit once the notice and pending address are gone", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: null,
        pendingNewEmail: null,
        sessionReadable: true,
      }),
    ).toBeNull();
  });

  it("does not upgrade an unknown notice to 1/2 or 2/2", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "unknown",
        pendingNewEmail: null,
        sessionReadable: true,
      }),
    ).toBe("unknown");
  });

  it("shows 1/2 from the signed notice only when no session can contradict it", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "one",
        pendingNewEmail: null,
        sessionReadable: false,
      }),
    ).toBe("one");
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "one",
        pendingNewEmail: null,
        sessionReadable: true,
      }),
    ).toBe("unknown");
  });

  it("shows 2/2 only when the signed notice and the readable session agree", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "both",
        pendingNewEmail: null,
        sessionReadable: true,
      }),
    ).toBe("both");
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "both",
        pendingNewEmail: null,
        sessionReadable: false,
      }),
    ).toBe("unknown");
  });

  it("does not show 2/2 when a finish notice disagrees with a still-pending address", () => {
    expect(
      resolveEmailChangeNoticeDisplay({
        signedStatus: "both",
        pendingNewEmail: "next@example.com",
        sessionReadable: true,
      }),
    ).toBe("unknown");
  });
});

describe("email change notice seal", () => {
  const sign = (body: string) => `sig-${body.length}-${body.slice(0, 3)}`;
  const otherSign = (body: string) => `other-${body}`;

  it("round-trips a status and rejects a tampered, expired, or re-signed value", () => {
    const now = 1_700_000_000_000;
    const sealed = sealEmailChangeNotice("one", now, sign);
    expect(openEmailChangeNotice(sealed, now, sign)).toBe("one");
    expect(sealed).not.toMatch(/token_hash|token=|eyJ|service_role/i);
    expect(openEmailChangeNotice(sealed.replace("one", "both"), now, sign)).toBeNull();
    const [status, exp] = sealed.split(".");
    expect(openEmailChangeNotice(`${status}.${exp}.forged`, now, sign)).toBeNull();
    expect(openEmailChangeNotice(sealed, now, otherSign)).toBeNull();
    expect(openEmailChangeNotice(sealed, now + 601_000, sign)).toBeNull();
  });

  it("does not seal a notice when the signing secret is missing", () => {
    expect(noticeValueForSecret("both", null, 1_700_000_000_000, sign)).toBeNull();
    expect(noticeValueForSecret("both", undefined, 1_700_000_000_000, sign)).toBeNull();
    expect(noticeValueForSecret("one", "server-secret", 1_700_000_000_000, sign)).toContain(
      "one.",
    );
  });

  it("clears the one-time notice with the same cookie scope and no remaining lifetime", () => {
    expect(emailChangeNoticeCookieOptions(true, 0)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});

describe("ACCT-EMAIL-01 source contract", () => {
  it("keeps email on Auth, reauth before updateUser, and off profiles", () => {
    const actions = read("src/lib/auth/actions.ts");
    const start = actions.indexOf("export async function requestEmailChangeAction");
    const body = actions.slice(start, actions.indexOf("export async function deleteAccountAction"));
    expect(start).toBeGreaterThan(-1);
    expect(body.indexOf("reauthenticateWithPassword")).toBeGreaterThan(-1);
    expect(body.indexOf("updateUser")).toBeGreaterThan(
      body.indexOf("reauthenticateWithPassword"),
    );
    expect(body).toContain("pendingConfirmation: true");
    expect(body).toContain("success: false");
    expect(body).not.toMatch(/from\("profiles"\)/);
    expect(body).not.toMatch(/profiles\.email/);
    expect(body).not.toMatch(/console\.(log|info|debug)/);

    const sql = read("supabase/migrations/20261003173213_account_profile_01.sql");
    expect(sql).not.toMatch(/ADD COLUMN[^;]*email/i);

    const form = read("src/components/auth/auth-forms.tsx");
    const formStart = form.indexOf("export function ChangeEmailForm");
    const formBody = form.slice(formStart, form.indexOf("export function DeleteAccountForm"));
    expect(formBody).not.toMatch(/name="userId"/);
    expect(formBody).not.toMatch(/name="userNumber"/);
    expect(formBody).toContain('role="alert"');
    expect(formBody).toContain('role="status"');
    const route = read("src/app/auth/callback/route.ts");
    expect(route).toContain("classifyEmailChangeVerification");
    expect(route).toContain("parseSecureEmailChangeAttestation");
    expect(route).toContain("process.env.AUTH_SECURE_EMAIL_CHANGE");
    expect(route).not.toMatch(/secureEmailChangeEnabled:\s*true/);
    expect(route).not.toMatch(/secureEmailChangeEnabled:\s*null/);
    expect(route).toContain('redirectEmailChange(request, "unknown", false)');
    expect(route).not.toMatch(/emailChange=/);
    const notice = read("src/lib/auth/email-change-notice.ts");
    expect(notice).toContain("getSupabaseServiceRoleKey");
    expect(notice).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    const clearer = read("src/lib/auth/email-change-notice-action.ts");
    expect(clearer).toContain("clearEmailChangeNotice");
    expect(clearer).not.toMatch(/status\s*:/);
    expect(clearer).toContain("maxAge: 0".replace("maxAge: 0", "emailChangeNoticeClearOptions"));
    const account = read("src/app/account/page.tsx");
    const result = read("src/app/auth/email-change/page.tsx");
    expect(account).toContain("ConsumeEmailChangeNotice");
    expect(result).toContain("ConsumeEmailChangeNotice");
    const widget = read("src/components/auth/email-change-notice.tsx");
    expect(widget).not.toMatch(/SERVICE_ROLE|token_hash/);
    expect(route).not.toMatch(/console\.(log|info|debug)/);
    expect(route).not.toMatch(/from\("profiles"\)/);
    const joined = Object.values(EMAIL_CHANGE_NOTICE_COPY)
      .map((item) => `${item.title} ${item.body}`)
      .join("\n");
    expect(joined).not.toMatch(/token_hash|token=|eyJ/);
  });
});
