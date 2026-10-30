import { NextResponse, type NextRequest } from "next/server";

import { CATEGORY_COLUMN, notifyEnv } from "@/lib/email/notify/config";
import { writePreferences, type NotificationPreferences } from "@/lib/email/notify/server";
import { verifyUnsubscribeToken } from "@/lib/email/notify/unsubscribe-token";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Signed token → turn the category (or everything) OFF. Works without a session; can only opt out. */
async function apply(token: string | null): Promise<boolean> {
  const env = notifyEnv(process.env);
  const secret = env.enabled ? env.secret : process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const v = verifyUnsubscribeToken(secret, token);
  if (!v) return false;
  const patch: Partial<NotificationPreferences> = v.scope === "all"
    ? { email_account: false, email_moderation: false, email_studio: false }
    : { [CATEGORY_COLUMN[v.scope]]: false };
  try {
    return await writePreferences(createSupabaseAdminClient(), v.userId, patch);
  } catch {
    return false;
  }
}

/** Link in the mail footer → apply, then show the result on the account page. */
export async function GET(req: NextRequest) {
  const ok = await apply(req.nextUrl.searchParams.get("t"));
  return NextResponse.redirect(new URL(`/email/wypisano?ok=${ok ? "1" : "0"}`, getSiteUrl()), 303);
}

/** RFC 8058 one-click (List-Unsubscribe-Post) from the mail client. */
export async function POST(req: NextRequest) {
  const ok = await apply(req.nextUrl.searchParams.get("t"));
  return new NextResponse(null, { status: ok ? 200 : 400 });
}
