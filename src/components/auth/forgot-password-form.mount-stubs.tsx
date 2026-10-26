/**
 * Test-only stubs for ForgotPasswordForm mount harness.
 * Not imported by production routes. No Supabase / Auth / network.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
};

/** Exact anti-enumeration copy from requestPasswordResetAction. */
export const FORGOT_PASSWORD_NEUTRAL_MESSAGE =
  "Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła.";

/** Same client-visible success for “account exists” and “does not exist” mocks. */
const NEUTRAL_SUCCESS: AuthActionState = {
  error: null,
  success: true,
  message: FORGOT_PASSWORD_NEUTRAL_MESSAGE,
};

function bumpMockCalls(): void {
  if (typeof window === "undefined") return;
  window.__BRD_FORGOT_PASSWORD_MOCK_CALLS__ =
    (window.__BRD_FORGOT_PASSWORD_MOCK_CALLS__ ?? 0) + 1;
}

/** Replaces `next/link` via esbuild alias. */
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
 * Fixed neutral success — never reaches real Auth.
 * Ignores FormData; UI shape is identical for any synthetic email.
 */
export async function requestPasswordResetAction(
  ..._args: [AuthActionState, FormData]
): Promise<AuthActionState> {
  void _args;
  bumpMockCalls();
  return NEUTRAL_SUCCESS;
}

function forbid(name: string): never {
  throw new Error(`forgot-password mount harness forbids action: ${name}`);
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

export async function requestEmailChangeAction(): Promise<AuthActionState> {
  return forbid("requestEmailChangeAction");
}

export async function updatePasswordAfterResetAction(): Promise<AuthActionState> {
  return forbid("updatePasswordAfterResetAction");
}

declare global {
  interface Window {
    __BRD_FORGOT_PASSWORD_MOCK_CALLS__?: number;
  }
}
