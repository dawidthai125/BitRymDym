import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { runBitekChatChain } from "@/lib/studio/bitek/chat/chain";
import { bitekProvidersFromEnv } from "@/lib/studio/bitek/chat/providers";
import { bitekQueueProvider, supabaseBitekQueueDb } from "@/lib/studio/bitek/chat/queue-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { consumeBitekQuota } from "@/lib/studio/bitek/chat/rate-limit";
import { parseBitekChatRequest } from "@/lib/studio/bitek/chat/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** BITEK chat — signed-in users only; provider chain Groq → Gemini → E3 (DB queue) → rules. */
export async function POST(request: Request) {
  let userId: string;
  try {
    const auth = await requireUser();
    userId = auth.userId;
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const parsed = parseBitekChatRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const quota = await consumeBitekQuota(supabase, createHash("sha256").update(userId).digest("hex"));
  if (!quota.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await runBitekChatChain({
    providers: bitekProvidersFromEnv(process.env, undefined, {
      e3Queue: () =>
        bitekQueueProvider({
          db: supabaseBitekQueueDb(createSupabaseAdminClient() as unknown as Parameters<typeof supabaseBitekQueueDb>[0]),
        }),
    }),
    message: parsed.value.message,
    history: parsed.value.history,
    context: parsed.value.context,
    // Metadata only — no message content, no user id.
    log: (entry) => console.info(JSON.stringify({ event: "bitek_chat", quota: quota.source, ...entry })),
  });
  return NextResponse.json({ success: true, ...result });
}
