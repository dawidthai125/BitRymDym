import { NextResponse } from "next/server";

import { readPlanPaymentsAvailable } from "@/config/plan-policy";
import { AuthError, requireUser } from "@/lib/auth/session";
import { startCheckout } from "@/lib/payments/checkout-service";
import { isP24Configured } from "@/lib/payments/p24-config";
import { isP24Redirect } from "@/lib/payments/p24-url";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const got = new URL(origin).origin;
    const site = new URL(getSiteUrl()).origin;
    const self = new URL(request.url).origin;
    return got === site || got === self;
  } catch {
    return false;
  }
}

function localeOf(value: unknown): "pl" | "en" {
  return value === "en" ? "en" : "pl";
}

export async function POST(request: Request) {
  if (!readPlanPaymentsAvailable() || !isP24Configured()) {
    return NextResponse.json({ ok: false, code: "PAYMENTS_OFF" }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, code: "ORIGIN" }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 4_000) {
    return NextResponse.json({ ok: false, code: "INVALID" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  let context;
  try {
    context = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, code: "LOGIN" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const locale = localeOf(body && typeof body === "object" ? (body as { locale?: unknown }).locale : null);
  try {
    const result = await startCheckout({ context, body, locale });
    if (!result.ok) {
      const status = result.code === "RATE" ? 429 : result.code === "PROVIDER" ? 502 : 400;
      return NextResponse.json({ ok: false, code: result.code }, { status, headers: { "cache-control": "no-store" } });
    }
    if (!isP24Redirect(result.redirectUrl)) {
      return NextResponse.json({ ok: false, code: "PROVIDER" }, { status: 502, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: true, redirectUrl: result.redirectUrl }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, code: "PROVIDER" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
