/**
 * Real SignInForm mount — unified credentials alert from mocked signInAction.
 * No Supabase / Auth / real login (post-65a97a8 client-visible shape).
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeSignInFormMountHost,
  invalidateSignInFormMountBundle,
  probeSignInFormNeutralCredentialsError,
  probeSignInFormPasswordVisibility,
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

  it("password visibility toggle: click+keyboard, value, a11y, hit-area ≥44; no Auth", async () => {
    const p = await probeSignInFormPasswordVisibility();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.usedRealButton, JSON.stringify(p)).toBe(true);
    expect(p.initialType, JSON.stringify(p)).toBe("password");
    expect(p.afterClickType, JSON.stringify(p)).toBe("text");
    expect(p.afterKeyboardType, JSON.stringify(p)).toBe("password");
    expect(p.valueAfterClick, JSON.stringify(p)).toBe("fake-password-A");
    expect(p.initialAriaLabel, JSON.stringify(p)).toBe("Pokaż hasło");
    expect(p.afterClickAriaLabel, JSON.stringify(p)).toBe("Ukryj hasło");
    expect(p.initialPressed, JSON.stringify(p)).toBe("false");
    expect(p.afterClickPressed, JSON.stringify(p)).toBe("true");
    expect(p.mockCallsAfterToggle, JSON.stringify(p)).toBe(0);
    expect(p.toggleWidthMobile, JSON.stringify(p)).toBeGreaterThanOrEqual(44);
    expect(p.toggleHeightMobile, JSON.stringify(p)).toBeGreaterThanOrEqual(44);
    expect(p.toggleWidthDesktop, JSON.stringify(p)).toBeGreaterThanOrEqual(44);
    expect(p.toggleHeightDesktop, JSON.stringify(p)).toBeGreaterThanOrEqual(44);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
