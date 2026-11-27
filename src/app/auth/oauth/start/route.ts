import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath, SIGN_IN_NEXT_PARAM } from "@/lib/auth/next-path";
import { enabledSocialProviders, OAUTH_CALLBACK_FLOW, parseSocialProvider } from "@/lib/auth/social";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Starts Google / Apple sign-in (PKCE: the verifier cookie is set here, in the browser that asked).
 * `?app=1` (iOS app): returns JSON with the provider URL for the in-app browser; the provider
 * then lands on /auth/app-return, which hands the code back to the app's own web view.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const forApp = params.get("app") === "1";
  const next = safeNextPath(params.get(SIGN_IN_NEXT_PARAM));
  const provider = parseSocialProvider(params.get("provider"));
  const enabled = enabledSocialProviders({
    configured: process.env.AUTH_SOCIAL_PROVIDERS,
    userAgent: request.headers.get("user-agent"),
  });

  const fail = () =>
    forApp
      ? NextResponse.json({ url: null }, { status: 400, headers: { "Cache-Control": "no-store" } })
      : NextResponse.redirect(new URL("/sign-in?social=error", getSiteUrl()));

  if (!provider || !enabled.includes(provider)) return fail();

  const target = new URL(forApp ? "/auth/app-return" : "/auth/callback", getSiteUrl());
  target.searchParams.set("flow", OAUTH_CALLBACK_FLOW);
  if (next) target.searchParams.set(SIGN_IN_NEXT_PARAM, next);

  try {
    const supabase = await createSupabaseServerClient({ sessionOnly: false });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: target.toString(),
        skipBrowserRedirect: true,
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
    if (error || !data.url) return fail();
    const response = forApp ? NextResponse.json({ url: data.url }) : NextResponse.redirect(data.url);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return fail();
  }
}
