import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { submitContentReport } from "@/lib/rights/content-reports";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

export const runtime = "nodejs";

/**
 * Rights report for a public work, beat or sample (DSA art. 16). No account needed.
 * Body: `{ kind, id, reason, details, name, email, goodFaith: true }`. 5 per connection per hour.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const user = await getSessionUser().catch(() => null);
    const result = await submitContentReport({
      kind: body.kind,
      id: body.id,
      reason: body.reason,
      details: body.details,
      name: body.name,
      email: body.email,
      goodFaith: body.goodFaith,
      userId: user?.id ?? null,
      ip: clientIpFromHeaders(request.headers),
    });
    const status = result === "ok" ? 200 : result === "missing" ? 404 : result === "limit" ? 429 : result === "invalid" ? 400 : 500;
    return NextResponse.json({ result }, { status });
  } catch {
    return NextResponse.json({ result: "error" }, { status: 500 });
  }
}
