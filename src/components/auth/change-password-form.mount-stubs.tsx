/**
 * Test-only stubs for ChangePasswordForm mount harness.
 * Not imported by production routes. No Supabase / Auth / network.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
  pendingConfirmation?: boolean;
};

/** Exact success copy from changePasswordAction. */
export const CHANGE_PASSWORD_SUCCESS_MESSAGE = "Hasło zostało zmienione.";

/** Exact mismatch copy from validateNewPassword (client-visible). */
export const CHANGE_PASSWORD_MISMATCH_MESSAGE = "Hasła nie są takie same.";

function bumpMockCalls(): void {
  if (typeof window === "undefined") return;
  window.__BRD_CHANGE_PASSWORD_MOCK_CALLS__ =
    (window.__BRD_CHANGE_PASSWORD_MOCK_CALLS__ ?? 0) + 1;
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
 * Mirrors client-visible password validation / success without Auth.
 * Does not log FormData values.
 */
export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  bumpMockCalls();
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (next !== confirm) {
    return { error: CHANGE_PASSWORD_MISMATCH_MESSAGE, success: false };
  }
  return {
    error: null,
    success: true,
    message: CHANGE_PASSWORD_SUCCESS_MESSAGE,
  };
}

function forbid(name: string): never {
  throw new Error(`change-password mount harness forbids action: ${name}`);
}

export async function signInAction(): Promise<AuthActionState> {
  return forbid("signInAction");
}
export async function signUpAction(): Promise<AuthActionState> {
  return forbid("signUpAction");
}
export async function deleteAccountAction(): Promise<AuthActionState> {
  return forbid("deleteAccountAction");
}
export async function requestEmailChangeAction(): Promise<AuthActionState> {
  return forbid("requestEmailChangeAction");
}
export async function requestPasswordResetAction(): Promise<AuthActionState> {
  return forbid("requestPasswordResetAction");
}
export async function updatePasswordAfterResetAction(): Promise<AuthActionState> {
  return forbid("updatePasswordAfterResetAction");
}

declare global {
  interface Window {
    __BRD_CHANGE_PASSWORD_MOCK_CALLS__?: number;
  }
}
