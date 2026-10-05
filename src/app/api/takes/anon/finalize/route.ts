import { NextResponse } from "next/server";

import { finalizeAnonTakeRecording } from "@/lib/takes/anon-take-transport";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * D02 / P2 anonymous take finalize after signed binary upload.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      durationSeconds?: number;
      objectKey?: string | null;
      ownerId?: string | null;
      anonymous?: boolean;
    };

    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    void body.durationSeconds;
    void body.objectKey;
    void body.ownerId;
    void body.anonymous;

    const result = await finalizeAnonTakeRecording({ takeId: body.takeId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return takeApiErrorResponse(error);
  }
}
