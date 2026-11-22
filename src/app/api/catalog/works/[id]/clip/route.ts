import { NextResponse } from "next/server";

import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { WORK_CLIP_REDIRECT_MAX_AGE_SECONDS } from "@/lib/catalog/work-clip";
import { allowWorkClipHit, loadLiveWorkClipKey, signWorkClip } from "@/lib/catalog/work-clip-server";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

/**
 * GET — public 45 s clip of a live catalogue work (never the master). Not live / unknown → 404;
 * clip not cut yet → 404 `{ state: "pending" }` (the page shows "Fragment w przygotowaniu").
 * Rate limited per work + per client IP, then 302 to a short signed URL of the private clip;
 * the redirect may be cached privately for a few minutes so seeking does not hit us again.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const work = await findLiveCatalogWork(id).catch(() => null);
  if (!work) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  if (!(await allowWorkClipHit(work.id, clientIpFromHeaders(request.headers)).catch(() => false))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
  }
  const clip = await loadLiveWorkClipKey(work.id).catch(() => null);
  if (!clip) return NextResponse.json({ error: "clip_pending", state: "pending" }, { status: 404, headers: NO_STORE });
  const url = await signWorkClip(clip.key).catch(() => null);
  if (!url) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": `private, max-age=${WORK_CLIP_REDIRECT_MAX_AGE_SECONDS}`,
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
