import { NextResponse } from "next/server";

import { loadOwnerCatalogEntry, saveOwnerCatalog } from "@/lib/catalog/catalog-service";
import { revalidateCreatorFacts } from "@/lib/creators/creator-profile-server";
import { AuthError, requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function flag(value: unknown): boolean {
  return value === true;
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? "";
    const masterJobId = url.searchParams.get("masterJobId") ?? "";
    const loaded = await loadOwnerCatalogEntry(auth.userId, projectId, masterJobId);
    if (!loaded.enabled) return NextResponse.json({ result: "off", entry: null }, { status: 503 });
    return NextResponse.json({ result: "ok", entry: loaded.entry, older: loaded.older });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ result: "signed_out" }, { status: 401 });
    console.error("[studio-catalog] read failed", error);
    return NextResponse.json({ result: "error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json()) as {
      projectId?: unknown;
      masterJobId?: unknown;
      title?: unknown;
      publish?: unknown;
      allowRatings?: unknown;
      allowComments?: unknown;
      inRankings?: unknown;
      withdrawOlder?: unknown;
      rightsAccepted?: unknown;
    };
    if (typeof body.projectId !== "string" || typeof body.masterJobId !== "string" || typeof body.publish !== "boolean") {
      return NextResponse.json({ result: "invalid" }, { status: 400 });
    }
    const result = await saveOwnerCatalog({
      userId: auth.userId,
      projectId: body.projectId,
      masterJobId: body.masterJobId,
      title: body.title,
      publish: body.publish,
      withdrawOlder: flag(body.withdrawOlder),
      rightsAccepted: flag(body.rightsAccepted),
      consents: {
        allowRatings: flag(body.allowRatings),
        allowComments: flag(body.allowComments),
        inRankings: flag(body.inRankings),
      },
    });
    if (result === "ok") revalidateCreatorFacts(auth.userId);
    const status =
      result === "ok" || result === "checking" || result === "held"
        ? 200
        : result === "missing"
          ? 404
          : result === "off"
            ? 503
            : result === "blocked"
              ? 403
              : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ result: "signed_out" }, { status: 401 });
    console.error("[studio-catalog] save failed", error);
    return NextResponse.json({ result: "error" }, { status: 500 });
  }
}
