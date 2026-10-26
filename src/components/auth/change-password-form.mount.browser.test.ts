/**
 * Real ChangePasswordForm mount — success status / mismatch alert from mocked action.
 * No Supabase / Auth / real password change.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  CHANGE_PASSWORD_MISMATCH_MESSAGE,
  CHANGE_PASSWORD_SUCCESS_MESSAGE,
} from "@/components/auth/change-password-form.mount-stubs";
import {
  closeChangePasswordFormMountHost,
  invalidateChangePasswordFormMountBundle,
  probeChangePasswordFormMismatchAlert,
  probeChangePasswordFormSuccess,
} from "@/components/auth/change-password-form.mount-host";

describe("ChangePasswordForm — response presentation (real mount)", () => {
  afterAll(async () => {
    await closeChangePasswordFormMountHost();
  });

  it("success: role=status shows product message; no Auth network", async () => {
    invalidateChangePasswordFormMountBundle();
    const p = await probeChangePasswordFormSuccess();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.statusText, JSON.stringify(p)).toBe(CHANGE_PASSWORD_SUCCESS_MESSAGE);
    expect(p.statusVisible, JSON.stringify(p)).toBe(true);
    expect(p.statusInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.alertVisible, JSON.stringify(p)).toBe(false);
    expect(p.providerSpecificLeak, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);

  it("mismatch: role=alert shows product message; no Auth network", async () => {
    invalidateChangePasswordFormMountBundle();
    const p = await probeChangePasswordFormMismatchAlert();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.alertText, JSON.stringify(p)).toBe(CHANGE_PASSWORD_MISMATCH_MESSAGE);
    expect(p.alertVisible, JSON.stringify(p)).toBe(true);
    expect(p.alertInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.statusVisible, JSON.stringify(p)).toBe(false);
    expect(p.providerSpecificLeak, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
