import { NextResponse } from "next/server";

import {
  allowListenHit,
  countListenPlay,
  downloadListenObject,
  listenObjectKeys,
  lookupListenToken,
  signListenObject,
} from "@/lib/studio/listen/listen-server";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { LISTEN_SIGNED_URL_SECONDS } from "@/lib/studio/listen/listen-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ token: string }> };

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

/**
 * GET — public (no auth) audio of a private listen link. Unknown / expired / revoked → 404.
 * Rate limited per link + per client IP. A single object → 302 to a 60 s signed URL;
 * a master stored as parts → streamed through here in order (no Range support).
 */
export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const ip = clientIpFromHeaders(request.headers);
  const lookup = await lookupListenToken(token, ip).catch(() => ({ status: "not_found" as const }));
  if (lookup.status === "limited") {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "600" } });
  }
  if (lookup.status !== "ok") return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const link = lookup.link;
  if (!(await allowListenHit(link.linkId, ip).catch(() => false))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
  }
  const range = request.headers.get("range");
  if (!range || /^bytes=0-/.test(range)) void countListenPlay(link.linkId).catch(() => undefined);
  const keys = await listenObjectKeys(link.objectKey);
  if (keys.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  if (keys.length === 1) {
    const url = await signListenObject(keys[0]!, LISTEN_SIGNED_URL_SECONDS);
    if (!url) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  }
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const key = keys.shift();
      if (!key) return controller.close();
      const blob = await downloadListenObject(key);
      if (!blob) return controller.error(new Error("part_missing"));
      controller.enqueue(new Uint8Array(await blob.arrayBuffer()));
    },
  });
  return new Response(stream, { status: 200, headers: { ...NO_STORE, "Content-Type": "audio/flac", "Content-Disposition": "inline" } });
}
