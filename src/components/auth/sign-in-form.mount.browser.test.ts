/**
 * Real SignInForm mount — unified credentials alert from mocked signInAction.
 * No Supabase / Auth / real login (post-65a97a8 client-visible shape).
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeSignInFormMountHost,
  invalidateSignInFormMountBundle,
  probeSignInFormNeutralCredentialsError,
} from "@/components/auth/sign-in-form.mount-host";
import { SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE } from "@/lib/ui/user-errors";

describe("SignInForm — unified credentials error (real mount)", () => {
  afterAll(async () => {
    await closeSignInFormMountHost();
  });

  it("mobile 390×844: mock neutral error shows role=alert; no Auth network", async () => {
    invalidateSignInFormMountBundle();
    const p = await probeSignInFormNeutralCredentialsError();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.alertText, JSON.stringify(p)).toBe(
      SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE,
    );
    expect(p.alertVisible, JSON.stringify(p)).toBe(true);
    expect(p.alertInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.statusVisible, JSON.stringify(p)).toBe(false);
    expect(p.providerSpecificLeak, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
