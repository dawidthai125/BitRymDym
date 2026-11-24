import { headers } from "next/headers";
import { after } from "next/server";

import { isStaffDevice } from "@/lib/analytics/consent";
import { getCurrentProfile } from "@/lib/auth/session";
import { recordFunnelEvent } from "@/lib/funnel/funnel-events";
import { isLikelyBot } from "@/lib/funnel/funnel-request";

/**
 * Counts one anonymous /premium view (funnel_events 'premium_view') after the response.
 * Renders nothing; any failure is swallowed so the page never breaks.
 */
export async function PremiumViewCounter() {
  try {
    const h = await headers();
    // Next.js prefetches send this header; they are not real views.
    if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch") return null;
    // Our own smoke/watch checks (UA "BitRymDym-smoke") and staff visits are not customers.
    if (isLikelyBot(h.get("user-agent")) || isStaffDevice(h.get("cookie"))) return null;
    const viewer = await getCurrentProfile().catch(() => null);
    if (viewer && (viewer.profile.role === "ADMIN" || viewer.profile.role === "MODERATOR")) return null;
    after(() => recordFunnelEvent({ event: "premium_view" }));
  } catch {
    // Counting is best effort.
  }
  return null;
}
