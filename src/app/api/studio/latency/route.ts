import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isStudioRecordingFeatureEnabled } from "@/config/studio-recording-features";
import {
  listDeviceLatencyFor,
  saveDeviceLatencyFor,
} from "@/lib/studio/recording/recording-store-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

/** GET — my calibrated devices (profile copy of the browser-local store). */
export async function GET() {
  try {
    const auth = await requireUser();
    return NextResponse.json({ success: true, ...(await listDeviceLatencyFor(auth)) });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/** PUT {profile} — save one device's calibration. */
export async function PUT(request: Request) {
  try {
    if (!isStudioRecordingFeatureEnabled("latencyCalibration")) {
      return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
    }
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { profile?: unknown } | null;
    if (!body?.profile) return NextResponse.json({ error: "profile jest wymagane." }, { status: 400 });
    return NextResponse.json({ success: true, ...(await saveDeviceLatencyFor(auth, body.profile)) });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
