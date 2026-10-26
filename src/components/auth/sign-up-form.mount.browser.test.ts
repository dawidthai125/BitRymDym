/**
 * Real SignUpForm mount — password mismatch alert from mocked signUpAction.
 * No Supabase / Auth / account creation.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeSignUpFormMountHost,
  invalidateSignUpFormMountBundle,
  probeSignUpFormPasswordMismatch,
} from "@/components/auth/sign-up-form.mount-host";

describe("SignUpForm — password mismatch (real mount)", () => {
  afterAll(async () => {
    await closeSignUpFormMountHost();
  });

  it("mobile 390×844: mock mismatch shows role=alert; no Auth network", async () => {
    invalidateSignUpFormMountBundle();
    const p = await probeSignUpFormPasswordMismatch();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.alertText, JSON.stringify(p)).toBe("Hasła nie są takie same.");
    expect(p.alertVisible, JSON.stringify(p)).toBe(true);
    expect(p.alertInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.statusVisible, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
