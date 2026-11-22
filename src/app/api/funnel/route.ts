import { after, NextResponse } from "next/server";

import { recordFunnelEvent } from "@/lib/funnel/funnel-events";
import {
  createFunnelRateLimiter,
  FUNNEL_BODY_MAX_BYTES,
  isLikelyBot,
  parseFunnelBody,
} from "@/lib/funnel/funnel-request";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 20 clicks per minute per IP, per instance. The IP stays in memory only. */
const allow = createFunnelRateLimiter(20, 60_000);

function noContent() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/funnel — body {event:'buy_click', product, tier?}.
 * Anonymous counter: no user id, IP or user agent is stored. Always cheap, never blocks payment.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > FUNNEL_BODY_MAX_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (raw.length > FUNNEL_BODY_MAX_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  const click = parseFunnelBody(raw);
  if (!click) return NextResponse.json({ ok: false }, { status: 400 });
  if (isLikelyBot(request.headers.get("user-agent"))) return noContent();
  if (!allow(clientIpFromHeaders(request.headers))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  after(() => recordFunnelEvent(click));
  return noContent();
}
