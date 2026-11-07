import { NextResponse } from "next/server";

import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { maxSamplesForTier } from "@/config/plan-policy";
import {
  SAMPLE_INVALID,
  SAMPLE_MAX_BYTES,
  sampleUserMessage,
  type SampleKind,
} from "@/lib/studio/samples/sample-policy";
import {
  createStudioSample,
  listMyStudioSamples,
  listPublishedStudioSamples,
} from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

function failure(error: string, details?: string[], status?: number) {
  const code =
    status ??
    (error === "UNAUTHENTICATED"
      ? 401
      : error === "FORBIDDEN" || error === "SAMPLE_FORBIDDEN"
        ? 403
        : error === "SAMPLE_NOT_FOUND"
          ? 404
          : error === "SAMPLE_TABLE_UNAVAILABLE"
            ? 503
            : 400);
  return NextResponse.json(
    { error, message: sampleUserMessage(error), details },
    { status: code },
  );
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    const scope = new URL(request.url).searchParams.get("scope");
    const result =
      scope === "catalog"
        ? await listPublishedStudioSamples(auth)
        : await listMyStudioSamples(auth);
    if (!result.ok) return failure(result.error, result.details);
    if (scope === "catalog") return NextResponse.json({ samples: result.samples });
    const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
    return NextResponse.json({
      samples: result.samples,
      cap: maxSamplesForTier(tier),
      owned: result.samples.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return failure(error.code);
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    const title = form.get("title");
    const kind = form.get("kind");
    const instrument = form.get("instrument");
    const rights = form.get("rightsAccepted");
    if (!(file instanceof File)) {
      return failure(SAMPLE_INVALID, ["file is required"]);
    }
    if (file.size > SAMPLE_MAX_BYTES) {
      return failure(SAMPLE_INVALID, ["byte size exceeds the sample cap"]);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sampleKind: SampleKind = kind === "effect" ? "effect" : "instrument";
    const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
    const result = await createStudioSample(auth, {
      title: typeof title === "string" ? title : "",
      kind: sampleKind,
      instrument: typeof instrument === "string" && instrument ? instrument : null,
      rightsAccepted: rights === "1" || rights === "true",
      bytes,
      declaredContentType: file.type || "application/octet-stream",
      cap: maxSamplesForTier(tier),
    });
    if (!result.ok) return failure(result.error, result.details);
    return NextResponse.json({ sample: result.sample });
  } catch (error) {
    if (error instanceof AuthError) return failure(error.code);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
