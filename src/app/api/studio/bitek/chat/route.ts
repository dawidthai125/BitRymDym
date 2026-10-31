import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { bitekMemoryForTier, type BitekMemoryAccess } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { runBitekChatChain } from "@/lib/studio/bitek/chat/chain";
import { bitekProvidersFromEnv } from "@/lib/studio/bitek/chat/providers";
import { bitekQueueProvider, supabaseBitekQueueDb } from "@/lib/studio/bitek/chat/queue-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { consumeBitekQuota } from "@/lib/studio/bitek/chat/rate-limit";
import { parseBitekChatRequest } from "@/lib/studio/bitek/chat/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bitekHistoryFromStore } from "@/lib/studio/bitek/store/messages";
import { appendBitekMessages, listBitekMessages } from "@/lib/studio/bitek/store/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** BITEK chat — signed-in users only; provider chain Groq → Gemini → E3 (DB queue) → rules. */
export async function POST(request: Request) {
  let userId: string;
  let auth: AuthContext;
  try {
    auth = await requireUser();
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

  // Stage 2b — BITEK belongs to the project: history comes from the DB when the store exists.
  // Gaps P0 #4 — plan-policy: Free = session memory (client history, nothing saved), Bronze+ = project memory.
  const projectId = typeof (body as { projectId?: unknown }).projectId === "string" ? (body as { projectId: string }).projectId : null;
  let history = parsed.value.history;
  let stored = false;
  let memory: BitekMemoryAccess = "session";
  if (projectId) {
    memory = bitekMemoryForTier((await resolveProductEntitlementForAuthContext(auth)).premiumTier);
  }
  if (projectId && memory === "project") {
    try {
      const store = await listBitekMessages({ ownerId: userId, projectId });
      if (store.available) {
        history = bitekHistoryFromStore(store.messages);
        stored = true;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: "not_found" }, { status: 404 });
      throw error;
    }
  }

  const result = await runBitekChatChain({
    providers: bitekProvidersFromEnv(process.env, undefined, {
      e3Queue: () =>
        bitekQueueProvider({
          db: supabaseBitekQueueDb(createSupabaseAdminClient() as unknown as Parameters<typeof supabaseBitekQueueDb>[0]),
        }),
    }),
    message: parsed.value.message,
    history,
    context: parsed.value.context,
    // Metadata only — no message content, no user id.
    log: (entry) => console.info(JSON.stringify({ event: "bitek_chat", quota: quota.source, ...entry })),
  });
  let persisted = false;
  let messageIds: { user: string; assistant: string } | undefined;
  if (projectId && stored) {
    try {
      const saved = await appendBitekMessages({
        ownerId: userId,
        projectId,
        ownerChecked: true,
        rows: [
          { role: "user", kind: "chat", content: parsed.value.message },
          {
            role: "assistant",
            kind: "chat",
            content: result.reply.slice(0, 2000) || "…",
            meta: {
              provider: result.provider,
              proposals: result.proposals,
              ...(result.jobs?.length ? { jobs: result.jobs } : {}),
              ...(result.backToMix ? { backToMix: true } : {}),
              ...(result.relative ? { relative: result.relative } : {}),
            },
          },
        ],
      });
      persisted = saved.available;
      const [u, a] = saved.messages;
      if (u && a) messageIds = { user: u.id, assistant: a.id };
    } catch {
      // Reply still goes back; history just is not saved this time.
    }
  }
  return NextResponse.json({ success: true, persisted, memory, ...(messageIds ? { messageIds } : {}), ...result });
}
