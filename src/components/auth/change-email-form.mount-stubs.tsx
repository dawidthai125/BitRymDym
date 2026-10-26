/**
 * Test-only stubs for ChangeEmailForm mount harness.
 * Not imported by production routes. No Supabase / Auth / network.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { EMAIL_CHANGE_AWAITING_MESSAGE } from "@/lib/auth/email-change";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
  pendingConfirmation?: boolean;
};

/** Exact mismatch copy from requestEmailChange validation. */
export const CHANGE_EMAIL_MISMATCH_MESSAGE =
  "Podane adresy e-mail nie są zgodne.";

export { EMAIL_CHANGE_AWAITING_MESSAGE };

function bumpMockCalls(): void {
  if (typeof window === "undefined") return;
  window.__BRD_CHANGE_EMAIL_MOCK_CALLS__ =
    (window.__BRD_CHANGE_EMAIL_MOCK_CALLS__ ?? 0) + 1;
}

export function NextLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
}) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export default NextLink;

/**
 * Mirrors client-visible email-change pending / mismatch without Auth.
 * Does not log FormData (including passwords).
 */
export async function requestEmailChangeAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  bumpMockCalls();
  const next = String(formData.get("newEmail") ?? "").trim();
  const confirm = String(formData.get("confirmEmail") ?? "").trim();
  if (next !== confirm) {
    return {
      error: CHANGE_EMAIL_MISMATCH_MESSAGE,
      success: false,
      pendingConfirmation: false,
    };
  }
  return {
    error: null,
    success: false,
    pendingConfirmation: true,
    message: EMAIL_CHANGE_AWAITING_MESSAGE,
  };
}

function forbid(name: string): never {
  throw new Error(`change-email mount harness forbids action: ${name}`);
}

export async function signInAction(): Promise<AuthActionState> {
  return forbid("signInAction");
}
export async function signUpAction(): Promise<AuthActionState> {
  return forbid("signUpAction");
}
export async function changePasswordAction(): Promise<AuthActionState> {
  return forbid("changePasswordAction");
}
export async function deleteAccountAction(): Promise<AuthActionState> {
  return forbid("deleteAccountAction");
}
export async function requestPasswordResetAction(): Promise<AuthActionState> {
  return forbid("requestPasswordResetAction");
}
export async function updatePasswordAfterResetAction(): Promise<AuthActionState> {
  return forbid("updatePasswordAfterResetAction");
}

declare global {
  interface Window {
    __BRD_CHANGE_EMAIL_MOCK_CALLS__?: number;
  }
}
