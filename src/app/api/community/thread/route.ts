import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { loadThread } from "@/lib/community/community-service";
import type { TargetKind } from "@/lib/community/ranking-policy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("kind");
  const kind: TargetKind | null = raw === "beat" || raw === "sample" ? raw : null;
  const id = url.searchParams.get("id") ?? "";
  if (!kind) return NextResponse.json({ result: "invalid" }, { status: 400 });
  const session = await getCurrentProfile();
  const thread = await loadThread(kind, id, session?.userId ?? null);
  return NextResponse.json(thread);
}
