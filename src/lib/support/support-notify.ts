import "server-only";

import { Resend } from "resend";

import { escapeHtml } from "@/lib/email/html-escape";
import { getResendEnv } from "@/lib/email/resend-env";
import { sendNotification } from "@/lib/email/notify/server";
import { reportRecipients } from "@/lib/reports/owner-weekly-report-run";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { staffMail } from "./staff-mail";
import type { SupportKind } from "./support-policy";

type Posted = { threadId: string; userId: string; kind: SupportKind; subject: string };

/** New message from a user → the owner's inbox. Never throws, never logs addresses or text. */
export async function mailStaff(posted: Posted, body: string): Promise<void> {
  try {
    const env = getResendEnv();
    if (!env.isConfigured || !env.apiKey || !env.from) return;
    const to = await reportRecipients(createSupabaseAdminClient());
    if (!to.length) return;
    const mail = staffMail(posted, body, getSiteUrl());
    const { error } = await new Resend(env.apiKey).emails.send({
      from: env.from, to, subject: mail.subject, text: mail.text,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(mail.text)}</pre>`,
      tags: [{ name: "kind", value: "support_staff" }],
    });
    if (error) console.error("[support] staff mail failed");
  } catch {
    console.error("[support] staff mail threw");
  }
}

/** Staff reply → the user (their "Account" e-mail switch decides). */
export async function mailUser(posted: Posted, body: string): Promise<void> {
  await sendNotification({ userId: posted.userId, kind: "support_reply", data: { threadId: posted.threadId, threadSubject: posted.subject, detail: body } });
}
