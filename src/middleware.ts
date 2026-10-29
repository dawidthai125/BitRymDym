import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Guests have no Studio (Owner 2026-10-29): pages → sign-in, APIs → 401. */
export function isGuestBlockedPath(pathname: string): "page" | "api" | null {
  if (pathname === "/studio" || pathname.startsWith("/studio/")) return "page";
  if (pathname.startsWith("/api/studio/")) return "api";
  if (pathname.startsWith("/api/takes/anon/")) return "api";
  return null;
}

/**
 * Refresh Supabase auth cookies on each request.
 * Route authorization for protected pages is enforced in Server Components / actions;
 * the guest Studio gate here is an early, cheap first line (pages re-check).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const blocked = isGuestBlockedPath(request.nextUrl.pathname);
  // Only a definite "no session" blocks; an auth outage falls through to the
  // page/API checks instead of locking signed-in users out.
  const noSession =
    !data?.user && (!error || error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403);
  if (blocked && noSession) {
    if (blocked === "api") {
      return NextResponse.json(
        { error: "Zaloguj się, aby korzystać ze Studia.", code: "LOGIN_REQUIRED" },
        { status: 401 },
      );
    }
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const target = request.nextUrl.clone();
    target.pathname = "/sign-in";
    target.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
