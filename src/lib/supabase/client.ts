import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

import { applySessionLifetime, isSessionOnly, SESSION_ONLY_COOKIE } from "@/lib/auth/keep-signed-in";

/**
 * Browser Supabase client (public anon key only).
 * Integration point for Phase 1.3+ — no schema / Auth UI in Phase 1.2.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet) {
        const sessionOnly = parseCookieHeader(document.cookie).some(
          (c) => c.name === SESSION_ONLY_COOKIE && isSessionOnly(c.value),
        );
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, applySessionLifetime(options, sessionOnly));
        });
      },
    },
  });
}
