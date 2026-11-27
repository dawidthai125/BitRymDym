import { type NextRequest } from "next/server";

import { safeNextPath, SIGN_IN_NEXT_PARAM } from "@/lib/auth/next-path";
import { APP_AUTH_SCHEME_URL } from "@/lib/auth/social";

/**
 * iOS app: the provider ends in the in-app browser, which does not hold the PKCE verifier.
 * Pass the one-time code back to the app (custom scheme); useless without the verifier cookie.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const out = new URLSearchParams();
  const code = params.get("code");
  if (code && /^[A-Za-z0-9._~-]{1,512}$/.test(code)) out.set("code", code);
  else out.set("error", "1");
  const next = safeNextPath(params.get(SIGN_IN_NEXT_PARAM));
  if (next) out.set(SIGN_IN_NEXT_PARAM, next);
  // URLSearchParams percent-encodes quotes and angle brackets, so the URL is safe in an attribute.
  const url = `${APP_AUTH_SCHEME_URL}?${out.toString().replace(/&/g, "&amp;")}`;
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${url}"><title>BitRymDym</title></head><body style="background:#0E0C0A;color:#F2EADB;font-family:sans-serif;text-align:center;padding:30vh 24px 0"><p><a href="${url}" style="color:inherit;font-size:20px">Wróć do aplikacji BitRymDym</a></p></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
