import { headers } from "next/headers";
import { after } from "next/server";

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
    if (isLikelyBot(h.get("user-agent"))) return null;
    after(() => recordFunnelEvent({ event: "premium_view" }));
  } catch {
    // Counting is best effort.
  }
  return null;
}
