import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import "server-only";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Server Supabase client (cookie-aware).
 * Use from Server Components / Server Actions / Route Handlers only.
 * No database schema or Auth flows in Phase 1.2.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv();

  if (!isConfigured || !url || !anonKey) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware can refresh sessions later (Phase 1.3).
        }
      },
    },
  });
}
