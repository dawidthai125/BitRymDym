import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/** Vercel Cron auth: `Authorization: Bearer ${CRON_SECRET}`. Returns a response to send, or null when OK. */
export function cronAuthFailure(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
