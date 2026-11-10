import { NextResponse } from "next/server";

import { engageKind } from "@/lib/catalog/catalog-policy";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadThread } from "@/lib/community/community-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("kind");
  const kind = engageKind(raw);
  const id = url.searchParams.get("id") ?? "";
  if (!kind) return NextResponse.json({ result: "invalid" }, { status: 400 });
  const session = await getCurrentProfile();
  const thread = await loadThread(kind, id, session?.userId ?? null);
  return NextResponse.json(thread);
}
