import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import {
  REFERRAL_COOKIE,
  REFERRAL_QUERY_PARAM,
  referralCodeToStore,
  referralCookieOptions,
} from "@/lib/referrals/referral-policy";
import { buildCsp, cspHeaderName, generateNonce, NONCE_HEADER } from "@/lib/security/csp";
import { decideStoreAppEntry, STORE_APP_COOKIE, storeAppCookieOptions } from "@/lib/site/store-app";
import { userAccessBearer } from "@/lib/supabase/access-bearer";

import {
  createMaintenanceStateCache,
  decideMaintenance,
  MAINTENANCE_ADMIN_HEADER,
  MAINTENANCE_API_ERROR,
  MAINTENANCE_HEADER,
  MAINTENANCE_PAGE_PATH,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  parseMaintenanceRpc,
  type MaintenanceState,
} from "@/lib/site/maintenance-gate";

type RpcClient = {
  rpc: (fn: "get_site_maintenance") => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

/** Per-instance flag cache (few seconds) — a toggle is near-instant, fail OPEN. */
const maintenanceCache = createMaintenanceStateCache({
  onError: (error) => {
    console.error(
      "[maintenance] flag read failed — failing open (site stays up):",
      error instanceof Error ? error.message : String(error),
    );
  },
});

async function readMaintenance(client: RpcClient) {
  const { data, error } = await client.rpc("get_site_maintenance");
  if (error) throw new Error(error.message);
  return parseMaintenanceRpc(data);
}

/** Test hook: drop the per-instance cache. */
export function resetMaintenanceCacheForTests() {
  maintenanceCache.clear();
}

function hasSpoofedMaintenanceHeaders(request: NextRequest): boolean {
  return (
    request.headers.has(MAINTENANCE_HEADER) ||
    request.headers.has(MAINTENANCE_ADMIN_HEADER)
  );
}

/** Rebuild the pass-through response with trusted maintenance headers. */
function forwardWithMaintenanceHeaders(
  request: NextRequest,
  response: NextResponse,
  flags: { enabled: boolean; isAdmin: boolean },
  rewriteTo?: URL,
): NextResponse {
  const headers = new Headers(request.headers);
  headers.delete(MAINTENANCE_HEADER);
  headers.delete(MAINTENANCE_ADMIN_HEADER);
  if (flags.enabled) headers.set(MAINTENANCE_HEADER, "1");
  if (flags.enabled && flags.isAdmin) headers.set(MAINTENANCE_ADMIN_HEADER, "1");
  const next = rewriteTo
    ? NextResponse.rewrite(rewriteTo, { request: { headers }, status: 503 })
    : NextResponse.next({ request: { headers } });
  for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
  if (rewriteTo) {
    next.headers.set("Cache-Control", "no-store");
    next.headers.set("Retry-After", String(MAINTENANCE_RETRY_AFTER_SECONDS));
    next.headers.set("X-Robots-Tag", "noindex");
  }
  return next;
}

/** A Supabase session cookie, including the chunked `.0` form. No cookie means a guest. */
function hasAuthSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"));
}

/** Guests have no Studio (Owner 2026-10-29) nor Master only: pages → sign-in, APIs → 401. */
export function isGuestBlockedPath(pathname: string): "page" | "api" | null {
  if (pathname === "/studio" || pathname.startsWith("/studio/")) return "page";
  // Master only lives on the Studio plane: same early sign-in redirect (the page re-checks).
  if (pathname === "/mastering") return "page";
  // Account areas: early sign-in redirect that keeps the address (?next=), e.g. the mail link
  // /account#powiadomienia. Pages still re-check the session and roles (admin).
  for (const area of ["/account", "/settings", "/library", "/admin"]) {
    if (pathname === area || pathname.startsWith(`${area}/`)) return "page";
  }
  if (pathname.startsWith("/api/studio/")) return "api";
  if (pathname.startsWith("/api/takes/anon/")) return "api";
  return null;
}

/**
 * Refresh Supabase auth cookies on each request.
 * Route authorization for protected pages is enforced in Server Components / actions;
 * the guest Studio gate here is an early, cheap first line (pages re-check).
 */
async function handleRequest(request: NextRequest) {
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

  const bearer = userAccessBearer(request.headers.get("authorization"));
  // Guests have no session to refresh. Skipping getUser keeps every public
  // document, cover, and tab reload off an auth round-trip.
  const shouldReadUser = Boolean(bearer) || hasAuthSessionCookie(request);
  let user: { id: string } | null = null;
  let error: { name?: string; status?: number } | null = null;
  if (shouldReadUser) {
    const result = bearer
      ? await supabase.auth.getUser(bearer)
      : await supabase.auth.getUser();
    user = result.data.user ?? null;
    error = result.error;
  }

  // ── Maintenance mode ("Trwają prace") — admin toggle in /admin/site ──────
  const state: MaintenanceState = await maintenanceCache.get(async () => {
    const { enabled, message, until } = await readMaintenance(supabase);
    return { enabled, message, until };
  });
  if (state.enabled) {
    let isAdmin = false;
    if (user) {
      try {
        isAdmin = (await readMaintenance(supabase)).viewerIsAdmin;
      } catch (roleError) {
        // Fail open like the flag itself: never lock the site on a DB blip.
        console.error(
          "[maintenance] role check failed — failing open:",
          roleError instanceof Error ? roleError.message : String(roleError),
        );
        isAdmin = true;
      }
    }
    const decision = decideMaintenance({
      state,
      pathname: request.nextUrl.pathname,
      method: request.method,
      isAdmin,
    });
    if (decision.kind === "unavailable") {
      const unavailable = NextResponse.json(
        { error: MAINTENANCE_API_ERROR, code: "MAINTENANCE" },
        {
          status: 503,
          headers: {
            "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS),
            "Cache-Control": "no-store",
          },
        },
      );
      for (const cookie of response.cookies.getAll()) unavailable.cookies.set(cookie);
      return unavailable;
    }
    if (decision.kind === "page") {
      const target = request.nextUrl.clone();
      target.pathname = MAINTENANCE_PAGE_PATH;
      target.search = "";
      return forwardWithMaintenanceHeaders(
        request,
        response,
        { enabled: true, isAdmin },
        target,
      );
    }
    response = forwardWithMaintenanceHeaders(request, response, {
      enabled: true,
      isAdmin,
    });
  } else if (hasSpoofedMaintenanceHeaders(request)) {
    response = forwardWithMaintenanceHeaders(request, response, {
      enabled: false,
      isAdmin: false,
    });
  }

  const blocked = isGuestBlockedPath(request.nextUrl.pathname);
  // Only a definite "no session" blocks; an auth outage falls through to the
  // page/API checks instead of locking signed-in users out.
  const noSession =
    !user && (!error || error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403);
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

/**
 * Entry point: per-request CSP nonce. The nonce + CSP go onto the *request*
 * headers (Next.js reads the nonce from them while rendering and stamps its own
 * scripts) and the CSP goes onto every response. Maintenance/auth logic lives
 * untouched in handleRequest.
 */
export async function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const headerName = cspHeaderName();
  const csp = buildCsp({ nonce });
  // Store app entry (`/?app=android|ios`): remember the platform (cookie) and drop the param.
  const storeEntry = decideStoreAppEntry({ method: request.method, url: request.nextUrl });
  if (storeEntry) {
    const redirect = NextResponse.redirect(storeEntry.redirectTo);
    redirect.headers.set("Cache-Control", "no-store");
    redirect.headers.set(headerName, csp);
    const secure = process.env.NODE_ENV === "production";
    if (storeEntry.kind === "set") {
      redirect.cookies.set(STORE_APP_COOKIE, storeEntry.platform, storeAppCookieOptions(secure));
    } else {
      redirect.cookies.set(STORE_APP_COOKIE, "", { ...storeAppCookieOptions(secure), maxAge: 0 });
    }
    return redirect;
  }
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set(headerName, csp);
  const response = await handleRequest(new NextRequest(request, { headers }));
  response.headers.set(headerName, csp);
  // "Zaproś znajomego": `?ref=KOD` on any page → 30-day cookie, read at sign-up.
  const referral = referralCodeToStore({
    method: request.method,
    pathname: request.nextUrl.pathname,
    refParam: request.nextUrl.searchParams.get(REFERRAL_QUERY_PARAM),
    currentCookie: request.cookies.get(REFERRAL_COOKIE)?.value,
  });
  if (referral) {
    response.cookies.set(
      REFERRAL_COOKIE,
      referral,
      referralCookieOptions(process.env.NODE_ENV === "production"),
    );
  }
  return response;
}

// `.well-known/` (assetlinks.json for the Android TWA) bypasses middleware: it must stay a plain
// 200 application/json even in maintenance mode (no rewrite, no redirect).
export const config = {
  matcher: [
    // sw.js + manifest.webmanifest: static PWA files; .well-known/assetlinks.json for the Android app.
    // No redirect / rewrite / maintenance gate on any of them.
    "/((?!_next/static|_next/image|workers/|\\.well-known/|favicon.ico|sw\\.js$|manifest\\.webmanifest$|api/beats/[^/]+/cover$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|wav|ogg|m4a)$).*)",
  ],
};
