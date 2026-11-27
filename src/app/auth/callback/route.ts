import { type EmailOtpType } from "@supabase/supabase-js";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  decideAuthCallbackRoute,
  isEmailChangeCallback,
  isRecoveryCallback,
  isSignupConfirmationCallback,
  resolveSignupNextPath,
  SIGNUP_BROWSER_COOKIE,
  SIGNUP_CONFIRMED_DEFAULT_PATH,
  signupBrowserCookieOptions,
  signupBrowserMatches,
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
import {
  PASSWORD_RECOVERY_COOKIE,
  passwordRecoveryCookieValue,
  passwordRecoverySetOptions,
} from "@/lib/auth/password-recovery-seal-cookie";
import { postAuthRedirectPath, safeNextPath, SIGN_IN_NEXT_PARAM } from "@/lib/auth/next-path";
import { SESSION_ONLY_COOKIE, sessionOnlyCookieOptions } from "@/lib/auth/keep-signed-in";
import { needsSocialProfileCompletion, OAUTH_CALLBACK_FLOW, SOCIAL_FINISH_PATH } from "@/lib/auth/social";
import { getCurrentProfile } from "@/lib/auth/session";
import { sendWelcomeOnce } from "@/lib/email/notify/server";
import { normalizeReferralCode, REFERRAL_METADATA_KEY } from "@/lib/referrals/referral-policy";
import { readSiteMaintenanceForViewer } from "@/lib/site/maintenance-settings";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tryClaimAnonTakeAfterAuth } from "@/lib/takes/anon-account-claim";

/** A second opening of the same confirmation link this soon counts as the first one. */
const REPEATED_CONFIRM_WINDOW_MS = 15 * 60 * 1000;

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

/** Seal is attached only when the server can sign it. Otherwise the reset form stays closed. */
function redirectPasswordRecovery(request: NextRequest, userId: string) {
  const value = passwordRecoveryCookieValue(userId);
  if (!value) return null;
  const response = redirectAbsolute(request, "/auth/reset-password");
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, value, passwordRecoverySetOptions());
  return response;
}

/**
 * Google / Apple return. The PKCE exchange succeeds only in the browser that started the
 * sign-in (verifier cookie), so the session is kept — no signup-browser cookie needed.
 */
async function handleSocialCallback(request: NextRequest, code: string | null, next: string | null) {
  const failed = () =>
    redirectAbsolute(
      request,
      `/sign-in?social=error${next ? `&${SIGN_IN_NEXT_PARAM}=${encodeURIComponent(next)}` : ""}`,
    );
  if (!code) return failed();
  try {
    const supabase = await createSupabaseServerClient({ sessionOnly: false });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) return failed();
    // Same gate as signInAction: during maintenance only ADMIN keeps a session.
    const maintenance = await readSiteMaintenanceForViewer(supabase);
    if (maintenance.enabled && !maintenance.viewerIsAdmin) {
      await supabase.auth.signOut();
      return redirectAbsolute(request, "/sign-in");
    }
    let response: NextResponse;
    if (needsSocialProfileCompletion(data.user)) {
      response = redirectAbsolute(
        request,
        `${SOCIAL_FINISH_PATH}${next ? `?${SIGN_IN_NEXT_PARAM}=${encodeURIComponent(next)}` : ""}`,
      );
    } else {
      const context = await getCurrentProfile();
      const claim = context ? await tryClaimAnonTakeAfterAuth(context) : null;
      response = redirectAbsolute(request, postAuthRedirectPath(claim, next, "/account"));
    }
    // "Nie wylogowuj mnie": social sign-in keeps the session, drop an older session-only marker.
    response.cookies.set(SESSION_ONLY_COOKIE, "", {
      ...sessionOnlyCookieOptions(process.env.NODE_ENV === "production"),
      maxAge: 0,
    });
    return response;
  } catch {
    return failed();
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
 * - The reset form also needs a server-signed brd_password_recovery cookie for that user.
 *   No user or no seal → /forgot-password, and this branch does not call signOut.
 * Signup confirm (OTP signup/email, plain PKCE code): keep the session (owner decision)
 *   only when the brd_signup_browser cookie (set at sign-up) names the verified user
 *   (login-CSRF guard; other browser/device → sign out → /auth/confirmed?…&next=…)
 *   → claimed guest take (/account?claim=…) or safe `next` (query, else user_metadata
 *   signup_next) or /studio. No user / maintenance (non-admin) → /auth/confirmed?status=success&next=…
 * Other confirms (magic link / invite, unused): sign out → /auth/confirmed
 * Email change (type=email_change or flow=email_change): keep any session.
 *   The notice is a signed cookie, not a query param.
 *   No session after a successful email-change OTP is the first secure confirmation (1/2).
 *   2/2 requires that OTP to issue a session and AUTH_SECURE_EMAIL_CHANGE=on.
 *   Unset or any other value stays unknown. The env var is server-only.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("flow") === OAUTH_CALLBACK_FLOW) {
    return handleSocialCallback(
      request,
      url.searchParams.get("code"),
      safeNextPath(url.searchParams.get(SIGN_IN_NEXT_PARAM)),
    );
  }
  const classified = classifyAuthCallbackParams({
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
    flow: url.searchParams.get("flow"),
  });
  // Untrusted; only ever used through safeNextPath (same-origin relative path).
  const queryNext = safeNextPath(url.searchParams.get(SIGN_IN_NEXT_PARAM));

  if (classified.kind === "missing") {
    return redirectAbsolute(request, confirmationResultPath("error", queryNext));
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

    // Welcome e-mail once per account, after a confirmed sign-up (off unless notifications are enabled).
    let confirmedUser: { id: string; user_metadata?: Record<string, unknown> } | null = null;
    if (exchangeOk && !recovery && !isEmailChangeCallback(classified)) {
      const { data: confirmed } = await supabase.auth.getUser();
      confirmedUser = confirmed.user ?? null;
      const newUserId = confirmed.user?.email_confirmed_at ? confirmed.user.id : null;
      if (newUserId) after(() => sendWelcomeOnce(newUserId).then(() => {}));
      // Referral: (re)record from metadata (idempotent; the DB rejects old accounts) and pay it
      // if the first recording is already there (e.g. a claimed guest take).
      const referralCode = normalizeReferralCode(confirmed.user?.user_metadata?.[REFERRAL_METADATA_KEY]);
      if (newUserId && referralCode) {
        after(async () => {
          try {
            const { recordReferral, settleReferralReward } = await import("@/lib/referrals/referral-service");
            await recordReferral(newUserId, referralCode);
            await settleReferralReward(newUserId);
          } catch {
            // Best-effort; the daily sweep retries.
          }
        });
      }
    }

    // The same link opened twice (double tap, mail app preview): the first request already signed
    // this browser in, so go on instead of showing "confirmation failed".
    if (!exchangeOk && isSignupConfirmationCallback(classified) && decision.kind === "confirmed") {
      const { data } = await supabase.auth.getUser();
      const confirmedAt = Date.parse(data.user?.email_confirmed_at ?? "");
      // Only right after a confirmation: somebody else's old link must not look like a success.
      if (data.user && Date.now() - confirmedAt < REPEATED_CONFIRM_WINDOW_MS) {
        const next = resolveSignupNextPath({ queryNext, userMetadata: data.user.user_metadata ?? null });
        return redirectAbsolute(request, next ?? SIGNUP_CONFIRMED_DEFAULT_PATH);
      }
    }

    if (decision.signOut) {
      await supabase.auth.signOut();
    }

    if (decision.kind === "reset_password") {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        return redirectAbsolute(request, "/forgot-password");
      }
      const response = redirectPasswordRecovery(request, userId);
      if (!response) {
        return redirectAbsolute(request, "/forgot-password");
      }
      return response;
    }
    if (decision.kind === "forgot_password") {
      return redirectAbsolute(request, "/forgot-password");
    }
    if (decision.kind === "email_change_failed") {
      return redirectEmailChange(request, "invalid", false);
    }
    if (decision.kind === "signed_in") {
      const next = resolveSignupNextPath({
        queryNext,
        userMetadata: confirmedUser?.user_metadata ?? null,
      });
      // Login-CSRF guard: keep the session only in the browser that signed up.
      const boundBrowser = signupBrowserMatches(
        request.cookies.get(SIGNUP_BROWSER_COOKIE)?.value,
        confirmedUser?.id,
      );
      // Same gate as signInAction: during maintenance only ADMIN keeps a session.
      const maintenance = boundBrowser
        ? await readSiteMaintenanceForViewer(supabase)
        : null;
      if (!boundBrowser || (maintenance?.enabled && !maintenance.viewerIsAdmin)) {
        await supabase.auth.signOut();
        return redirectAbsolute(request, confirmationResultPath("success", next));
      }
      const context = await getCurrentProfile();
      const claim = context ? await tryClaimAnonTakeAfterAuth(context) : null;
      const response = redirectAbsolute(
        request,
        postAuthRedirectPath(claim, next, SIGNUP_CONFIRMED_DEFAULT_PATH),
      );
      response.cookies.set(
        SIGNUP_BROWSER_COOKIE,
        "",
        signupBrowserCookieOptions(process.env.NODE_ENV === "production", 0),
      );
      return response;
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
    return redirectAbsolute(request, confirmationResultPath(decision.status, queryNext));
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
    return redirectAbsolute(request, confirmationResultPath("error", queryNext));
  }
}
