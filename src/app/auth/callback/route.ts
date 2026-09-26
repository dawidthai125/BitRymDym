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
  // Prefer canonical app origin (never leak tokens into this URL).
  try {
    return NextResponse.redirect(new URL(path, getSiteUrl()));
  } catch {
    return NextResponse.redirect(new URL(path, request.url));
  }
}

/**
 * Supabase Auth email confirmation / PKCE callback.
 * Supports ?code= (PKCE) and ?token_hash=&type= (OTP verify).
 * Does not log tokens or codes.
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

    if (classified.kind === "pkce") {
      const { error } = await supabase.auth.exchangeCodeForSession(
        classified.code,
      );
      if (error) {
        return redirectToConfirmed(
          request,
          confirmationStatusFromAuthError(error.message),
        );
      }
    } else {
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
    }

    // Confirmation succeeded. Sign out so UX matches "zaloguj się" CTA
    // (role remains USER / BEGINNER_RAPPER — no privilege change).
    await supabase.auth.signOut();

    return redirectToConfirmed(request, "success");
  } catch {
    return redirectToConfirmed(request, "error");
  }
}
