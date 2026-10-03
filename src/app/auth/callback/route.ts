import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  decideAuthCallbackRoute,
  isRecoveryCallback,
} from "@/lib/auth/confirmation";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectAbsolute(request: NextRequest, path: string) {
  try {
    return NextResponse.redirect(new URL(path, getSiteUrl()));
  } catch {
    return NextResponse.redirect(new URL(path, request.url));
  }
}

/**
 * Auth callback for email confirmation, password recovery, and other Auth redirects.
 *
 * Prefer token_hash + type → verifyOtp (cross-browser safe; no PKCE verifier).
 * Keep PKCE code → exchangeCodeForSession for flows that still use ?code=.
 * Never log token_hash, codes, or session secrets.
 *
 * Recovery contract (ACCOUNT/PROFILE-01):
 * - OTP: ?token_hash=…&type=recovery → keep session → /auth/reset-password
 * - PKCE: ?code=…&flow=recovery (from getAuthPasswordResetRedirectTo) → keep session → /auth/reset-password
 * Signup / other confirms: sign out → /auth/confirmed
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const classified = classifyAuthCallbackParams({
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
    flow: url.searchParams.get("flow"),
  });

  if (classified.kind === "missing") {
    return redirectAbsolute(request, confirmationResultPath("error"));
  }

  const recovery = isRecoveryCallback(classified);

  try {
    const supabase = await createSupabaseServerClient();
    let exchangeOk = false;
    let exchangeErrorMessage: string | null = null;

    if (classified.kind === "otp") {
      const { error } = await supabase.auth.verifyOtp({
        type: classified.type as EmailOtpType,
        token_hash: classified.tokenHash,
      });
      exchangeOk = !error;
      exchangeErrorMessage = error?.message ?? null;
    } else {
      const { error } = await supabase.auth.exchangeCodeForSession(
        classified.code,
      );
      exchangeOk = !error;
      exchangeErrorMessage = error?.message ?? null;
    }

    const decision = decideAuthCallbackRoute({
      classified,
      exchangeOk,
      exchangeErrorMessage,
    });

    if (decision.signOut) {
      await supabase.auth.signOut();
    }

    if (decision.kind === "reset_password") {
      return redirectAbsolute(request, "/auth/reset-password");
    }
    if (decision.kind === "forgot_password") {
      return redirectAbsolute(request, "/forgot-password");
    }
    return redirectAbsolute(request, confirmationResultPath(decision.status));
  } catch {
    // Fail closed: never leave a half-open recovery session on unexpected errors.
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    if (recovery) {
      return redirectAbsolute(request, "/forgot-password");
    }
    return redirectAbsolute(request, confirmationResultPath("error"));
  }
}
