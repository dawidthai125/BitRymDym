import { NextResponse, type NextRequest } from "next/server";

import {
  normalizeReferralCode,
  REFERRAL_COOKIE,
  referralCookieOptions,
} from "@/lib/referrals/referral-policy";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Short referral link `/r/KOD` → home page with the 30-day `brd_ref` cookie
 * (same cookie the middleware sets for `/?ref=KOD`). An invalid code just goes home.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeReferralCode(raw);
  let target: URL;
  try {
    target = new URL("/", getSiteUrl());
  } catch {
    target = new URL("/", request.url);
  }
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, referralCookieOptions(process.env.NODE_ENV === "production"));
  }
  return response;
}
