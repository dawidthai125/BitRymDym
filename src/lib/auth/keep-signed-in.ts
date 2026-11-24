/**
 * "Nie wylogowuj mnie" on sign-in (pure). Default = keep: session cookies live 400 days.
 * Unticked: a marker cookie makes every writer (action, middleware, browser client) store the
 * session without an expiry, so it ends when the browser closes. The marker has the same lifetime.
 */
export const SESSION_ONLY_COOKIE = "brd_session_only";
export const KEEP_SIGNED_IN_FIELD = "keepSignedIn";
/** Sent with the form so "unticked" differs from a form without the option (older page, app). */
export const KEEP_SIGNED_IN_SHOWN_FIELD = "keepSignedInShown";

/** Re-stamp only a token that is far from its refresh, so a parallel refresh is never overwritten. */
export const RESTAMP_MIN_TOKEN_SECONDS = 600;

export function wantsSessionOnly(formData: FormData): boolean {
  return formData.get(KEEP_SIGNED_IN_SHOWN_FIELD) === "1" && formData.get(KEEP_SIGNED_IN_FIELD) !== "on";
}

export function isSessionOnly(value: string | null | undefined): boolean {
  return value === "1";
}

export function sessionOnlyCookieOptions(secure: boolean) {
  return { path: "/", sameSite: "lax" as const, secure };
}

/** Removals (maxAge 0) stay as they are; a session-only write loses its expiry. */
export function applySessionLifetime<T extends { maxAge?: number; expires?: Date }>(
  options: T,
  sessionOnly: boolean,
): T {
  if (!sessionOnly || options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

/** Full page load (not data, prefetch or API). */
export function isDocumentRequest(method: string, headers: Headers): boolean {
  return method === "GET" && headers.get("sec-fetch-dest") === "document" && !headers.get("purpose") && !headers.get("sec-purpose");
}

const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Session cookies to write again with a full lifetime; none for a session-only choice or an old token. */
export function restampedSessionCookies(
  cookies: { name: string; value: string }[],
  nowSeconds = Math.floor(Date.now() / 1000),
): { name: string; value: string; maxAge: number }[] {
  if (cookies.some((c) => c.name === SESSION_ONLY_COOKIE && isSessionOnly(c.value))) return [];
  const chunks = cookies
    .map((c) => ({ c, m: /^sb-.+-auth-token(?:\.(\d+))?$/.exec(c.name) }))
    .filter((x): x is { c: { name: string; value: string }; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1] ?? 0) - Number(b.m[1] ?? 0));
  if (chunks.length === 0) return [];
  const raw = chunks.map((x) => x.c.value).join("");
  if (!raw.startsWith("base64-")) return [];
  try {
    const json = atob(raw.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/"));
    const expiresAt = (JSON.parse(json) as { expires_at?: unknown }).expires_at;
    if (typeof expiresAt !== "number" || expiresAt - nowSeconds < RESTAMP_MIN_TOKEN_SECONDS) return [];
  } catch {
    return [];
  }
  return chunks.map((x) => ({ ...x.c, maxAge: SESSION_MAX_AGE_SECONDS }));
}
