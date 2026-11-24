import "server-only";

import { after } from "next/server";

import { requireAdminPaymentHistoryAccess } from "@/lib/admin/payment-history";
import { createFunnelRateLimiter } from "@/lib/funnel/funnel-request";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { findGuide } from "@/lib/seo/guides";
import { toolPage } from "@/lib/seo/tool-pages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseVisitHeader, VISIT_HEADER, visitPath, visitStatsFromRows, type VisitStatRow, type VisitStats } from "@/lib/visits/visit-policy";

/** A flood must not become a write flood: per address and per server instance (memory only). */
const allowAddress = createFunnelRateLimiter(20, 60_000);
const allowInstance = createFunnelRateLimiter(240, 60_000);

export async function recordVisit(path: string, source: string): Promise<boolean> {
  try {
    const { error } = await createSupabaseAdminClient().rpc("record_site_visit", { p_path: path, p_source: source });
    return !error;
  } catch {
    return false;
  }
}

/** Counts one entry after the response. Never throws: counting is best effort. */
export function countVisit(h: Headers): void {
  try {
    const visit = parseVisitHeader(h.get(VISIT_HEADER));
    if (!visit) return;
    if (!allowAddress(clientIpFromHeaders(h)) || !allowInstance("all")) return;
    const path = visitPath(visit.pathname, (section, slug) =>
      section === "poradniki" ? findGuide(slug) !== null : toolPage(slug) !== null,
    );
    after(() => recordVisit(path, visit.source));
  } catch {
    // Best effort.
  }
}

/** Entries for /admin/lejek; null when the table is not there yet. */
export async function loadVisitStats(days: number): Promise<VisitStats | null> {
  await requireAdminPaymentHistoryAccess();
  const { data, error } = await createSupabaseAdminClient().rpc("site_visit_stats", { p_days: days });
  if (error) return null;
  return visitStatsFromRows((data ?? []) as VisitStatRow[]);
}
