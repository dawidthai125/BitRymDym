import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMAIL_CHANGE_AWAITING_MESSAGE,
  EMAIL_CHANGE_PRODUCT_SUCCESS_MESSAGE,
  EMAIL_CHANGE_START_FAILED,
  emailChangeAccountPath,
  emailChangeLandingAfterVerify,
  requestEmailChange,
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

describe("emailChangeLandingAfterVerify", () => {
  it("verify failure is invalid, not a finished change", () => {
    const landing = emailChangeLandingAfterVerify({
      exchangeOk: false,
      userError: false,
      user: { new_email: null },
    });
    expect(landing).toBe("invalid");
    expect(emailChangeAccountPath(landing)).toBe("/account?emailChange=invalid");
    expect(landing).not.toBe("auth_finished");
  });

  it("verify success with getUser error is partial, not auth_finished", () => {
    const landing = emailChangeLandingAfterVerify({
      exchangeOk: true,
      userError: true,
      user: null,
    });
    expect(landing).toBe("partial");
    expect(emailChangeAccountPath(landing)).toBe("/account?emailChange=partial");
    expect(landing).not.toBe("auth_finished");
  });

  it("verify success without a user is partial, not auth_finished", () => {
    const landing = emailChangeLandingAfterVerify({
      exchangeOk: true,
      userError: false,
      user: null,
    });
    expect(landing).toBe("partial");
    expect(emailChangeAccountPath(landing)).not.toContain("auth_finished");
  });

  it("a still-pending new_email stays partial", () => {
    expect(
      emailChangeLandingAfterVerify({
        exchangeOk: true,
        userError: false,
        user: { new_email: "next@example.com" },
      }),
    ).toBe("partial");
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

    const sql = read("supabase/migrations/20261003160000_account_profile_01.sql");
    expect(sql).not.toMatch(/ADD COLUMN[^;]*email/i);

    const form = read("src/components/auth/auth-forms.tsx");
    const formStart = form.indexOf("export function ChangeEmailForm");
    const formBody = form.slice(formStart, form.indexOf("export function DeleteAccountForm"));
    expect(formBody).not.toMatch(/name="userId"/);
    expect(formBody).not.toMatch(/name="userNumber"/);
    expect(formBody).toContain('role="alert"');
    expect(formBody).toContain('role="status"');
    const route = read("src/app/auth/callback/route.ts");
    expect(route).toContain("emailChangeLandingAfterVerify");
    expect(route).not.toMatch(/from\("profiles"\)/);
  });
});
