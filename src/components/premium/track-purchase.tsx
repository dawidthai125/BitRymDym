"use client";

import { useEffect, useRef } from "react";

import { trackEvent, type PurchaseEvent } from "@/lib/analytics/ga";

/** One "purchase" statistics event per visit (only after cookie consent); a page reload does not repeat it. */
export function TrackPurchase({ purchase }: { purchase: PurchaseEvent }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload" || nav?.type === "back_forward") return;
    trackEvent({ name: "purchase", params: purchase });
  }, [purchase]);
  return null;
}
