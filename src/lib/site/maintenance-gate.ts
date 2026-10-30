/**
 * Maintenance mode ("Trwają prace") — pure gating rules shared by middleware,
 * pages and tests. Edge-safe: no server-only imports, no Node APIs.
 *
 * SSOT for the flag is `public.site_settings` (read via RPC
 * `get_site_maintenance`). This module only decides what a request may do.
 */

export const MAINTENANCE_PAGE_PATH = "/maintenance" as const;

/** Request headers set by middleware (never trusted from the client). */
export const MAINTENANCE_HEADER = "x-brd-maintenance" as const;
export const MAINTENANCE_ADMIN_HEADER = "x-brd-maintenance-admin" as const;

/** Seconds a client should wait before retrying a 503. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 120;

/** Short in-memory cache so an admin toggle is effective within seconds. */
export const MAINTENANCE_CACHE_TTL_MS = 5_000;

export const MAINTENANCE_API_ERROR =
  "Trwają prace techniczne. Spróbuj ponownie później.";
export const MAINTENANCE_SIGN_IN_ERROR =
  "Trwają prace techniczne — logowanie jest teraz dostępne tylko dla administratorów.";
export const MAINTENANCE_SIGN_UP_ERROR =
  "Rejestracja jest wstrzymana na czas prac technicznych.";

export type MaintenanceState = {
  enabled: boolean;
  message: string | null;
  /** ISO timestamp of the expected end, if the admin set one. */
  until: string | null;
};

export const MAINTENANCE_OFF: MaintenanceState = Object.freeze({
  enabled: false,
  message: null,
  until: null,
});

/**
 * Exact paths and prefixes that keep working during maintenance for everyone:
 * admin panel + its APIs (role-checked there), sign-in and password recovery,
 * Supabase auth callbacks, the maintenance page itself, crawler files,
 * health, cron and the E3 worker / payment webhook endpoints, the e-mail
 * unsubscribe endpoint + its confirmation page (links in sent mail must keep
 * working) and the share-card images (crawlers). The pages behind those
 * images (/beat/[id], /listen/[token]) stay gated.
 */
const EXEMPT_EXACT = new Set<string>([
  MAINTENANCE_PAGE_PATH,
  "/sign-in",
  "/forgot-password",
  "/robots.txt",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/manifest.webmanifest",
  "/api/health",
  "/api/email/unsubscribe",
  "/email/wypisano",
]);

const EXEMPT_PREFIXES = [
  "/admin/",
  "/auth/",
  "/_next/",
  "/api/admin/",
  "/api/cron/",
  "/api/mix/worker/",
  "/api/webhooks/",
  "/api/health/",
  "/bitek/",
  "/brand/",
  "/demo/",
] as const;

/** Share-card images only: /beat/<id>/(opengraph|twitter)-image, /listen/<token>/… */
const SHARE_IMAGE_RE = /^\/(?:beat|listen)\/[^/]+\/(?:opengraph|twitter)-image$/;

/** Public static files (fonts, images, audio worklets served from /public). */
const STATIC_FILE_RE =
  /\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|css|map|txt|xml|webmanifest)$/i;

export type MaintenancePathKind = "exempt" | "api" | "page";

export function classifyMaintenancePath(pathname: string): MaintenancePathKind {
  if (pathname === "/admin" || EXEMPT_EXACT.has(pathname)) return "exempt";
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return "exempt";
  if (SHARE_IMAGE_RE.test(pathname)) return "exempt";
  if (STATIC_FILE_RE.test(pathname) && !pathname.startsWith("/api/")) {
    return "exempt";
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) return "api";
  return "page";
}

export type MaintenanceDecision =
  /** Let the request through untouched (site up, admin, or exempt path). */
  | { kind: "pass" }
  /** Show the branded maintenance page (GET/HEAD page navigations). */
  | { kind: "page" }
  /** JSON 503 for APIs and non-GET page requests (server actions). */
  | { kind: "unavailable" };

export function decideMaintenance(input: {
  state: Pick<MaintenanceState, "enabled">;
  pathname: string;
  method: string;
  isAdmin: boolean;
}): MaintenanceDecision {
  if (!input.state.enabled || input.isAdmin) return { kind: "pass" };
  const kind = classifyMaintenancePath(input.pathname);
  if (kind === "exempt") return { kind: "pass" };
  if (kind === "api") return { kind: "unavailable" };
  const method = input.method.toUpperCase();
  return method === "GET" || method === "HEAD"
    ? { kind: "page" }
    : { kind: "unavailable" };
}

/** Normalise the RPC payload; anything unexpected reads as "site up". */
export function parseMaintenanceRpc(raw: unknown): MaintenanceState & {
  viewerIsAdmin: boolean;
} {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const message =
    typeof o.message === "string" && o.message.trim() ? o.message.trim() : null;
  const until =
    typeof o.until === "string" && !Number.isNaN(Date.parse(o.until)) ? o.until : null;
  return {
    enabled: o.enabled === true,
    message,
    until,
    viewerIsAdmin: o.viewerIsAdmin === true,
  };
}

/**
 * Tiny TTL cache around the flag fetch. Fails OPEN: on any error the site
 * stays up (state OFF) and the error is reported via `onError`; the failure
 * is cached for the same TTL so an outage does not add latency per request.
 */
export function createMaintenanceStateCache(opts: {
  ttlMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}) {
  const ttl = opts.ttlMs ?? MAINTENANCE_CACHE_TTL_MS;
  const now = opts.now ?? Date.now;
  let entry: { at: number; state: MaintenanceState } | null = null;
  let inflight: Promise<MaintenanceState> | null = null;

  /** `fetchState` runs only on a cache miss (per-request client is fine). */
  async function get(
    fetchState: () => Promise<MaintenanceState>,
  ): Promise<MaintenanceState> {
    if (entry && now() - entry.at < ttl) return entry.state;
    if (inflight) return inflight;
    inflight = (async () => {
      let state: MaintenanceState;
      try {
        state = await fetchState();
      } catch (error) {
        opts.onError?.(error);
        state = MAINTENANCE_OFF;
      }
      entry = { at: now(), state };
      return state;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    get,
    /** Test / same-instance invalidation after an admin toggle. */
    clear() {
      entry = null;
    },
  };
}

/** Max admin message length (DB CHECK mirrors this). */
export const MAINTENANCE_MESSAGE_MAX = 500;
