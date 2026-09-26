import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  classifyAuthCallbackParams,
  confirmationResultPath,
  confirmationStatusFromAuthError,
} from "@/lib/auth/confirmation";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectToConfirmed(
  request: NextRequest,
  status: "success" | "invalid" | "error",
) {
  const path = confirmationResultPath(status);
  // Prefer canonical app origin (never put token_hash / code into this URL).
  try {
    return NextResponse.redirect(new URL(path, getSiteUrl()));
  } catch {
    return NextResponse.redirect(new URL(path, request.url));
  }
}

/**
 * Auth callback for email confirmation and other Auth redirects.
 *
 * Prefer token_hash + type → verifyOtp (cross-browser safe; no PKCE verifier).
 * Keep PKCE code → exchangeCodeForSession for flows that still use ?code=.
 * Never log token_hash, codes, or session secrets.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const classified = classifyAuthCallbackParams({
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
  });

  if (classified.kind === "missing") {
    return redirectToConfirmed(request, "error");
  }

  try {
    const supabase = await createSupabaseServerClient();

    if (classified.kind === "otp") {
      const { error } = await supabase.auth.verifyOtp({
        type: classified.type as EmailOtpType,
        token_hash: classified.tokenHash,
      });
      if (error) {
        return redirectToConfirmed(
          request,
          confirmationStatusFromAuthError(error.message),
        );
      }
    } else {
      // PKCE: only when token_hash path is absent (e.g. other Auth redirects).
      const { error } = await supabase.auth.exchangeCodeForSession(
        classified.code,
      );
      if (error) {
        return redirectToConfirmed(
          request,
          confirmationStatusFromAuthError(error.message),
        );
      }
    }

    // Do not leave the user signed in — confirmation UX ends at "Zaloguj się".
    // Role remains USER / BEGINNER_RAPPER (OD-19); no ADMIN escalation.
    await supabase.auth.signOut();

    return redirectToConfirmed(request, "success");
  } catch {
    return redirectToConfirmed(request, "error");
  }
}
