import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { engageKind } from "@/lib/catalog/catalog-policy";
import { parseConsentPatch } from "@/lib/community/consents";
import { updateMyListing } from "@/lib/community/listing-service";

export const runtime = "nodejs";

const PAGES = {
  beat: ["/beats", "/ranking"],
  sample: ["/sampel", "/ranking/sampel"],
  work: ["/utwory", "/ranking/utwor"],
} as const;
const DETAIL = { beat: "/beat", sample: "/sampel", work: "/utwor" } as const;

/** Owner switches of one beat, sample or finished track. Body: { kind, id, consents }. */
export async function PATCH(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { kind?: unknown; id?: unknown; consents?: unknown } | null;
    const kind = engageKind(body?.kind);
    const patch = parseConsentPatch(body?.consents);
    if (!kind || typeof body?.id !== "string" || !patch) {
      return NextResponse.json({ result: "invalid" }, { status: 400 });
    }
    const saved = await updateMyListing(auth, kind, body.id, patch);
    if (saved.result === "ok") {
      for (const path of PAGES[kind]) revalidatePath(path);
      revalidatePath(`${DETAIL[kind]}/${body.id}`);
    }
    const status = saved.result === "ok" ? 200 : saved.result === "missing" ? 404 : saved.result === "off" ? 503 : 400;
    return NextResponse.json(saved, { status });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ result: "invalid" }, { status: 401 });
    console.error("[account/listings]", error instanceof Error ? error.message : error);
    return NextResponse.json({ result: "invalid" }, { status: 500 });
  }
}
