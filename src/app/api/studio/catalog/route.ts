import { NextResponse } from "next/server";

import { loadOwnerCatalogEntry, saveOwnerCatalog } from "@/lib/catalog/catalog-service";
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
    return NextResponse.json({ result: "ok", entry: loaded.entry });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ result: "invalid" }, { status: 401 });
    return NextResponse.json({ result: "invalid" }, { status: 500 });
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
      consents: {
        allowRatings: flag(body.allowRatings),
        allowComments: flag(body.allowComments),
        inRankings: flag(body.inRankings),
      },
    });
    const status = result === "ok" ? 200 : result === "missing" ? 404 : result === "off" ? 503 : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ result: "invalid" }, { status: 401 });
    return NextResponse.json({ result: "invalid" }, { status: 500 });
  }
}
