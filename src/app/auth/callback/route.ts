import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  decideAuthCallbackRoute,
  isEmailChangeCallback,
  isRecoveryCallback,
} from "@/lib/auth/confirmation";
import {
  classifyEmailChangeVerification,
  parseSecureEmailChangeAttestation,
  EMAIL_CHANGE_NOTICE_COOKIE,
  emailChangeResultPath,
  type EmailChangeNoticeStatus,
} from "@/lib/auth/email-change";
import {
  emailChangeNoticeSetOptions,
  noticeCookieValue,
} from "@/lib/auth/email-change-notice";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectAbsolute(request: NextRequest, path: string) {
  try {
    return NextResponse.redirect(new URL(path, getSiteUrl()));
  } catch {
    return NextResponse.redirect(new URL(path, request.url));
  }
}

function redirectEmailChange(
  request: NextRequest,
  status: EmailChangeNoticeStatus,
  hasSession: boolean,
) {
  const response = redirectAbsolute(request, emailChangeResultPath(hasSession));
  const value = noticeCookieValue(status);
  if (value) {
    response.cookies.set(
      EMAIL_CHANGE_NOTICE_COOKIE,
      value,
      emailChangeNoticeSetOptions(),
    );
  }
  return response;
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
 * Email change (type=email_change or flow=email_change): keep any session.
 *   The notice is a signed cookie, not a query param.
 *   No session after a successful email-change OTP is the first secure confirmation (1/2).
 *   2/2 requires that OTP to issue a session and AUTH_SECURE_EMAIL_CHANGE=on.
 *   Unset or any other value stays unknown. The env var is server-only.
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
    let verifyIssuedSession = false;
    let verifyReturnedUser = false;
    const verifyTransport = classified.kind === "otp" ? "otp" : "pkce";

    if (classified.kind === "otp") {
      const { data, error } = await supabase.auth.verifyOtp({
        type: classified.type as EmailOtpType,
        token_hash: classified.tokenHash,
      });
      exchangeOk = !error;
      exchangeErrorMessage = error?.message ?? null;
      verifyIssuedSession = Boolean(data?.session);
      verifyReturnedUser = Boolean(data?.user);
    } else {
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        classified.code,
      );
      exchangeOk = !error;
      exchangeErrorMessage = error?.message ?? null;
      verifyIssuedSession = Boolean(data?.session);
      verifyReturnedUser = Boolean(data?.user);
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
    if (decision.kind === "email_change_failed") {
      return redirectEmailChange(request, "invalid", false);
    }
    if (decision.kind === "email_change") {
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      const status = classifyEmailChangeVerification({
        exchangeOk: true,
        verifyTransport,
        verifyIssuedSession,
        verifyReturnedUser,
        user,
        secureEmailChangeEnabled: parseSecureEmailChangeAttestation(
          process.env.AUTH_SECURE_EMAIL_CHANGE,
        ),
      });
      return redirectEmailChange(request, status, Boolean(user));
    }
    return redirectAbsolute(request, confirmationResultPath(decision.status));
  } catch {
    // Fail closed on signup. Do not wipe a recovery or email-change session.
    const emailChange = isEmailChangeCallback(classified);
    if (!recovery && !emailChange) {
      try {
        const supabase = await createSupabaseServerClient();
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    if (recovery) {
      return redirectAbsolute(request, "/forgot-password");
    }
    if (emailChange) {
      return redirectEmailChange(request, "unknown", false);
    }
    return redirectAbsolute(request, confirmationResultPath("error"));
  }
}
