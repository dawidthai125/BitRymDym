/**
 * Real SignUpForm mount — password mismatch alert from mocked signUpAction.
 * No Supabase / Auth / account creation.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeSignUpFormMountHost,
  invalidateSignUpFormMountBundle,
  probeSignUpFormPasswordMismatch,
  probeSignUpFormPasswordVisibility,
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

  it("password toggles are independent; hit-area ≥44; no Auth submit", async () => {
    const p = await probeSignUpFormPasswordVisibility();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.usedRealButton, JSON.stringify(p)).toBe(true);
    expect(p.passwordInitialType, JSON.stringify(p)).toBe("password");
    expect(p.confirmInitialType, JSON.stringify(p)).toBe("password");
    expect(p.passwordAfterOwnToggle, JSON.stringify(p)).toBe("text");
    expect(p.confirmAfterPasswordToggle, JSON.stringify(p)).toBe("password");
    expect(p.confirmAfterOwnToggle, JSON.stringify(p)).toBe("text");
    expect(p.passwordAfterConfirmToggle, JSON.stringify(p)).toBe("text");
    expect(p.passwordValuePreserved, JSON.stringify(p)).toBe(true);
    expect(p.confirmValuePreserved, JSON.stringify(p)).toBe(true);
    expect(p.passwordToggleLabelHidden, JSON.stringify(p)).toBe("Pokaż hasło");
    expect(p.passwordToggleLabelShown, JSON.stringify(p)).toBe("Ukryj hasło");
    expect(p.confirmToggleLabelHidden, JSON.stringify(p)).toBe(
      "Pokaż powtórzone hasło",
    );
    expect(p.confirmToggleLabelShown, JSON.stringify(p)).toBe(
      "Ukryj powtórzone hasło",
    );
    expect(p.passwordPressedAfterClick, JSON.stringify(p)).toBe("true");
    expect(p.passwordTypeAfterKeyboard, JSON.stringify(p)).toBe("password");
    expect(p.mockCallsAfterToggles, JSON.stringify(p)).toBe(0);
    expect(p.passwordToggleMinSideMobile, JSON.stringify(p)).toBeGreaterThanOrEqual(
      44,
    );
    expect(p.confirmToggleMinSideMobile, JSON.stringify(p)).toBeGreaterThanOrEqual(
      44,
    );
    expect(p.passwordToggleMinSideDesktop, JSON.stringify(p)).toBeGreaterThanOrEqual(
      44,
    );
    expect(p.confirmToggleMinSideDesktop, JSON.stringify(p)).toBeGreaterThanOrEqual(
      44,
    );
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
