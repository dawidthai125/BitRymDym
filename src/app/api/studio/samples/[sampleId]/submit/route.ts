import { NextResponse } from "next/server";

import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { parseConsentPatch } from "@/lib/community/consents";
import { sampleUserMessage } from "@/lib/studio/samples/sample-policy";
import { submitStudioSample } from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

/** Publishing to the user catalog is Bronze+ (owner decision 2026-11-20); Free keeps samples private. */
const SAMPLE_PUBLISH_MIN_TIERS = ["BRONZE", "SILVER", "GOLD"] as const;
const SAMPLE_PUBLISH_TIER_MESSAGE =
  "Publikacja sampli w katalogu jest od planu Bronze. Na planie Free sample zostają prywatne.";

export async function POST(
  request: Request,
  context: { params: Promise<{ sampleId: string }> },
) {
  try {
    const auth = await requireUser();
    const { sampleId } = await context.params;
    const staff = auth.profile.role === "ADMIN" || auth.profile.role === "MODERATOR";
    if (!staff) {
      const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
      if (!(SAMPLE_PUBLISH_MIN_TIERS as readonly string[]).includes(tier)) {
        return NextResponse.json(
          { error: "SAMPLE_PLAN_REQUIRED", message: SAMPLE_PUBLISH_TIER_MESSAGE },
          { status: 403 },
        );
      }
    }
    const body: unknown = await request.json().catch(() => null);
    const result = await submitStudioSample(auth, sampleId, parseConsentPatch(body) ?? {});
    if (!result.ok) {
      const status =
        result.error === "SAMPLE_NOT_FOUND"
          ? 404
          : result.error === "SAMPLE_FORBIDDEN"
            ? 403
            : result.error === "SAMPLE_TABLE_UNAVAILABLE"
              ? 503
              : 400;
      return NextResponse.json(
        { error: result.error, message: sampleUserMessage(result.error), details: result.details },
        { status },
      );
    }
    return NextResponse.json({ sample: result.sample });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
