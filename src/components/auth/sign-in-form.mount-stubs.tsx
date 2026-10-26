/**
 * Test-only stubs for SignInForm mount harness.
 * Not imported by production routes. No Supabase / Auth / network.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE } from "@/lib/ui/user-errors";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
};

/** Same unified client shape as signInAction after 65a97a8. */
const NEUTRAL_CREDENTIALS: AuthActionState = {
  error: SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE,
  success: false,
  message: null,
};

function bumpMockCalls(): void {
  if (typeof window === "undefined") return;
  window.__BRD_SIGN_IN_MOCK_CALLS__ =
    (window.__BRD_SIGN_IN_MOCK_CALLS__ ?? 0) + 1;
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

/** Fixed neutral credentials error — never reaches real Auth. */
export async function signInAction(
  ..._args: [AuthActionState, FormData]
): Promise<AuthActionState> {
  void _args;
  bumpMockCalls();
  return NEUTRAL_CREDENTIALS;
}

function forbid(name: string): never {
  throw new Error(`sign-in mount harness forbids action: ${name}`);
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

export async function requestPasswordResetAction(): Promise<AuthActionState> {
  return forbid("requestPasswordResetAction");
}

export async function updatePasswordAfterResetAction(): Promise<AuthActionState> {
  return forbid("updatePasswordAfterResetAction");
}

declare global {
  interface Window {
    __BRD_SIGN_IN_MOCK_CALLS__?: number;
  }
}
