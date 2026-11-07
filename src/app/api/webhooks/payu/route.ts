import { NextResponse } from "next/server";

import { handlePayuWebhook } from "@/lib/payments/webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16_000;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY) {
    return NextResponse.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const signature = request.headers.get("openpayu-signature") ?? request.headers.get("x-openpayu-signature");
  const outcome = await handlePayuWebhook(raw, signature);
  return NextResponse.json(outcome.body, { status: outcome.status, headers: { "cache-control": "no-store" } });
}
