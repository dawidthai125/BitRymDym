import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import "server-only";

import { applySessionLifetime, isSessionOnly, SESSION_ONLY_COOKIE } from "@/lib/auth/keep-signed-in";
import { userAccessBearer } from "@/lib/supabase/access-bearer";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function requestUserAccessBearer(): Promise<string | null> {
  try {
    const headerList = await headers();
    return userAccessBearer(headerList.get("authorization"));
  } catch {
    return null;
  }
}

/**
 * Server Supabase client (cookie-aware).
 * Use from Server Components / Server Actions / Route Handlers only.
 * No database schema or Auth flows in Phase 1.2.
 */
export async function createSupabaseServerClient(opts: { sessionOnly?: boolean } = {}) {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv();

  if (!isConfigured || !url || !anonKey) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const bearer = await requestUserAccessBearer();
  if (bearer) {
    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  const cookieStore = await cookies();
  // "Nie wylogowuj mnie": sign-in passes the choice, later writes read the marker.
  const sessionOnly = opts.sessionOnly ?? isSessionOnly(cookieStore.get(SESSION_ONLY_COOKIE)?.value);

  return createServerClient(url, anonKey, {
    // httpOnly is left to the library default (browser client must read the session).
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, applySessionLifetime(options, sessionOnly));
          });
        } catch {
          // Called from a Server Component — middleware can refresh sessions later (Phase 1.3).
        }
      },
    },
  });
}
