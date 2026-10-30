import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // ── Maintenance mode ("Trwają prace") — admin toggle in /admin/site ──────
  const state: MaintenanceState = await maintenanceCache.get(async () => {
    const { enabled, message, until } = await readMaintenance(supabase);
    return { enabled, message, until };
  });
  if (state.enabled) {
    let isAdmin = false;
    if (data?.user) {
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
