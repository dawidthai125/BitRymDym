/**
 * Test-only stubs for SignUpForm mount harness.
 * Not imported by production routes. No Supabase / Auth / network.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
};

const MISMATCH: AuthActionState = {
  error: "Hasła nie są takie same.",
  success: false,
  message: null,
};

function bumpMockCalls(): void {
  if (typeof window === "undefined") return;
  window.__BRD_SIGN_UP_MOCK_CALLS__ =
    (window.__BRD_SIGN_UP_MOCK_CALLS__ ?? 0) + 1;
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

/** Fixed mismatch result — never reaches real Auth. */
export async function signUpAction(
  ..._args: [AuthActionState, FormData]
): Promise<AuthActionState> {
  void _args;
  bumpMockCalls();
  return MISMATCH;
}

function forbid(name: string): never {
  throw new Error(`sign-up mount harness forbids action: ${name}`);
}

export async function signInAction(): Promise<AuthActionState> {
  return forbid("signInAction");
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
    __BRD_SIGN_UP_MOCK_CALLS__?: number;
  }
}
