/**
 * Real ForgotPasswordForm mount — neutral recovery status from mocked action.
 * No Supabase / Auth / real reset email. Server anti-enum covered by
 * forgot-password-action.test.ts; this suite asserts UI presentation only.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeForgotPasswordFormMountHost,
  invalidateForgotPasswordFormMountBundle,
  probeForgotPasswordFormNeutralSuccess,
} from "@/components/auth/forgot-password-form.mount-host";
import { FORGOT_PASSWORD_NEUTRAL_MESSAGE } from "@/components/auth/forgot-password-form.mount-stubs";

describe("ForgotPasswordForm — neutral recovery message (real mount)", () => {
  afterAll(async () => {
    await closeForgotPasswordFormMountHost();
  });

  it("mobile 390×844: mock success shows role=status; no Auth network", async () => {
    invalidateForgotPasswordFormMountBundle();
    const p = await probeForgotPasswordFormNeutralSuccess();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.statusText, JSON.stringify(p)).toBe(FORGOT_PASSWORD_NEUTRAL_MESSAGE);
    expect(p.statusVisible, JSON.stringify(p)).toBe(true);
    expect(p.statusInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.alertVisible, JSON.stringify(p)).toBe(false);
    expect(p.providerSpecificLeak, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
