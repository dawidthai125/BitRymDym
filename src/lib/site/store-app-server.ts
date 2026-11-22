import "server-only";

import { cookies } from "next/headers";

import { isStoreAppCookieValue, STORE_APP_COOKIE } from "@/lib/site/store-app";

/** Server Components / route handlers: is this request from the store app (no purchases)? */
export async function isStoreApp(): Promise<boolean> {
  const jar = await cookies();
  return isStoreAppCookieValue(jar.get(STORE_APP_COOKIE)?.value);
}

/** Same check on a raw Request (route handlers that only see the request). */
export function isStoreAppRequest(request: Request): boolean {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === STORE_APP_COOKIE) {
      return isStoreAppCookieValue(decodeURIComponent(part.slice(eq + 1).trim()));
    }
  }
  return false;
}
