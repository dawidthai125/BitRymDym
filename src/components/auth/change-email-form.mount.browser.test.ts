/**
 * Real ChangeEmailForm mount — pending status / mismatch alert from mocked action.
 * No Supabase / Auth / real email change.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  CHANGE_EMAIL_MISMATCH_MESSAGE,
  EMAIL_CHANGE_AWAITING_MESSAGE,
} from "@/components/auth/change-email-form.mount-stubs";
import {
  closeChangeEmailFormMountHost,
  invalidateChangeEmailFormMountBundle,
  probeChangeEmailFormMismatchAlert,
  probeChangeEmailFormPendingStatus,
} from "@/components/auth/change-email-form.mount-host";

describe("ChangeEmailForm — response presentation (real mount)", () => {
  afterAll(async () => {
    await closeChangeEmailFormMountHost();
  });

  it("pending: role=status shows awaiting message; no Auth network", async () => {
    invalidateChangeEmailFormMountBundle();
    const p = await probeChangeEmailFormPendingStatus();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.showsCurrentEmail, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.statusText, JSON.stringify(p)).toBe(EMAIL_CHANGE_AWAITING_MESSAGE);
    expect(p.statusVisible, JSON.stringify(p)).toBe(true);
    expect(p.statusInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.alertVisible, JSON.stringify(p)).toBe(false);
    expect(p.providerSpecificLeak, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);

  it("mismatch: role=alert shows product message; no Auth network", async () => {
    invalidateChangeEmailFormMountBundle();
    const p = await probeChangeEmailFormMismatchAlert();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.mockCalls, JSON.stringify(p)).toBeGreaterThanOrEqual(1);
    expect(p.alertText, JSON.stringify(p)).toBe(CHANGE_EMAIL_MISMATCH_MESSAGE);
    expect(p.alertVisible, JSON.stringify(p)).toBe(true);
    expect(p.alertInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.statusVisible, JSON.stringify(p)).toBe(false);
    expect(p.providerSpecificLeak, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
