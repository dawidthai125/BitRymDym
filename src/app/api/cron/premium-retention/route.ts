/**
 * GO-PREMIUM-28 / GO-PREMIUM-72 — Premium Retention cron endpoint (INACTIVE by default).
 *
 * Auth: Authorization Bearer ${CRON_SECRET} (fail-closed if unset).
 * Default mode: dry-run (planner only). Active mutating mode requires
 * PREMIUM_RETENTION_CLEANUP_ACTIVE=1 AND ?mode=active (D25-05).
 *
 * Active (GO-72 / OD-62-03 A): passes workLimits only when env resolves to a
 * complete finite set. Incomplete/missing env → scheduler gets no workLimits
 * and fail-closes with WORK_LIMITS_* (does not invent provisional 50/25).
 * leaseTtlSeconds is NOT wired here (OD-62-06 HOLD) → LEASE_TTL_REQUIRED.
 *
 * NOT registered in vercel.json — Owner must authorize schedule separately.
 * Does not accept work IDs or cleanup-scope overrides from the client.
 */

import { NextResponse } from "next/server";

import {
  authorizePremiumRetentionCron,
  resolvePremiumRetentionCronMode,
} from "@/lib/premium/premium-retention-cron-auth";
import {
  runPremiumRetentionCleanupBatch,
  summarizePremiumRetentionBatch,
} from "@/lib/premium/premium-retention-scheduler";
import { resolvePremiumRetentionWorkLimitsFromEnv } from "@/lib/premium/premium-retention-work-limits";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authorizePremiumRetentionCron({
    authorizationHeader: request.headers.get("authorization"),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const mode = resolvePremiumRetentionCronMode({
    requestUrl: request.url,
  });

  try {
    const workLimits =
      mode === "active"
        ? resolvePremiumRetentionWorkLimitsFromEnv(process.env)
        : null;

    const result = await runPremiumRetentionCleanupBatch({
      mode,
      ...(workLimits != null ? { workLimits } : {}),
      // leaseTtlSeconds intentionally omitted until OD-62-06 Owner APPROVE + wiring GO.
    });
    return NextResponse.json({
      success: true,
      ...summarizePremiumRetentionBatch(result),
    });
  } catch {
    return NextResponse.json(
      { error: "Premium retention batch failed." },
      { status: 500 },
    );
  }
}
