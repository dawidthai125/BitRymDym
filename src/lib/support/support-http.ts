import "server-only";

import { NextResponse } from "next/server";

/** JSON answers shared by the support routes. Same-origin only: a foreign page must not post for the user. */
export function reply(result: string, extra: Record<string, unknown> = {}): NextResponse {
  const status = result === "ok" ? 200 : result === "signed_out" ? 401 : result === "forbidden" ? 403 : result === "missing" ? 404 : result === "limit" ? 429 : result === "invalid" ? 400 : 500;
  return NextResponse.json({ result, ...extra }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function foreignOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  return origin != null && new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}
